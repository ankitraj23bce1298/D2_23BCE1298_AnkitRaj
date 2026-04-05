// src/screens/FamilyMapScreen.js
import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Linking,
  Animated,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import MapViewComponent from '../components/MapViewComponent';
import sessionService from '../services/sessionService';

const { width, height } = Dimensions.get('window');

// fallback loader for members (tries userService then demo)
const fetchMembers = async (familyId) => {
  if (!familyId) return [];
  try {
    const { apiFetch } = require('../services/api');
    const r = await apiFetch(`/family/${encodeURIComponent(familyId)}/members`, { method: 'GET' });
    if (r.ok && Array.isArray(r.body)) return r.body;
  } catch (e) {
    console.warn('Family fetch error', e);
  }
  return [];
};

export default function FamilyMapScreen({ route, navigation }) {
  const familyId = route.params?.familyId ?? null;
  const passedMembers = route.params?.familyMembers ?? null;

  const [members, setMembers] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [centerLocation, setCenterLocation] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [panelExpanded, setPanelExpanded] = useState(false);

  // Track last zone event we surfaced to avoid spamming alerts
  const lastZoneEventRef = useRef({ type: null, name: null, ts: 0 });

  // Animations - NOTE: useNativeDriver: false to avoid layout issues
  const slideUpAnim = useRef(new Animated.Value(100)).current;
  const fadeInAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const panelHeightAnim = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    loadMembers();

    Animated.parallel([
      Animated.timing(slideUpAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
      Animated.timing(fadeInAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1200, useNativeDriver: false }),
      ])
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(panelHeightAnim, {
      toValue: panelExpanded ? Math.min(520, height * 0.75) : 220,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [panelExpanded, panelHeightAnim]);

  async function loadMembers() {
    setLoading(true);
    try {
      const profiles = passedMembers && passedMembers.length ? passedMembers : await fetchMembers(familyId);
      setMembers(profiles);

      const mks = profiles.map((p, idx) => {
        const latitude = p.latitude ?? (28.6139 + idx * 0.0015);
        const longitude = p.longitude ?? (77.2090 + idx * 0.0018);
        return {
          id: p.id,
          title: p.name || p.id,
          description: p.phone || '',
          latitude,
          longitude,
          status: p.status || 'unknown',
        };
      });

      setMarkers(mks);

      if (mks.length) {
        setCenterLocation({ latitude: mks[0].latitude, longitude: mks[0].longitude });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load family members.');
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setLoading(true);
    try {
      await loadMembers();
      Alert.alert('✅ Updated', 'Family locations refreshed successfully');
    } finally {
      setLoading(false);
    }
  }

  function centerOnMember(member) {
    setCenterLocation({ latitude: member.latitude, longitude: member.longitude });
    setSelectedMember(member);

    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.18, duration: 160, useNativeDriver: false }),
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 160, useNativeDriver: false }),
    ]).start();
  }

  function onCall(phone) {
    if (!phone) {
      Alert.alert('📞 No Phone', 'Phone number not available for this member.');
      return;
    }
    const url = `tel:${phone}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (!supported) {
          Alert.alert('❌ Unable to call', 'Your device does not support phone calls.');
        } else {
          return Linking.openURL(url);
        }
      })
      .catch(() => Alert.alert('❌ Error', 'Unable to initiate call.'));
  }

  function getStatusColor(status) {
    switch (status) {
      case 'online': return '#10B981';
      case 'offline': return '#EF4444';
      default: return '#F59E0B';
    }
  }

  function getStatusText(status) {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      default: return 'Unknown';
    }
  }

  function formatLastSeen(lastSeen) {
    if (!lastSeen) return 'Unknown';
    const now = new Date();
    const diff = now - new Date(lastSeen);
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // Surface enter/exit alerts from the geofence-enabled MapViewComponent (debounced)
  function handleZoneEvent({ type, zone }) {
    const name = zone?.name ?? 'Restricted Zone';
    const now = Date.now();
    // 3s debounce per zone/type
    if (
      lastZoneEventRef.current.type === type &&
      lastZoneEventRef.current.name === name &&
      now - lastZoneEventRef.current.ts < 3000
    ) {
      return;
    }
    lastZoneEventRef.current = { type, name, ts: now };

    if (type === 'enter') {
      Alert.alert('⚠️ Restricted Area', `You entered: ${name}`);
    } else if (type === 'exit') {
      Alert.alert('✅ You left a restricted area', `Exited: ${name}`);
    }
    // You can also log/telemetry here
    console.log('Zone event:', type, name);
  }

  const renderMemberCard = ({ item }) => {
    const isSelected = selectedMember?.id === item.id;

    return (
      <Animated.View
        style={[
          styles.memberCard,
          isSelected && styles.memberCardSelected,
          { transform: [{ translateY: slideUpAnim }], opacity: fadeInAnim },
        ]}
      >
        <TouchableOpacity activeOpacity={0.8} onPress={() => centerOnMember(item)} style={styles.memberCardContent}>
          <View style={styles.memberInfo}>
            <View style={styles.avatarContainer}>
              <View style={[styles.memberAvatar, { borderColor: getStatusColor(item.status) }]}>
                <Text style={styles.memberAvatarText}>{(item.title || item.id || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            </View>

            <View style={styles.memberDetails}>
              <Text style={styles.memberName}>{item.title}</Text>
              <Text style={styles.memberPhone}>{item.description || 'No phone'}</Text>
              <View style={styles.statusContainer}>
                <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{getStatusText(item.status)}</Text>
                <Text style={styles.lastSeenText}>• {formatLastSeen(members.find(m => m.id === item.id)?.lastSeen)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.memberActions}>
            <TouchableOpacity style={[styles.actionBtn, styles.callBtn]} onPress={() => onCall(item.description)}>
              <Text style={styles.actionIcon}>📞</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionBtn, styles.locateBtn]} onPress={() => centerOnMember(item)}>
              <Text style={styles.actionIcon}>📍</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>👨‍👩‍👧‍👦</Text>
      <Text style={styles.emptyTitle}>No Family Members</Text>
      <Text style={styles.emptySubtitle}>Invite family members to see their locations on the map</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1F2937" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>

            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Family Map</Text>
              <Text style={styles.headerSubtitle}>{familyId ? `Family: ${familyId}` : `${members.length} members`}</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity style={[styles.headerActionBtn, loading && styles.headerActionBtnLoading]} onPress={onRefresh} disabled={loading}>
                {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.headerActionIcon}>🔄</Text>}
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => {
                if (markers.length) {
                  const m = markers[0];
                  setCenterLocation({ latitude: m.latitude, longitude: m.longitude });
                } else {
                  Alert.alert('📍 No Locations', 'No members to center on.');
                }
              }}
            >
              <Text style={styles.headerActionIcon}>🎯</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Map Container */}
      <View style={styles.mapContainer}>
      <MapViewComponent
  followUser
  markers={markers}
  style={styles.map}
  showGeofences
  centerTo={centerLocation}
  onZoneEvent={handleZoneEvent}
/>


        {selectedMember && (
          <Animated.View style={[styles.mapOverlay, { opacity: fadeInAnim }]}>
            <View style={styles.overlayCard}>
              <Text style={styles.overlayTitle}>{selectedMember.title}</Text>
              <Text style={styles.overlaySubtitle}>
                {getStatusText(selectedMember.status)} • {selectedMember.description}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Bottom Panel */}
      <Animated.View style={[styles.bottomPanel, { height: panelHeightAnim }]}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHandle} />
          <View style={styles.panelTitleContainer}>
            <Text style={styles.panelTitle}>Family Members</Text>
            <View style={styles.memberCount}>
              <Text style={styles.memberCountText}>{members.length}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.expandButton} onPress={() => setPanelExpanded(v => !v)}>
            <Text style={styles.expandIcon}>{panelExpanded ? '⌄' : '⌃'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panelContent}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>Loading family members...</Text>
            </View>
          ) : members.length === 0 ? (
            renderEmptyState()
          ) : (
            <FlatList
              data={members.map((m, idx) => ({
                id: m.id ?? `m_${idx}`,
                title: m.name ?? m.id,
                description: m.phone ?? '',
                latitude: m.latitude ?? (28.6139 + idx * 0.0015),
                longitude: m.longitude ?? (77.2090 + idx * 0.0018),
                status: m.status || 'unknown',
              }))}
              keyExtractor={(item) => item.id}
              renderItem={renderMemberCard}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </View>

        {members.length > 0 && (
          <View style={styles.panelFooter}>
            <TouchableOpacity style={styles.footerButton} onPress={() => Alert.alert('📤 Share', 'Map sharing feature coming soon!')}>
              <Text style={styles.footerButtonIcon}>📤</Text>
              <Text style={styles.footerButtonText}>Share Map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.footerButton, styles.primaryFooterButton]}
              onPress={() => {
                if (!markers.length) {
                  Alert.alert('📍 No Locations', 'No family members to focus on.');
                  return;
                }
                const m = markers[0];
                setCenterLocation({ latitude: m.latitude, longitude: m.longitude });
                setSelectedMember(markers[0]);
              }}
            >
              <Text style={styles.footerButtonIcon}>🎯</Text>
              <Text style={[styles.footerButtonText, { color: '#FFFFFF' }]}>Center Map</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  safe: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    backgroundColor: '#1F2937',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 10 : 20,
    paddingBottom: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  backButton: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  backIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  headerTextContainer: { flex: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  headerSubtitle: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerActionBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  headerActionBtnLoading: { backgroundColor: 'rgba(59,130,246,0.2)' },
  headerActionIcon: { fontSize: 18 },

  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  mapOverlay: { position: 'absolute', top: 20, left: 20, right: 20 },
  overlayCard: {
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, padding: 14,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8,
  },
  overlayTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  overlaySubtitle: { fontSize: 14, color: '#6B7280' },

  bottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 16,
  },
  panelHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 12 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  panelTitleContainer: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  panelTitle: { fontSize: 18, fontWeight: '800', color: '#1F2937', marginRight: 8 },
  memberCount: { backgroundColor: '#EFF6FF', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  memberCountText: { fontSize: 12, fontWeight: '700', color: '#3B82F6' },
  expandButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  expandIcon: { fontSize: 16, fontWeight: '700', color: '#6B7280' },

  panelContent: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },

  memberCard: { backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, borderWidth: 1, borderColor: '#F3F4F6' },
  memberCardSelected: { borderColor: '#3B82F6', elevation: 4, shadowOpacity: 0.1, shadowRadius: 8 },
  memberCardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  memberInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: { position: 'relative', marginRight: 12 },
  memberAvatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  memberAvatarText: { fontSize: 18, fontWeight: '800', color: '#3B82F6' },
  statusDot: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#FFFFFF' },
  memberDetails: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 2 },
  memberPhone: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  statusContainer: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 12, fontWeight: '600' },
  lastSeenText: { fontSize: 12, color: '#9CA3AF', marginLeft: 6 },

  memberActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  callBtn: { backgroundColor: '#FEF3C7' },
  locateBtn: { backgroundColor: '#EFF6FF' },
  actionIcon: { fontSize: 16 },

  panelFooter: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  footerButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 12 },
  primaryFooterButton: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  footerButtonIcon: { fontSize: 16, marginRight: 8 },
  footerButtonText: { fontSize: 14, fontWeight: '700', color: '#374151' },

  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6B7280', fontWeight: '500' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});
