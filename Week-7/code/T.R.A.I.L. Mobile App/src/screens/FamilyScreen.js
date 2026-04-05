// src/screens/FamilyScreen.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Share,
  RefreshControl,
  Linking,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import sessionService from '../services/sessionService';
import { apiFetch } from '../services/api';

export default function FamilyScreen({ route, navigation }) {
  const tourist = route?.params?.tourist ?? { id: null, name: 'Demo User' };
  const uid = tourist.id;

  const [profile, setProfile] = useState(() => sessionService.getProfile(uid) || {});
  const [familyId, setFamilyId] = useState(() => (profile.familyId || null));
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isKycPending, setIsKycPending] = useState(() => !hasCompletedKyc(profile));

  const [searchText, setSearchText] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinInput, setJoinInput] = useState('');

  // Polling refs
  const membersIntervalRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const isFocusedRef = useRef(false);

  // Poll timing (ms)
  const MEMBERS_POLL_MS = 10000; // 10s
  const LOCATION_POLL_MS = 15000; // 15s

  // --- DATA LOADING & FETCHING ---
  const loadAllData = useCallback(async () => {
    if (!uid) {
      // load from local session as fallback
      const local = sessionService.getProfile ? sessionService.getProfile(null) : null;
      setProfile(local || {});
      setFamilyId(local?.familyId || null);
      setIsKycPending(!hasCompletedKyc(local || {}));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Prefer backend-backed profile loader if available in sessionService
      const userProfile =
        (sessionService.loadProfileFromBackend && typeof sessionService.loadProfileFromBackend === 'function')
          ? await sessionService.loadProfileFromBackend(uid)
          : await fetchMyProfileFromApi(); // fallback to calling backend directly

      if (userProfile) {
        setProfile(userProfile);
        setIsKycPending(!hasCompletedKyc(userProfile));
        const currentFamilyId = userProfile.familyId;
        setFamilyId(currentFamilyId);

        if (currentFamilyId) {
          await fetchFamilyMembers(currentFamilyId);
        } else {
          setMembers([]);
        }
      } else {
        // fallback to local
        const local = sessionService.getProfile ? sessionService.getProfile(uid) || {} : {};
        setProfile(local);
        setFamilyId(local.familyId || null);
      }
    } catch (error) {
      console.error('Error loading all data:', error);
      Alert.alert('Error', 'Could not load your profile and family data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      loadAllData();

      // start polling while screen is focused
      startMembersPolling();
      startLocationPolling();

      return () => {
        isFocusedRef.current = false;
        stopMembersPolling();
        stopLocationPolling();
      };
    }, [loadAllData])
  );

  async function fetchMyProfileFromApi() {
    try {
      const res = await apiFetch('/profiles/me');
      if (res.ok) return res.body;
      return null;
    } catch (e) {
      console.error('fetchMyProfileFromApi error', e);
      return null;
    }
  }

  async function fetchFamilyMembers(fid) {
    if (!fid) {
      setMembers([]);
      return;
    }
    try {
      const response = await apiFetch(`/family/${fid}/members`);
      if (response.ok && Array.isArray(response.body)) {
        // Normalize server response to UI shape
        const normalizedMembers = normalizeList(response.body.map(normalizeProfile));
        setMembers(normalizedMembers);
      } else {
        throw new Error(response.body?.message || 'Failed to fetch family members');
      }
    } catch (e) {
      console.error('fetchFamilyMembers error:', e);
      // show error only once; avoid spamming alerts on polling
      if (!refreshing) Alert.alert('Error', e.message || 'Could not retrieve family members.');
      setMembers([]);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadAllData();
    setTimeout(() => setRefreshing(false), 600);
  }

  // --- POLLING (members + my location) ---
  function startMembersPolling() {
    stopMembersPolling();
    if (!familyId) return;
    membersIntervalRef.current = setInterval(() => {
      if (isFocusedRef.current && familyId) fetchFamilyMembers(familyId);
    }, MEMBERS_POLL_MS);
  }
  function stopMembersPolling() {
    if (membersIntervalRef.current) {
      clearInterval(membersIntervalRef.current);
      membersIntervalRef.current = null;
    }
  }

  function startLocationPolling() {
    stopLocationPolling();
    // push location periodically to server so others see you
    if (!uid) return;
    locationIntervalRef.current = setInterval(() => {
      if (isFocusedRef.current) updateMyLocationToServer();
    }, LOCATION_POLL_MS);
    // also immediately attempt once
    updateMyLocationToServer();
  }
  function stopLocationPolling() {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  }

  // Use navigator.geolocation; adapt if you prefer @react-native-community/geolocation
  async function updateMyLocationToServer() {
    try {
      // request current position
      if (!navigator || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          if (!latitude || !longitude) return;
          // send to backend via PUT /profiles/me
          const payload = { lastLocation: { lat: latitude, lng: longitude, updatedAt: new Date().toISOString() } };
          try {
            const res = await apiFetch('/profiles/me', { method: 'PUT', body: payload });
            if (res.ok) {
              // update local session/profile and refresh family members (so UI shows new location)
              const updatedProfile = res.body;
              sessionService.saveProfile && sessionService.saveProfile(uid, updatedProfile);
              setProfile(updatedProfile);
              if (updatedProfile.familyId) fetchFamilyMembers(updatedProfile.familyId);
            } else {
              // silently ignore non-ok responses; maybe token expired
              // console.warn('location update failed', res.body);
            }
          } catch (e) {
            // ignore network errors for location push
            // console.warn('location push error', e);
          }
        },
        (err) => {
          // ignore permission/timeouts - don't alert repeatedly
          // console.warn('geolocation error', err);
        },
        { enableHighAccuracy: true, maximumAge: 1000 * 10, timeout: 10000 }
      );
    } catch (e) {
      // fail silently
      // console.warn('updateMyLocationToServer error', e);
    }
  }

  // --- ACTIONS ---

  async function createFamily() {
    if (isKycPending) {
      Alert.alert('KYC Required', 'Please complete your KYC before creating a family.');
      return;
    }
    try {
      const response = await apiFetch('/family/create', { method: 'POST' });
      if (!response.ok) throw new Error(response.body?.message || 'Failed to create family');

      const { code } = response.body;
      Alert.alert('✅ Family Created', `Your Family ID is: ${code}\nShare it with your family.`);
      // reload profile + members
      await loadAllData();
      // start polling for members immediately
      startMembersPolling();
    } catch (e) {
      Alert.alert('❌ Error', e.message || 'Could not create family.');
    }
  }

  async function performJoin() {
    const fidToJoin = joinInput.trim().toUpperCase();
    if (!fidToJoin) {
      Alert.alert('Invalid ID', 'Please enter a Family ID.');
      return;
    }
    if (isKycPending) {
      Alert.alert('KYC Required', 'Please complete your KYC before joining a family.');
      return;
    }
    try {
      const response = await apiFetch(`/family/join/${fidToJoin}`, { method: 'POST' });
      if (!response.ok) throw new Error(response.body?.message || 'Family not found or error joining.');

      Alert.alert('✅ Joined', `You have successfully joined family ${fidToJoin}.`);
      setJoinModalVisible(false);
      setJoinInput('');
      await loadAllData();
      startMembersPolling();
    } catch (e) {
      Alert.alert('❌ Error', e.message || 'Could not join family.');
    }
  }

  async function shareFamilyId() {
    if (!familyId) {
      Alert.alert('No Family ID', 'Create or join a family first to share.');
      return;
    }
    try {
      await Share.share({ title: 'Join My Family', message: `Join my family on our app with ID: ${familyId}` });
    } catch (e) {
      // ignore
    }
  }

  // Owner-only actions (remove / promote) call backend endpoints
  async function removeMember(memberId) {
    if (!profile?.isFamilyOwner) return Alert.alert('Permission denied', 'Only owners can remove members.');
    try {
      const res = await apiFetch(`/family/members/${memberId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(res.body?.message || 'Failed to remove member');
      Alert.alert('Removed', 'Member removed from family.');
      await fetchFamilyMembers(profile.familyId);
      closeDetails();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not remove member.');
    }
  }

  async function promoteMember(memberId) {
    if (!profile?.isFamilyOwner) return Alert.alert('Permission denied', 'Only owners can promote members.');
    try {
      const res = await apiFetch(`/family/members/${memberId}/promote`, { method: 'PUT' });
      if (!res.ok) throw new Error(res.body?.message || 'Failed to promote member');
      Alert.alert('Promoted', 'Member promoted to owner.');
      // reload profile + members
      await loadAllData();
      closeDetails();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not promote member.');
    }
  }

  // --- HELPERS & RENDER LOGIC ---

  function normalizeProfile(raw) {
    if (!raw) return null;
    return {
      id: raw.id,
      name: raw.name || 'Unknown',
      phone: raw.phone || 'N/A',
      role: raw.isFamilyOwner ? 'owner' : 'member',
      status: raw.lastLocation ? 'online' : 'offline',
      aadhar: raw.aadhar,
      address: raw.address,
      destination: raw.destination,
      emergencyContacts: raw.emergencyContacts || [],
      location: raw.lastLocation || null,
    };
  }

  function normalizeList(list) {
    const map = new Map();
    (list || []).forEach(item => {
      if (item && item.id) map.set(item.id, item);
    });
    return Array.from(map.values());
  }

  function hasCompletedKyc(p) {
    return p && !!p.kycCompleted;
  }

  function openDetails(member) {
    setSelectedMember(member);
    setDetailModalVisible(true);
  }
  function closeDetails() {
    setDetailModalVisible(false);
    setSelectedMember(null);
  }
  function callNumber(phone) {
    if (!phone || phone === 'N/A') return Alert.alert('No Number', 'Phone number not available.');
    Linking.openURL(`tel:${phone}`);
  }
  function formatLatLng(loc) {
    if (!loc) return '';
    const lat = parseFloat(loc.lat ?? loc.latitude ?? 0);
    const lng = parseFloat(loc.lng ?? loc.longitude ?? 0);
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  }

  const listToShow = (members || [])
    .filter((m) => {
      if (!searchText) return true;
      const q = searchText.toLowerCase();
      return (m.name || '').toLowerCase().includes(q) || (m.phone || '').includes(q) || (m.id || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.role === 'owner') return -1;
      if (b.role === 'owner') return 1;
      if (a.status === 'online' && b.status !== 'online') return -1;
      if (b.status === 'online' && a.status !== 'online') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

  const renderCard = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)} activeOpacity={0.9}>
      <View style={styles.cardRow}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardSmall}>{item.phone}</Text>
          </View>
        </View>
        <View style={styles.badgeWrap}>
          <View style={[styles.rolePill, item.role === 'owner' ? styles.roleOwnerPill : {}]}>
            <Text style={[styles.rolePillText, item.role === 'owner' ? styles.roleOwnerText : {}]}>
              {item.role.toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.statusSmall, item.status === 'online' && { color: '#10B981', fontWeight: 'bold' }]}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
          {item.location && <Text style={styles.locSmall}>{formatLatLng(item.location)}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Family Group</Text>
          <Text style={styles.subtitle}>{familyId ? `ID: ${familyId}` : 'No family assigned'}</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('Profile', { tourist })}>
          <Text style={styles.headerBtnText}>My Profile</Text>
        </TouchableOpacity>
      </View>

      {isKycPending && (
        <TouchableOpacity style={styles.kycBanner} onPress={() => navigation.navigate('KYC', { tourist })}>
          <Text style={styles.kycTitle}>Complete KYC to use Family features</Text>
          <Text style={styles.kycSub}>Create, join, and share your live location.</Text>
        </TouchableOpacity>
      )}

      {!familyId && !isKycPending && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.primaryBtn} onPress={createFamily}><Text style={styles.primaryBtnText}>Create a Family</Text></TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => setJoinModalVisible(true)}><Text style={styles.outlineBtnText}>Join a Family</Text></TouchableOpacity>
        </View>
      )}

      {familyId && (
        <>
          <View style={styles.controls}>
            <TouchableOpacity style={styles.primaryBtn} onPress={shareFamilyId}><Text style={styles.primaryBtnText}>👨‍👩‍👧‍👦 Invite Members</Text></TouchableOpacity>
          </View>
          <View style={styles.searchRow}>
            <TextInput placeholder="Search members..." value={searchText} onChangeText={setSearchText} style={styles.searchInput} />
          </View>
        </>
      )}

      <View style={styles.listWrap}>
        {loading ? <ActivityIndicator style={{ marginTop: 40 }} size="large" />
          : (
            <FlatList
              data={listToShow}
              renderItem={renderCard}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>{!familyId ? 'No Family Group' : 'Family is Empty'}</Text>
                  <Text style={styles.emptySub}>{!familyId ? 'Complete KYC then create or join a family.' : 'Use the "Invite Members" button to share your Family ID.'}</Text>
                </View>
              }
            />
          )}
      </View>

      {/* Modals */}
      <Modal visible={detailModalVisible} transparent animationType="slide" onRequestClose={closeDetails}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selectedMember ? (
              <ScrollView>
                <View style={styles.modalHeader}>
                  <View style={styles.modalAvatar}><Text style={styles.modalAvatarText}>{(selectedMember.name || '?').charAt(0)}</Text></View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.modalName}>{selectedMember.name}</Text>
                    <Text style={styles.modalRole}>{selectedMember.role.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={styles.kycGrid}>
                  <KycRow label="Phone" value={selectedMember.phone} onAction={() => callNumber(selectedMember.phone)} />
                  <KycRow label="Last Location" value={selectedMember.location ? `${formatLatLng(selectedMember.location)} ${selectedMember.location?.updatedAt ? `• ${new Date(selectedMember.location.updatedAt).toLocaleString()}` : ''}` : '—'} />
                  <KycRow label="Aadhaar" value={selectedMember.aadhar} />
                  <KycRow label="Address" value={selectedMember.address} />
                  <KycRow label="Emergency Contacts" value={(selectedMember.emergencyContacts || []).join(', ')} />
                </View>

                <View style={{ flexDirection: 'row', marginTop: 12, justifyContent: 'flex-end' }}>
                  {profile?.isFamilyOwner && selectedMember.id !== (profile.id || uid) && (
                    <>
                      <TouchableOpacity style={styles.dangerBtn} onPress={() => removeMember(selectedMember.id)}><Text style={styles.dangerBtnText}>Remove</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.secondaryBtn} onPress={() => promoteMember(selectedMember.id)}><Text style={styles.secondaryBtnText}>Promote</Text></TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity style={styles.closeBtn} onPress={closeDetails}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
                </View>
              </ScrollView>
            ) : <ActivityIndicator />}
          </View>
        </View>
      </Modal>

      <Modal visible={joinModalVisible} transparent animationType="fade" onRequestClose={() => setJoinModalVisible(false)}>
        <View style={styles.modalBackdrop}><View style={styles.joinCard}>
          <Text style={styles.joinTitle}>Join an Existing Family</Text>
          <Text style={styles.joinSub}>Enter the Family ID provided by the owner.</Text>
          <TextInput value={joinInput} onChangeText={setJoinInput} placeholder="FAM-XXXXXX" autoCapitalize="characters" style={styles.joinInput} />
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <TouchableOpacity style={styles.cancelSmall} onPress={() => setJoinModalVisible(false)}><Text style={styles.cancelSmallText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.joinSmall} onPress={performJoin}><Text style={styles.joinSmallText}>Join Family</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

function KycRow({ label, value, onAction }) {
  return (
    <View style={{ marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 8 }}>
      <Text style={{ color: '#6B7280', fontSize: 12 }}>{label}</Text>
      <TouchableOpacity onPress={onAction} disabled={!onAction}>
        <Text style={{ color: onAction ? '#3B82F6' : '#0F172A', fontWeight: '700', marginTop: 6 }}>{value || '—'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  subtitle: { color: '#6B7280', marginTop: 2 },
  headerBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  headerBtnText: { color: '#1E40AF', fontWeight: '800' },
  kycBanner: { margin: 16, padding: 14, borderRadius: 12, backgroundColor: '#FEF3C7', borderLeftWidth: 4, borderLeftColor: '#F59E0B' },
  kycTitle: { fontWeight: '800', color: '#92400E' },
  kycSub: { color: '#92400E', marginTop: 6 },
  controls: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 8, alignItems: 'center', backgroundColor: '#FFFFFF', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  primaryBtn: { backgroundColor: '#3B82F6', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, flex: 1, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '900' },
  outlineBtn: { marginLeft: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  outlineBtnText: { color: '#1F2937', fontWeight: '800' },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  searchInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  listWrap: { flex: 1 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarWrap: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 18, fontWeight: '900', color: '#1E3A8A' },
  cardName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardSmall: { color: '#6B7280', marginTop: 2 },
  badgeWrap: { alignItems: 'flex-end' },
  rolePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginBottom: 4, backgroundColor: '#F3F4F6' },
  roleOwnerPill: { backgroundColor: '#DBEAFE' },
  rolePillText: { fontWeight: '700', fontSize: 10, color: '#4B5563', textTransform: 'uppercase' },
  roleOwnerText: { color: '#1E40AF' },
  statusSmall: { color: '#6B7280', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  locSmall: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1F2937', marginBottom: 8 },
  emptySub: { color: '#6B7280', textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { width: '100%', maxHeight: '88%', backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', padding: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
  modalAvatarText: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  modalName: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  modalRole: { color: '#6B7280', textTransform: 'uppercase', fontSize: 12, fontWeight: '700' },
  kycGrid: { marginTop: 6, paddingTop: 6 },
  closeBtn: { backgroundColor: '#F3F4F6', paddingVertical: 12, borderRadius: 10, marginTop: 16, alignItems: 'center' },
  closeBtnText: { fontWeight: '800', color: '#1F2937' },
  joinCard: { width: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  joinTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  joinSub: { color: '#6B7280', marginTop: 6, textAlign: 'center' },
  joinInput: { width: '100%', marginTop: 16, backgroundColor: '#FBFDFF', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#E6EEF8', textAlign: 'center', letterSpacing: 2, fontWeight: '700' },
  cancelSmall: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 },
  cancelSmallText: { color: '#111827', fontWeight: '800' },
  joinSmall: { flex: 1, backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  joinSmallText: { color: '#fff', fontWeight: '900' },
  dangerBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginRight: 8 },
  dangerBtnText: { color: '#991B1B', fontWeight: '800' },
  secondaryBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginRight: 8 },
  secondaryBtnText: { color: '#0B5ED7', fontWeight: '800' },
});
