// src/screens/ProfileScreen.js
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../services/api';
import sessionService from '../services/sessionService';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Platform,
  Share,
  Linking,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';

const PROFILE_PREFIX = 'profile_';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml', label: 'മലയാളം (Malayalam)' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'or', label: 'ଓଡ଼ିଆ (Odia)' },
  { code: 'ur', label: 'اردو (Urdu)' },
];
const LANG_LABEL = Object.fromEntries(LANGS.map(l => [l.code, l.label]));

async function findStoredUid() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const pKey = keys.find((k) => typeof k === 'string' && k.startsWith(PROFILE_PREFIX));
    if (pKey) {
      const raw = await AsyncStorage.getItem(pKey);
      if (raw) {
        const p = JSON.parse(raw);
        return p?.id ?? null;
      }
    }
  } catch {}
  return null;
}

export default function ProfileScreen({ route, navigation }) {
  const { t, i18n } = useTranslation();

  const touristParam = route.params?.tourist ?? { id: 'demo', name: 'Demo User' };
  const routeUid = touristParam.id;

  const [uid, setUid] = useState(routeUid);
  const [profile, setProfile] = useState({
    id: routeUid,
    name: touristParam.name ?? 'Demo User',
    phone: '',
    aadhar: '',
    bloodGroup: '',
    allergies: '',
    address: '',
    destination: '',
    emergencyContacts: [],
    familyId: null,
    isFamilyOwner: false,
    kycCompleted: false,
    notes: '',
    peopleCount: 1,
    lastLocation: null,
    locale: 'en',
  });

  const [editVisible, setEditVisible] = useState(false);
  const [temp, setTemp] = useState(profile);
  const [langVisible, setLangVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const inMem = (sessionService && typeof sessionService.getProfile === 'function') ? sessionService.getProfile(routeUid) : null;
        if (inMem && mounted) {
          setUid(inMem.id || routeUid);
          setProfile((p) => ({ ...p, ...inMem }));
          if (inMem.locale) await i18n.changeLanguage(inMem.locale).catch(()=>{});
        }

        if ((!routeUid || routeUid === 'demo') && mounted) {
          const storedUid = await findStoredUid();
          if (storedUid) {
            setUid(storedUid);
            const local = await sessionService.loadProfileAsync(storedUid);
            if (local && mounted) {
              setProfile((p) => ({ ...p, ...local }));
              if (local.locale) await i18n.changeLanguage(local.locale).catch(()=>{});
            }
          }
        } else {
          const local = await sessionService.loadProfileAsync(routeUid);
          if (local && mounted) {
            setUid(routeUid);
            setProfile((p) => ({ ...p, ...local }));
            if (local.locale) await i18n.changeLanguage(local.locale).catch(()=>{});
          }
        }

        const token = await sessionService.getToken();
        if (token && mounted) {
          try {
            const r = await apiFetch('/profiles/me', { method: 'GET' });
            if (r.ok && r.body && mounted) {
              const serverProfile = r.body;
              if (serverProfile && serverProfile.emergencyContacts && !Array.isArray(serverProfile.emergencyContacts)) {
                try { serverProfile.emergencyContacts = JSON.parse(serverProfile.emergencyContacts); } catch { serverProfile.emergencyContacts = []; }
              }
              setUid(serverProfile.id || routeUid);
              setProfile((p) => ({ ...p, ...serverProfile }));
              if (serverProfile.locale) await i18n.changeLanguage(serverProfile.locale).catch(()=>{});
              if (sessionService?.saveProfile) {
                await sessionService.saveProfile(serverProfile.id || routeUid, serverProfile);
              }
            }
          } catch {}
        } else if (routeUid && routeUid !== 'demo') {
          try {
            const r2 = await apiFetch(`/profiles/${routeUid}`, { method: 'GET' });
            if (r2.ok && r2.body && mounted) {
              const serverProfile = r2.body;
              if (serverProfile && serverProfile.emergencyContacts && !Array.isArray(serverProfile.emergencyContacts)) {
                try { serverProfile.emergencyContacts = JSON.parse(serverProfile.emergencyContacts); } catch { serverProfile.emergencyContacts = []; }
              }
              setProfile((p) => ({ ...p, ...serverProfile }));
              if (serverProfile.locale) await i18n.changeLanguage(serverProfile.locale).catch(()=>{});
              if (sessionService?.saveProfile) {
                await sessionService.saveProfile(routeUid, serverProfile);
              }
            }
          } catch {}
        }
      } catch {}
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!editVisible) setTemp(profile); }, [profile, editVisible]);

  function openEdit() { setTemp(profile); setEditVisible(true); }

  function buildAllowedPayload(obj) {
    const payload = {};
    if (typeof obj.name === 'string') payload.name = obj.name;
    if (typeof obj.phone !== 'undefined') payload.phone = obj.phone;
    if (typeof obj.aadhar !== 'undefined') payload.aadhar = obj.aadhar;
    if (typeof obj.address !== 'undefined') payload.address = obj.address;
    if (typeof obj.destination !== 'undefined') payload.destination = obj.destination;
    if (typeof obj.emergencyContacts !== 'undefined') payload.emergencyContacts = obj.emergencyContacts;
    if (typeof obj.familyId !== 'undefined') payload.familyId = obj.familyId;
    if (typeof obj.isFamilyOwner !== 'undefined') payload.isFamilyOwner = obj.isFamilyOwner;
    if (typeof obj.kycCompleted !== 'undefined') payload.kycCompleted = obj.kycCompleted;
    if (typeof obj.peopleCount !== 'undefined') payload.peopleCount = obj.peopleCount;
    if (typeof obj.bloodGroup !== 'undefined') payload.bloodGroup = obj.bloodGroup;
    if (typeof obj.allergies !== 'undefined') payload.allergies = obj.allergies;
    if (typeof obj.notes !== 'undefined') payload.notes = obj.notes;
    if (typeof obj.lastLocation !== 'undefined') payload.lastLocation = obj.lastLocation;
    if (typeof obj.locale !== 'undefined') payload.locale = obj.locale;
    return payload;
  }

  async function saveProfile() {
    const updated = { ...profile, ...temp };
    if (typeof updated.emergencyContacts === 'string') {
      updated.emergencyContacts = updated.emergencyContacts.split(',').map(s => s.trim()).filter(Boolean);
    } else if (!Array.isArray(updated.emergencyContacts)) {
      updated.emergencyContacts = updated.emergencyContacts ? [updated.emergencyContacts] : [];
    }

    setProfile(updated);
    setEditVisible(false);

    const token = await sessionService.getToken();
    if (!token) {
      if (updated.id && sessionService?.saveProfile) {
        await sessionService.saveProfile(updated.id, updated);
      }
      Alert.alert(t('saved_locally'), t('saved_locally_sync_later'));
      return;
    }

    try {
      const payload = buildAllowedPayload(updated);
      const r = await apiFetch(`/profiles/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (r.ok) {
        const saved = r.body;
        if (saved && saved.emergencyContacts && !Array.isArray(saved.emergencyContacts)) {
          try { saved.emergencyContacts = JSON.parse(saved.emergencyContacts); } catch { saved.emergencyContacts = []; }
        }
        const sid = saved?.id || uid;
        if (sessionService?.saveProfile) {
          await sessionService.saveProfile(sid, saved || updated);
        }
        setProfile(saved || updated);
        setUid(sid);
        Alert.alert(t('saved'), t('language_updated'));
      } else {
        if (sessionService?.saveProfile) {
          await sessionService.saveProfile(uid || updated.id || 'local', updated);
        }
        Alert.alert(t('error'), r.body?.message || t('saved_locally_sync_later'));
      }
    } catch {
      if (sessionService?.saveProfile) {
        await sessionService.saveProfile(uid || updated.id || 'local', updated);
      }
      Alert.alert(t('saved_locally'), t('saved_locally_sync_later'));
    }
  }

  function copyToClipboard(text, label = t('copy')) {
    try {
      const Clipboard = require('react-native').Clipboard || (require('@react-native-clipboard/clipboard').default);
      if (Clipboard?.setString) Clipboard.setString(String(text ?? ''));
    } catch {}
    finally { Alert.alert(label, String(text ?? '')); }
  }

  async function shareProfile() {
    try {
      const shareText = `${t('profile')} — ${profile.name}\n${t('id')}: ${profile.id}\n${t('phone')}: ${profile.phone || 'N/A'}\nFamily ID: ${profile.familyId ?? 'N/A'}`;
      await Share.share({ message: shareText, title: 'My Digital Tourist ID' });
    } catch { Alert.alert(t('error'), 'Unable to share at this time.'); }
  }

  function callNumber(phone) {
    if (!phone) { Alert.alert(t('error'), t('phone') + ' N/A'); return; }
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then(s => s ? Linking.openURL(url) : Alert.alert(t('error'), 'Not supported')).catch(() => Alert.alert(t('error'), 'Unable to start a call.'));
  }

  function smsNumber(phone) {
    if (!phone) { Alert.alert(t('error'), t('phone') + ' N/A'); return; }
    const url = `sms:${phone}`;
    Linking.canOpenURL(url).then(s => s ? Linking.openURL(url) : Alert.alert(t('error'), 'Not supported')).catch(() => Alert.alert(t('error'), 'Unable to open SMS app.'));
  }

  // ✅ Language change — resilient (UI changes even if server fails)
  async function onChangeLanguage(langCode) {
    setLangVisible(false);

    try {
      await i18n.changeLanguage(langCode);
    } catch (err) {
      Alert.alert(t('error'), `i18n: ${err?.message || 'changeLanguage failed'}`);
      return;
    }

    const next = { ...profile, locale: langCode };
    setProfile(next);
    if (sessionService?.saveProfile) {
      const id = next.id || uid || 'local';
      await sessionService.saveProfile(id, next);
    }

    try {
      const token = await sessionService.getToken();
      if (token) {
        const r = await apiFetch('/profiles/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: langCode }),
        });
        if (!r.ok) throw new Error(r.body?.message || 'Server error');
      }
      Alert.alert(t('language_updated'), t('language_set_to', { lang: LANG_LABEL[langCode] || langCode }));
    } catch {
      Alert.alert(t('saved_locally'), t('saved_locally_could_not_sync'));
    }
  }

  function renderEmergencyContacts() {
    if (!profile.emergencyContacts || profile.emergencyContacts.length === 0) {
      return <Text style={styles.muted}>{t('no_emergency_contacts')}</Text>;
    }
    return profile.emergencyContacts.map((p, i) => (
      <View key={`ec-${i}`} style={styles.contactRow}>
        <View style={styles.contactLeft}>
          <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{String(p || '').charAt(0).toUpperCase() || 'E'}</Text></View>
          <Text style={styles.contactPhone}>{p}</Text>
        </View>
        <View style={styles.contactActions}>
          <TouchableOpacity style={styles.smallAction} onPress={() => callNumber(p)}><Text style={styles.smallActionText}>📞</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.smallAction, { marginLeft: 8 }]} onPress={() => smsNumber(p)}><Text style={styles.smallActionText}>✉️</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.smallAction, { marginLeft: 8 }]} onPress={() => copyToClipboard(p, t('copy'))}><Text style={styles.smallActionText}>📋</Text></TouchableOpacity>
        </View>
      </View>
    ));
  }

  const currentLangLabel = LANG_LABEL[profile.locale] || LANG_LABEL[i18n.language] || 'English';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>{t('profile')}</Text>
            <Text style={styles.headerSubtitle}>{t('digital_tourist_id')}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.iconBtn, { marginRight: 10 }]} onPress={() => setLangVisible(true)}>
            <Text style={styles.iconBtnText}>{currentLangLabel.split(' ')[0]}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={openEdit}><Text style={styles.iconBtnText}>{t('edit')}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { marginLeft: 10 }]} onPress={shareProfile}><Text style={styles.iconBtnText}>{t('share')}</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.avatarLarge}><Text style={styles.avatarLargeText}>{(profile.name || '?').charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.nameLarge}>{profile.name}</Text>
              <Text style={styles.subtle}>{t('id')}: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{profile.id}</Text></Text>
              <View style={{ flexDirection: 'row', marginTop: 10 }}>
                <TouchableOpacity style={styles.primarySmall} onPress={() => copyToClipboard(profile.id, t('copy_id'))}>
                  <Text style={styles.primarySmallText}>{t('copy_id')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primarySmall, { marginLeft: 10 }]} onPress={() => {
                  if (profile.familyId) {
                    Share.share({ message: `${t('share_family')}: ${profile.familyId}` }).catch(()=>{});
                  } else {
                    Alert.alert(t('error'), t('no_family'));
                  }
                }}>
                  <Text style={styles.primarySmallText}>{t('share_family')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Language row */}
          <View style={styles.profileRow}>
            <Text style={styles.label}>{t('language')}</Text>
            <View style={styles.rowActions}>
              <Text style={styles.value}>{currentLangLabel}</Text>
              <TouchableOpacity style={styles.iconGhost} onPress={() => setLangVisible(true)}>
                <Text style={styles.iconGhostText}>🌐</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          <View style={styles.profileRow}>
            <Text style={styles.label}>{t('phone')}</Text>
            <View style={styles.rowActions}>
              <Text style={styles.value}>{profile.phone || '—'}</Text>
              <View style={styles.rowButtons}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => callNumber(profile.phone)}><Text style={styles.actionBtnText}>📞</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { marginLeft: 8 }]} onPress={() => smsNumber(profile.phone)}><Text style={styles.actionBtnText}>✉️</Text></TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.profileRow}>
            <Text style={styles.label}>{t('aadhaar')}</Text>
            <View style={styles.rowActions}>
              <Text style={styles.value}>{profile.aadhar || '—'}</Text>
              <TouchableOpacity style={styles.iconGhost} onPress={() => copyToClipboard(profile.aadhar || '', t('copy'))}>
                <Text style={styles.iconGhostText}>📋</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.profileRow}>
            <Text style={styles.label}>{t('address')}</Text>
            <Text style={styles.valueFull}>{profile.address || '—'}</Text>
          </View>

          <View style={styles.profileRow}>
            <Text style={styles.label}>{t('destination')}</Text>
            <Text style={styles.valueFull}>{profile.destination || '—'}</Text>
          </View>

          <View style={styles.sectionDivider} />

          <Text style={styles.sectionTitle}>{t('emergency_contacts')}</Text>
          {renderEmergencyContacts()}

          <View style={styles.sectionDivider} />

          <View style={styles.twoCols}>
            <View style={styles.col}>
              <Text style={styles.faintLabel}>{t('blood_group')}</Text>
              <Text style={styles.faintValue}>{profile.bloodGroup || '—'}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.faintLabel}>{t('allergies')}</Text>
              <Text style={styles.faintValue}>{profile.allergies || '—'}</Text>
            </View>
          </View>

          <View style={{ height: 8 }} />
          <Text style={styles.sectionTitle}>{t('notes')}</Text>
          <Text style={styles.valueFull}>{profile.notes || t('no_additional_notes')}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.editModal}>
            <Text style={styles.editTitle}>{t('edit')} {t('profile')}</Text>

            <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Full name</Text>
              <TextInput style={styles.input} value={temp.name} onChangeText={(v) => setTemp(s => ({ ...s, name: v }))} />

              <Text style={styles.inputLabel}>{t('phone')}</Text>
              <TextInput style={styles.input} keyboardType="phone-pad" value={temp.phone} onChangeText={(v) => setTemp(s => ({ ...s, phone: v }))} />

              <Text style={styles.inputLabel}>{t('aadhaar')}</Text>
              <TextInput style={styles.input} keyboardType="number-pad" value={temp.aadhar} onChangeText={(v) => setTemp(s => ({ ...s, aadhar: v }))} />

              <Text style={styles.inputLabel}>{t('address')}</Text>
              <TextInput style={[styles.input, { height: 80 }]} multiline value={temp.address} onChangeText={(v) => setTemp(s => ({ ...s, address: v }))} />

              <Text style={styles.inputLabel}>{t('emergency_contacts')} (comma separated)</Text>
              <TextInput
                style={styles.input}
                value={(temp.emergencyContacts || []).join(', ')}
                onChangeText={(v) => setTemp(s => ({ ...s, emergencyContacts: v.split(',').map(x => x.trim()).filter(Boolean) }))}
                placeholder="e.g. +919999999999, +918888888888"
              />

              <Text style={styles.inputLabel}>{t('blood_group')}</Text>
              <TextInput style={styles.input} value={temp.bloodGroup} onChangeText={(v) => setTemp(s => ({ ...s, bloodGroup: v }))} />

              <Text style={styles.inputLabel}>{t('allergies')}</Text>
              <TextInput style={styles.input} value={temp.allergies} onChangeText={(v) => setTemp(s => ({ ...s, allergies: v }))} />

              <Text style={styles.inputLabel}>{t('notes')}</Text>
              <TextInput style={[styles.input, { height: 80 }]} multiline value={temp.notes} onChangeText={(v) => setTemp(s => ({ ...s, notes: v }))} />
            </ScrollView>

            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditVisible(false)}>
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveProfile}>
                <Text style={styles.saveBtnText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Language picker */}
      <Modal visible={langVisible} animationType="fade" transparent onRequestClose={() => setLangVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.editModal, { padding: 12 }]}>
            <Text style={styles.editTitle}>{t('language')}</Text>
            <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
              {LANGS.map((l) => {
                const active = (profile.locale || i18n.language) === l.code;
                return (
                  <TouchableOpacity
                    key={l.code}
                    style={[styles.langRow, active && styles.langRowActive]}
                    onPress={() => onChangeLanguage(l.code)}
                  >
                    <Text style={[styles.langText, active && styles.langTextActive]}>{l.label}</Text>
                    {active ? <Text style={styles.langCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setLangVisible(false)}>
                <Text style={styles.cancelBtnText}>{t('close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* Styles unchanged */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#1F2937', paddingTop: Platform.OS === 'ios' ? 14 : 12, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomLeftRadius: 18, borderBottomRightRadius: 18, elevation: 6 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 42, height: 42, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  backIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#9CA3AF', marginTop: 2, fontSize: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  iconBtnText: { color: '#fff', fontWeight: '700' },
  content: { padding: 16, paddingTop: 20, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12, borderWidth: 1, borderColor: '#EFF6FF' },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatarLarge: { width: 90, height: 90, borderRadius: 18, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
  avatarLargeText: { fontSize: 36, fontWeight: '900', color: '#0F172A' },
  nameLarge: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  subtle: { color: '#6B7280', marginTop: 6 },
  primarySmall: { backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  primarySmallText: { color: '#fff', fontWeight: '800' },
  profileRow: { marginTop: 10 },
  label: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  value: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  valueFull: { fontSize: 14, color: '#0F172A' },
  rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowButtons: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: 16 },
  iconGhost: { backgroundColor: '#F3F4F6', padding: 8, borderRadius: 8 },
  iconGhostText: { fontSize: 14 },
  sectionDivider: { height: 1, backgroundColor: '#F3F7FA', marginVertical: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  contactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  contactLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  smallAvatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  smallAvatarText: { fontWeight: '800', color: '#0F172A' },
  contactPhone: { fontWeight: '800', color: '#0F172A' },
  contactActions: { flexDirection: 'row', alignItems: 'center' },
  smallAction: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  smallActionText: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  twoCols: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  col: { flex: 1, marginRight: 8 },
  faintLabel: { fontSize: 12, color: '#6B7280' },
  faintValue: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 6 },
  muted: { color: '#9CA3AF' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.45)', justifyContent: 'center', alignItems: 'center' },
  editModal: { width: '92%', maxHeight: '86%', backgroundColor: '#fff', borderRadius: 14, padding: 18 },
  editTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  inputLabel: { fontSize: 12, color: '#6B7280', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#E6EEF8', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginTop: 6, backgroundColor: '#FBFDFF' },
  cancelBtn: { flex: 1, backgroundColor: '#fff', paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 },
  cancelBtnText: { color: '#111827', fontWeight: '800' },
  saveBtn: { flex: 1, backgroundColor: '#3B82F6', paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  saveBtnText: { color: '#fff', fontWeight: '900' },
  langRow: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E6EEF8', marginBottom: 8, backgroundColor: '#FBFDFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  langRowActive: { borderColor: '#3B82F6' },
  langText: { fontSize: 15, color: '#0F172A', fontWeight: '700' },
  langTextActive: { color: '#1D4ED8' },
  langCheck: { fontSize: 16, fontWeight: '900', color: '#1D4ED8' },
});
