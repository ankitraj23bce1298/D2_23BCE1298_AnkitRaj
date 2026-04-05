// src/services/userService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

const FAMILIES_KEY = '@TS_FAMILIES_V1';
const USERS_KEY = '@TS_USERS_V1'; // local fallback if you still want

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('readJson error', e);
    return fallback;
  }
}
async function writeJson(key, obj) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(obj));
  } catch (e) {
    console.warn('writeJson error', e);
  }
}

export default {
  // Try backend first, fallback to local family creation
  async createFamily() {
    try {
      const r = await apiFetch('/family/create', { method: 'POST' });
      if (r.ok && r.body && r.body.code) return { code: r.body.code };
    } catch (e) {
      // network issue - fall through to local create
    }

    const families = await readJson(FAMILIES_KEY, {});
    const familyId = Math.random().toString(36).substr(2, 6).toUpperCase();
    families[familyId] = {
      familyId,
      createdAt: Date.now(),
      members: [],
      nodeOwner: null,
    };
    await writeJson(FAMILIES_KEY, families);
    return { code: familyId };
  },

  // Join family via backend if possible, fallback to local
  async joinFamily(userId, familyId) {
    try {
      const r = await apiFetch(`/family/join/${familyId}`, { method: 'POST' });
      if (r.ok) return r.body;
    } catch (e) {
      // fallback
    }

    const families = await readJson(FAMILIES_KEY, {});
    if (!families[familyId]) throw new Error('Family not found (local fallback)');
    const members = families[familyId].members || [];
    if (!members.includes(userId)) members.push(userId);
    families[familyId].members = members;
    await writeJson(FAMILIES_KEY, families);
    return families[familyId];
  },

  // Get members from backend then fallback to local demo data
  async getFamilyMembersProfiles(familyId) {
    try {
      const r = await apiFetch(`/family/${familyId}/members`, { method: 'GET' });
      if (r.ok && r.body) return r.body;
    } catch (e) {
      // ignore
    }

    const users = await readJson(USERS_KEY, {});
    const families = await readJson(FAMILIES_KEY, {});
    const f = families[familyId];
    if (!f) {
      // demo fallback
      return [
        { id: 'u_demo', name: 'Demo User', phone: '9999999999', latitude: 28.6139, longitude: 77.2090 },
      ];
    }
    return (f.members || []).map((id) => ({ id, ...(users[id] || { name: 'Unknown' }) }));
  },

  // local storage helpers for debugging/dev
  async clearAll() {
    await AsyncStorage.removeItem(USERS_KEY);
    await AsyncStorage.removeItem(FAMILIES_KEY);
  },
};
