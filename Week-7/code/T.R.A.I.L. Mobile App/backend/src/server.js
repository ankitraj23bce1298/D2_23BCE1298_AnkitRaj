// backend/src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// ---- i18n setup ----
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const i18nMiddleware = require('i18next-http-middleware');
const i18nextICU = require('i18next-icu');

const SUPPORTED_LANGS = ['en','hi','bn','te','mr','ta','gu','kn','ml','pa','or','ur'];

i18next
  .use(Backend)
  .use(i18nextICU)
  .use(i18nMiddleware.LanguageDetector)
  .init({
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS,
    ns: ['common'],
    defaultNS: 'common',
    backend: {
      loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
      addPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.missing.json'),
    },
    detection: {
      order: ['querystring', 'header', 'cookie'],
      lookupQuerystring: 'lang',
      caches: ['cookie'],
      cookieMinutes: 60 * 24 * 365,
    },
    interpolation: { escapeValue: false },
    cleanCode: true,
    returnEmptyString: false,
  });

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'devsecret' || JWT_SECRET.length < 32) {
  console.error("FATAL ERROR: Invalid JWT_SECRET.");
  process.exit(1);
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// i18n middleware must come before routes
app.use(i18nMiddleware.handle(i18next));

console.log('Loaded DATABASE_URL from env:', process.env.DATABASE_URL && process.env.DATABASE_URL.slice(0, 80) + '...');

function stripUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

async function attachUserLocale(req, _res, next) {
  try {
    if (req.userId) {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { locale: true } });
      if (user?.locale && SUPPORTED_LANGS.includes(user.locale)) {
        req.i18n.changeLanguage(user.locale);
      }
    }
  } catch {}
  next();
}

// ---------------- PUBLIC: health / langs ----------------
app.get('/health', (req, res) => {
  return res.json({ ok: true, message: req.t('ok', { defaultValue: 'OK' }), lang: req.language || 'en' });
});

app.get('/i18n/languages', (_req, res) => {
  res.json({ supported: SUPPORTED_LANGS });
});

// ---------------- AUTH ----------------
app.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password, locale } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: req.t('missing_fields', { defaultValue: 'Missing fields' }) });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: req.t('email_exists', { defaultValue: 'Email already registered' }) });
    }
    const userLocale = SUPPORTED_LANGS.includes(locale) ? locale : 'en';
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, password: hash, locale: userLocale } });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: stripUser(user) });
  } catch (e) {
    console.error('[SIGNUP ERROR]', e);
    res.status(500).json({ message: req.t('signup_error', { defaultValue: 'Signup error' }), error: e.message });
  }
});

app.post('/auth/login', async (req, res) => {
  let email;
  try {
    email = req.body.email;
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: req.t('missing_credentials', { defaultValue: 'Missing credentials' }) });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: req.t('invalid_credentials', { defaultValue: 'Invalid credentials' }) });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: req.t('invalid_credentials', { defaultValue: 'Invalid credentials' }) });

    if (user.locale && SUPPORTED_LANGS.includes(user.locale)) req.i18n.changeLanguage(user.locale);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: stripUser(user), welcome: req.t('welcome_user', { name: user.name || 'User', defaultValue: 'Welcome, {{name}}!' }) });
  } catch (e) {
    console.error(`[LOGIN ERROR] for email: ${email || 'unknown'}`, e);
    res.status(500).json({ message: req.t('login_error', { defaultValue: 'Login error' }), error: e.message });
  }
});

// ---------------- AUTH MIDDLEWARE ----------------
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: req.t('missing_or_malformed_token', { defaultValue: 'Missing or malformed token' }) });
  }
  try {
    const token = header.replace('Bearer ', '');
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    console.error('[AUTH ERROR]', err.name);
    return res.status(401).json({ message: req.t('invalid_token', { defaultValue: 'Invalid token' }), error: err.message });
  }
}

// ---------------- PROFILES ----------------
app.get('/profiles/me', authMiddleware, attachUserLocale, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    res.json(stripUser(user));
  } catch (e) {
    console.error(`[GET /profiles/me ERROR] for user: ${req.userId}`, e);
    res.status(500).json({ message: req.t('profile_fetch_failed', { defaultValue: 'Failed to fetch profile' }), error: e.message });
  }
});

app.put('/profiles/me', authMiddleware, attachUserLocale, async (req, res) => {
  try {
    const allowed = [
      'name','phone','aadhar','address','destination',
      'emergencyContacts','kycCompleted','peopleCount','lastLocation','locale'
    ];
    const data = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) data[k] = req.body[k];
    }
    if (data.locale && !SUPPORTED_LANGS.includes(data.locale)) {
      return res.status(400).json({ message: req.t('unsupported_language', { defaultValue: 'Unsupported language' }) });
    }
    if (data.emergencyContacts && typeof data.emergencyContacts === 'string') {
      data.emergencyContacts = data.emergencyContacts.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (data.lastLocation && typeof data.lastLocation === 'string') {
      try { data.lastLocation = JSON.parse(data.lastLocation); } catch {}
    }
    const updated = await prisma.user.update({ where: { id: req.userId }, data });
    if (updated.locale && SUPPORTED_LANGS.includes(updated.locale)) req.i18n.changeLanguage(updated.locale);
    res.json(stripUser(updated));
  } catch (e) {
    console.error(`[PUT /profiles/me ERROR] for user: ${req.userId}`, e);
    res.status(500).json({ message: req.t('profile_update_failed', { defaultValue: 'Failed to update profile' }), error: e.message });
  }
});

