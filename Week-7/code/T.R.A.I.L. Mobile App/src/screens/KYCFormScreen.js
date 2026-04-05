// src/screens/KYCFormScreen.js
import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import sessionService from '../services/sessionService';
import { apiFetch } from '../services/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PROFILE_PREFIX = 'profile_';

// Helper to find a saved profile ID in AsyncStorage as a fallback
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
  } catch (e) {
    // Ignore errors, return null
  }
  return null;
}

export default function KYCFormScreen({ route, navigation }) {
  const routeTourist = route.params?.tourist ?? { id: null, name: '' };
  const [uid, setUid] = useState(routeTourist?.id);

  // State Initialization from sessionService cache if available
  const existingSync = uid ? sessionService.getProfile(uid) : null;

  const [fullName, setFullName] = useState(existingSync?.name ?? routeTourist.name ?? '');
  const [aadhar, setAadhar] = useState(existingSync?.aadhar ?? '');
  const [phone, setPhone] = useState(existingSync?.phone ?? '');
  const [address, setAddress] = useState(existingSync?.address ?? '');
  const [peopleCount, setPeopleCount] = useState(existingSync?.peopleCount ? String(existingSync.peopleCount) : '1');
  const [destination, setDestination] = useState(existingSync?.destination ?? '');
  const [em1, setEm1] = useState((existingSync?.emergencyContacts?.[0]) ?? '');
  const [em2, setEm2] = useState((existingSync?.emergencyContacts?.[1]) ?? '');
  const [isCreatingFamily, setIsCreatingFamily] = useState(existingSync?.isFamilyOwner ?? true);
  const [joinFamilyId, setJoinFamilyId] = useState(existingSync?.familyId ?? '');
  const [isSolo, setIsSolo] = useState((existingSync?.peopleCount ?? 1) === 1);

  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(16))[0];
  const headerScale = useState(new Animated.Value(0.99))[0];
  const scrollY = useState(new Animated.Value(0))[0];

  // Data hydration effect on mount
  useEffect(() => {
    let mounted = true;

    const hydrateForm = (profile) => {
      if (!profile || !mounted) return;
      setFullName(profile.name ?? '');
      setAadhar(profile.aadhar ?? '');
      setPhone(profile.phone ?? '');
      setAddress(profile.address ?? '');
      setDestination(profile.destination ?? '');
      setPeopleCount(profile.peopleCount ? String(profile.peopleCount) : '1');
      setIsSolo((profile.peopleCount ?? 1) === 1);
      setEm1(profile.emergencyContacts?.[0] ?? '');
      setEm2(profile.emergencyContacts?.[1] ?? '');
      setIsCreatingFamily(profile.isFamilyOwner ?? true);
      setJoinFamilyId(profile.familyId ?? '');
    };

    (async () => {
      let finalUid = uid;
      if (!finalUid) {
        finalUid = await findStoredUid();
        if (finalUid && mounted) setUid(finalUid);
      }
      if (!finalUid) return;

      // load local cached profile first
      let localProfile = null;
      try {
        localProfile = await sessionService.loadProfileAsync(finalUid);
      } catch (e) {
        // ignore
      }
      if (localProfile && mounted) hydrateForm(localProfile);

      // attempt to load from backend if helper exists
      try {
        const serverProfile = await sessionService.loadProfileFromBackend(finalUid);
        if (serverProfile && mounted) hydrateForm(serverProfile);
      } catch (e) {
        // fallback silently
      }
    })();
    
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.spring(headerScale, { toValue: 1, friction: 7, tension: 100, useNativeDriver: true }),
    ]).start();

    return () => { mounted = false; };
  }, [uid, fadeAnim, slideAnim, headerScale]);

  useEffect(() => {
    if (isSolo) setPeopleCount('1');
    else if (!peopleCount || peopleCount === '1') setPeopleCount('2');
  }, [isSolo]);

  function validate() {
    if (!fullName || !aadhar || !phone || !address || !destination || !em1) {
      Alert.alert('⚠️ Missing Information', 'Please fill all required fields: name, Aadhaar, phone, address, destination, and at least 1 emergency contact.');
      return false;
    }
    if (!uid) {
      Alert.alert('Authentication Error', 'User not identified. Please log in again.');
      return false;
    }
    return true;
  }

  async function onSubmitAndContinue() {
    if (!validate()) return;

    try {
      let familyId = joinFamilyId || null;
      let isFamilyOwner = false;

      // if user selected group and wants to create family, call family/create endpoint
      if (!isSolo) {
        if (isCreatingFamily) {
          const res = await apiFetch('/family/create', { method: 'POST' });
          if (!res.ok) throw new Error(res.body?.message || 'Failed to create family');
          familyId = res.body.code;
          isFamilyOwner = true;
        } else {
          if (!joinFamilyId) {
            Alert.alert('Family ID Required', 'Please enter a Family ID to join.');
            return;
          }
          const res = await apiFetch(`/family/join/${joinFamilyId}`, { method: 'POST' });
          if (!res.ok) throw new Error(res.body?.message || 'Failed to join family');
          familyId = joinFamilyId;
          isFamilyOwner = false;
        }
      }

      // Build profile payload to send. IMPORTANT: call /profiles/me on server (authenticated).
      const profilePayload = {
        name: fullName,
        aadhar,
        phone,
        address,
        destination,
        peopleCount: Number(peopleCount) || 1,
        emergencyContacts: [em1, em2].filter(Boolean),
        familyId: isSolo ? null : familyId,
        isFamilyOwner: isSolo ? false : isFamilyOwner,
        kycCompleted: true,
      };

      // --- CRITICAL CHANGE: call /profiles/me (server expects authenticated user) ---
      const response = await apiFetch('/profiles/me', { method: 'PUT', body: profilePayload });
      if (!response.ok) throw new Error(response.body?.message || 'Failed to save KYC data');

      const savedProfile = response.body;
      // keep local cache in sync
      if (sessionService && typeof sessionService.saveProfile === 'function') {
        try {
          await sessionService.saveProfile(uid, savedProfile);
        } catch (e) {
          // ignore caching errors
        }
      }

      Alert.alert(
        '✅ Registration Complete',
        `Your information has been securely saved.\n\nIndividual ID: ${savedProfile.individualId || sessionService.generateIndividualId?.(fullName) || uid}${profilePayload.familyId ? `\nFamily ID: ${profilePayload.familyId}` : ''}`,
        [{ text: 'Continue', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { tourist: { id: uid, name: fullName } } }] }) }]
      );
    } catch (e) {
      Alert.alert('❌ Error', e.message || 'A network error occurred. Please try again.');
    }
  }

  // handleSkip function
  const handleSkip = () => {
    navigation.goBack();
  };

  const bottomTranslate = scrollY.interpolate({ inputRange: [0, 120], outputRange: [0, 56], extrapolate: 'clamp' });
  const bottomOpacity = scrollY.interpolate({ inputRange: [0, 60, 120], outputRange: [1, 0.7, 0.35], extrapolate: 'clamp' });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <Animated.View style={[styles.headerContainer, { transform: [{ scale: headerScale }] }]}>
        <View style={styles.headerGradient}>
          <Animated.View style={[styles.headerContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <TouchableOpacity style={styles.headerClose} onPress={handleSkip} accessibilityLabel="Close KYC">
              <Text style={styles.headerCloseText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.headerIcon}><Text style={styles.headerEmoji}>📋</Text></View>
            <Text style={styles.headerTitle}>Quick Registration</Text>
            <Text style={styles.headerSubtitle}>Secure · Offline · Fast KYC</Text>
            <View style={styles.progressBar}><View style={styles.progressFill} /></View>
          </Animated.View>
        </View>
      </Animated.View>

      <View style={styles.surface}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>
          <Animated.ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
            scrollEventThrottle={16}
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <View style={styles.card}>
                <View style={styles.cardHeader}><View style={styles.cardIconContainer}><Text style={styles.cardIcon}>👤</Text></View><Text style={styles.sectionTitle}>Personal</Text></View>
                <TextInput placeholder="Full name" placeholderTextColor="#94A3B8" style={styles.input} value={fullName} onChangeText={setFullName} />
                <TextInput placeholder="Aadhaar number" placeholderTextColor="#94A3B8" keyboardType="number-pad" style={styles.input} value={aadhar} onChangeText={setAadhar} maxLength={12} />
                <TextInput placeholder="Phone number" placeholderTextColor="#94A3B8" keyboardType="phone-pad" style={styles.input} value={phone} onChangeText={setPhone} />
                <View style={styles.smallSpacer} />
                <Text style={styles.smallLabel}>Travel type</Text>
                <View style={styles.toggleContainer}>
                  <TouchableOpacity style={[styles.toggleOption, isSolo && styles.toggleOptionActive]} onPress={() => setIsSolo(true)} activeOpacity={0.85}><Text style={styles.toggleEmoji}>🧳</Text><Text style={[styles.toggleText, isSolo && styles.toggleTextActive]}>Solo</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.toggleOption, !isSolo && styles.toggleOptionActive]} onPress={() => setIsSolo(false)} activeOpacity={0.85}><Text style={styles.toggleEmoji}>👥</Text><Text style={[styles.toggleText, !isSolo && styles.toggleTextActive]}>Group</Text></TouchableOpacity>
                </View>
                {!isSolo && (<View style={styles.peopleCountContainer}><Text style={styles.peopleCountLabel}>Number of people</Text><TextInput placeholder="2" placeholderTextColor="#94A3B8" keyboardType="number-pad" style={styles.peopleCountInput} value={peopleCount} onChangeText={setPeopleCount} /></View>)}
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}><View style={styles.cardIconContainer}><Text style={styles.cardIcon}>✈️</Text></View><Text style={styles.sectionTitle}>Travel</Text></View>
                <TextInput placeholder="Home address" placeholderTextColor="#94A3B8" style={[styles.input, styles.textArea]} value={address} onChangeText={setAddress} multiline numberOfLines={3} />
                <TextInput placeholder="Destination" placeholderTextColor="#94A3B8" style={styles.input} value={destination} onChangeText={setDestination} />
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}><View style={styles.cardIconContainer}><Text style={styles.cardIcon}>🚨</Text></View><Text style={styles.sectionTitle}>Emergency contacts</Text></View>
                <View style={styles.emergencyInputContainer}><TextInput placeholder="Emergency contact #1" placeholderTextColor="#94A3B8" keyboardType="phone-pad" style={[styles.input, styles.emergencyInput]} value={em1} onChangeText={setEm1} /><View style={styles.requiredBadge}><Text style={styles.requiredText}>Required</Text></View></View>
                <TextInput placeholder="Emergency contact #2 (optional)" placeholderTextColor="#94A3B8" keyboardType="phone-pad" style={styles.input} value={em2} onChangeText={setEm2} />
              </View>

              {!isSolo && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}><View style={styles.cardIconContainer}><Text style={styles.cardIcon}>👪</Text></View><Text style={styles.sectionTitle}>Family connection</Text></View>
                  <TouchableOpacity style={[styles.familyOption, isCreatingFamily && styles.familyOptionActive]} onPress={() => setIsCreatingFamily(true)} activeOpacity={0.9}><View style={styles.familyOptionContent}><Text style={styles.familyOptionEmoji}>➕</Text><View><Text style={[styles.familyOptionTitle, isCreatingFamily && styles.familyOptionTitleActive]}>Create family</Text><Text style={styles.familyOptionSubtitle}>Start a new family group</Text></View></View></TouchableOpacity>
                  <View style={styles.smallSpacer} />
                  <TouchableOpacity style={[styles.familyOption, !isCreatingFamily && styles.familyOptionActive]} onPress={() => setIsCreatingFamily(false)} activeOpacity={0.9}><View style={styles.familyOptionContent}><Text style={styles.familyOptionEmoji}>🔗</Text><View><Text style={[styles.familyOptionTitle, !isCreatingFamily && styles.familyOptionTitleActive]}>Join family</Text><Text style={styles.familyOptionSubtitle}>Connect to an existing family</Text></View></View></TouchableOpacity>
                  {!isCreatingFamily && (<View style={styles.joinFamilyContainer}><TextInput placeholder="Family ID" placeholderTextColor="#94A3B8" style={styles.familyIdInput} value={joinFamilyId} onChangeText={setJoinFamilyId} autoCapitalize="characters" /></View>)}
                </View>
              )}

              <View style={styles.actionContainer}>
                <TouchableOpacity style={styles.primaryBtn} onPress={onSubmitAndContinue} activeOpacity={0.9}><Text style={styles.primaryBtnText}>✅ Save & Continue</Text></TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}><Text style={styles.skipBtnText}>Skip for now</Text></TouchableOpacity>
              </View>

              <View style={styles.infoContainer}><View style={styles.infoIcon}><Text style={styles.infoEmoji}>ℹ️</Text></View><Text style={styles.infoText}>Your data is stored securely and can be synced with your family group.</Text></View>
              <View style={{ height: 28 }} />
            </Animated.View>
          </Animated.ScrollView>
        </KeyboardAvoidingView>
      </View>

      <Animated.View pointerEvents="none" style={[styles.animatedBottom, { transform: [{ translateY: bottomTranslate }], opacity: bottomOpacity }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  headerContainer: { height: 112, overflow: 'hidden' },
  headerGradient: { flex: 1, backgroundColor: '#0F172A', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, justifyContent: 'center', alignItems: 'center' },
  headerContent: { alignItems: 'center', width: '100%', position: 'relative' },
  headerClose: { position: 'absolute', left: 0, top: 0, width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  headerCloseText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  headerEmoji: { fontSize: 22 },
  headerTitle: { fontSize: 19, fontWeight: '900', color: '#ffffff' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 4, marginBottom: 8 },
  progressBar: { width: '46%', height: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 2 },
  progressFill: { width: '36%', height: '100%', backgroundColor: '#06B6D4', borderRadius: 2 },
  surface: { flex: 1, backgroundColor: '#F7FAFC', borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -10, paddingTop: 8 },
  container: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 64, minHeight: SCREEN_HEIGHT * 0.9 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 16, elevation: 4, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 10, borderWidth: 1, borderColor: 'rgba(15,23,42,0.03)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardIconContainer: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F0F9FF', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  input: { borderWidth: 1, borderColor: '#E6EEF8', backgroundColor: '#FBFDFF', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginBottom: 12, fontSize: 15, color: '#0F172A' },
  textArea: { height: 94, textAlignVertical: 'top' },
  smallSpacer: { height: 8 },
  smallLabel: { fontSize: 13, color: '#64748B', marginBottom: 8 },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#F5F9FF', borderRadius: 12, padding: 6 },
  toggleOption: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  toggleOptionActive: { backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 4 },
  toggleEmoji: { fontSize: 18, marginBottom: 4 },
  toggleText: { fontSize: 14, color: '#64748B', fontWeight: '700' },
  toggleTextActive: { color: '#0F172A', fontWeight: '900' },
  peopleCountContainer: { marginTop: 12, padding: 12, backgroundColor: '#F0F9FF', borderRadius: 10, borderWidth: 1, borderColor: '#E1F3FF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  peopleCountLabel: { fontSize: 14, fontWeight: '700', color: '#0C4A6E' },
  peopleCountInput: { width: 88, textAlign: 'center', borderWidth: 1, borderColor: '#0EA5E9', padding: 10, borderRadius: 8, backgroundColor: '#FFFFFF', fontSize: 15, fontWeight: '700', color: '#0C4A6E' },
  emergencyInputContainer: { position: 'relative' },
  emergencyInput: { paddingRight: 84 },
  requiredBadge: { position: 'absolute', right: 12, top: 14, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  requiredText: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  familyOption: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, backgroundColor: '#FAFBFC' },
  familyOptionActive: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
  familyOptionContent: { flexDirection: 'row', alignItems: 'center' },
  familyOptionEmoji: { fontSize: 18, marginRight: 12 },
  familyOptionTitle: { fontSize: 14, fontWeight: '800', color: '#374151' },
  familyOptionTitleActive: { color: '#0F172A' },
  familyOptionSubtitle: { fontSize: 13, color: '#6B7280' },
  joinFamilyContainer: { marginTop: 12, padding: 6, backgroundColor: '#F0F9FF', borderRadius: 10 },
  familyIdInput: { borderWidth: 1, borderColor: '#3B82F6', padding: 12, borderRadius: 8, backgroundColor: '#FFFFFF', fontSize: 15, fontWeight: '700', color: '#1E40AF', textAlign: 'center', letterSpacing: 2 },
  actionContainer: { marginTop: 8 },
  primaryBtn: { backgroundColor: '#0F172A', paddingVertical: 14, borderRadius: 12, alignItems: 'center', elevation: 6, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, marginBottom: 8 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  skipBtn: { paddingVertical: 10, alignItems: 'center' },
  skipBtnText: { color: '#64748B', fontSize: 15, fontWeight: '700' },
  infoContainer: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F0F9FF', padding: 12, borderRadius: 10, marginTop: 12, borderLeftWidth: 4, borderLeftColor: '#0EA5E9' },
  infoIcon: { marginRight: 10, marginTop: 2 },
  infoEmoji: { fontSize: 16 },
  infoText: { flex: 1, fontSize: 13, color: '#0C4A6E', lineHeight: 18 },
  animatedBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: Platform.OS === 'ios' ? 36 : 28, backgroundColor: '#0F172A', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
});