// ---------------- FAMILY ----------------
app.post('/family/create', authMiddleware, attachUserLocale, async (req, res) => {
  try {
    const code = `FAM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const family = await prisma.family.create({ data: { code, ownerId: req.userId } });
    await prisma.user.update({ where: { id: req.userId }, data: { familyId: code, isFamilyOwner: true } });
    res.json({ success: true, code, family });
  } catch (e) {
    console.error(`[FAMILY CREATE ERROR] for user: ${req.userId}`, e);
    res.status(500).json({ message: req.t('family_create_failed', { defaultValue: 'Failed to create family' }), error: e.message });
  }
});

app.post('/family/join/:code', authMiddleware, attachUserLocale, async (req, res) => {
  try {
    const { code } = req.params;
    const family = await prisma.family.findUnique({ where: { code } });
    if (!family) return res.status(404).json({ message: req.t('family_not_found', { defaultValue: 'Family not found' }) });
    await prisma.user.update({ where: { id: req.userId }, data: { familyId: code, isFamilyOwner: false } });
    res.json({ success: true, code });
  } catch (e) {
    console.error(`[FAMILY JOIN ERROR] for user: ${req.userId} with code: ${req.params.code}`, e);
    res.status(500).json({ message: req.t('family_join_failed', { defaultValue: 'Failed to join family' }), error: e.message });
  }
});

app.get('/family/:code/members', authMiddleware, attachUserLocale, async (req, res) => {
  try {
    const { code } = req.params;
    const requestingUser = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!requestingUser || requestingUser.familyId !== code) {
      return res.status(403).json({ message: req.t('not_family_member', { defaultValue: 'Forbidden: You are not a member of this family.' }) });
    }
    const members = await prisma.user.findMany({
      where: { familyId: code },
      select: {
        id: true, name: true, phone: true, aadhar: true, address: true,
        destination: true, emergencyContacts: true, familyId: true, isFamilyOwner: true,
        kycCompleted: true, peopleCount: true, lastLocation: true, createdAt: true, updatedAt: true,
      },
    });
    res.json(members);
  } catch (e) {
    console.error(`[FAMILY MEMBERS ERROR] for user: ${req.userId} and family: ${req.params.code}`, e);
    res.status(500).json({ message: req.t('family_members_failed', { defaultValue: 'Failed to fetch family members' }), error: e.message });
  }
});

app.post('/family/leave', authMiddleware, attachUserLocale, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !user.familyId) return res.status(400).json({ message: req.t('not_in_family', { defaultValue: 'You are not in a family.' }) });
    if (user.isFamilyOwner) return res.status(400).json({ message: req.t('owner_must_transfer', { defaultValue: 'Owners must promote a new owner before leaving.' }) });
    await prisma.user.update({ where: { id: req.userId }, data: { familyId: null, isFamilyOwner: false } });
    res.json({ success: true, message: req.t('left_family', { defaultValue: 'You have left the family.' }) });
  } catch (e) {
    console.error(`[FAMILY LEAVE ERROR] for user: ${req.userId}`, e);
    res.status(500).json({ message: req.t('family_leave_failed', { defaultValue: 'Failed to leave family' }), error: e.message });
  }
});

// ---------------- GEOFENCES ----------------

// PUBLIC: fetch all active geofences
app.get('/api/geofences', async (_req, res) => {
  try {
    const data = await prisma.geofence.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, path: true, active: true, createdAt: true, updatedAt: true },
    });
    res.json(data);
  } catch (e) {
    console.error('[GET /api/geofences ERROR]', e);
    res.status(500).json({ message: 'Failed to fetch geofences', error: e.message });
  }
});

// PROTECTED: create
app.post('/api/geofences', authMiddleware, async (req, res) => {
  try {
    const { name, path, active = true } = req.body;
    if (!name || !Array.isArray(path) || !path.length) {
      return res.status(400).json({ message: 'name and path[] required' });
    }
    const created = await prisma.geofence.create({ data: { name, path, active } });
    res.json(created);
  } catch (e) {
    console.error('[POST /api/geofences ERROR]', e);
    res.status(500).json({ message: 'Failed to create geofence', error: e.message });
  }
});

// PROTECTED: update
app.put('/api/geofences/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, path, active } = req.body;
    const data = {};
    if (typeof name === 'string') data.name = name;
    if (Array.isArray(path)) data.path = path;
    if (typeof active === 'boolean') data.active = active;

    const updated = await prisma.geofence.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    console.error('[PUT /api/geofences/:id ERROR]', e);
    res.status(500).json({ message: 'Failed to update geofence', error: e.message });
  }
});

// PROTECTED: delete
app.delete('/api/geofences/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.geofence.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) {
    console.error('[DELETE /api/geofences/:id ERROR]', e);
    res.status(500).json({ message: 'Failed to delete geofence', error: e.message });
  }
});

// ---------------- SERVER START ----------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on all network interfaces at port ${PORT}`);
});
