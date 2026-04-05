import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  StatusBar,
  Dimensions,
  FlatList,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapViewComponent from '../components/MapViewComponent';
import sessionService from '../services/sessionService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';

// 👉 Import the safety JSON (place file at ../assets/safety_scores_2022.json)
import SAFETY_SCORES from '../assets/safety_scores_2022.json';

// ⛳️ REQUIRED for reverse geocoding (state from lat/lng)
const GOOGLE_MAPS_API_KEY = 'AIzaSyAHtdAu9saO175T9gzAifPHpxYXwr8w3G8';

const { width } = Dimensions.get('window');
const PROFILE_PREFIX = 'profile_';

// ---------- Safety helpers ----------
const IN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh',
  'Puducherry','Chandigarh','Lakshadweep','Andaman and Nicobar Islands',
  'Dadra and Nagar Haveli and Daman and Diu'
];

function normalize(s) { return String(s || '').trim().toLowerCase(); }

function extractStateFromFreeText(rawAddress) {
  if (!rawAddress) return null;
  const hay = normalize(rawAddress);
  return IN_STATES.find(st => hay.includes(normalize(st))) || null;
}

function getUserStateFromProfile(profile) {
  return (
    profile?.destination?.state ||
    profile?.address?.state ||
    extractStateFromFreeText(profile?.address) ||
    null
  );
}

function getSafetyScoreForState(state) {
  if (!state) return null;
  // try exact state match first
  const entry = Object.entries(SAFETY_SCORES).find(([k]) => normalize(k) === normalize(state));
  if (entry) return entry[1];

  // common alternate names
  const altMap = {
    'orissa': 'Odisha',
    'national capital territory of delhi': 'Delhi',
    'nct of delhi': 'Delhi',
    'pondicherry': 'Puducherry',
    'dadra & nagar haveli and daman & diu': 'Dadra and Nagar Haveli and Daman and Diu',
  };
  const alt = altMap[normalize(state)];
  if (alt) {
    const e2 = Object.entries(SAFETY_SCORES).find(([k]) => normalize(k) === normalize(alt));
    if (e2) return e2[1];
  }
  return null;
}

function safetyBadge(score) {
  if (score == null) return { label: 'N/A', bg: '#E5E7EB', fg: '#374151' };
  if (score >= 80) return { label: `${Math.round(score)}/100 • Safe`, bg: '#D1FAE5', fg: '#065F46' };
  if (score >= 60) return { label: `${Math.round(score)}/100 • Moderate`, bg: '#FEF3C7', fg: '#92400E' };
  return { label: `${Math.round(score)}/100 • Caution`, bg: '#FEE2E2', fg: '#991B1B' };
}
// ------------------------------------

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
    console.warn('findStoredUid failed', e);
  }
  return null;
}

async function persistProfileToStorage(uid, profile) {
  if (!uid || !profile) return;
  try {
    const key = PROFILE_PREFIX + uid;
    await AsyncStorage.setItem(key, JSON.stringify(profile));
  } catch (e) {
    console.warn('persistProfileToStorage failed', e);
  }
}

export default function HomeScreen({ route, navigation }) {
  const [tourist, setTourist] = useState(route.params?.tourist ?? { id: 'ankit_raj_001', name: 'Ankit Raj' });
  const uidRef = useRef(tourist?.id);

  const [profile, setProfile] = useState(() =>
    sessionService.getProfile ? sessionService.getProfile(uidRef.current) || null : null
  );
  const [luggages, setLuggages] = useState(profile?.luggages ?? []);

  // location-derived state
  const [geoState, setGeoState] = useState(null);
  const [geoError, setGeoError] = useState(null);

  // Animations
  const kycPulseAnim = useRef(new Animated.Value(1)).current;
  const slideUpAnim = useRef(new Animated.Value(30)).current;
  const fadeInAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const chatbotAnim = useRef(new Animated.Value(0)).current;

  const reloadProfile = useCallback(async () => {
    try {
      let uid = uidRef.current || route.params?.tourist?.id;
      if (!uid) uid = await findStoredUid();

      if (!uid) {
        uidRef.current = null;
        setProfile(null);
        setLuggages([]);
        return;
      }

      uidRef.current = uid;

      let p = sessionService.getProfile ? sessionService.getProfile(uid) : null;
      if (!p && typeof sessionService.loadProfileAsync === 'function') {
        p = await sessionService.loadProfileAsync(uid);
      }
      if (!p) {
        const key = PROFILE_PREFIX + uid;
        const raw = await AsyncStorage.getItem(key);
        if (raw) p = JSON.parse(raw);
      }

      if (p) {
        setProfile(p);
        setLuggages(p.luggages || []);
        setTourist({ id: p.id ?? uid, name: p.name ?? 'Ankit Raj' });
        await persistProfileToStorage(uid, p);
      } else {
        setProfile(null);
        setLuggages([]);
      }
    } catch (err) {
      console.warn('reloadProfile error', err);
    }
  }, [route.params?.tourist]);


  
  useEffect(() => {
    const rt = route.params?.tourist;
    if (rt && rt.id) {
      uidRef.current = rt.id;
      setTourist({ id: rt.id, name: rt.name ?? 'User' });
      const minimalProfile = { id: rt.id, name: rt.name ?? '' };
      sessionService.saveProfile(rt.id, minimalProfile);
      reloadProfile();
    }
  }, [route.params?.tourist, reloadProfile]);

  useFocusEffect(useCallback(() => { reloadProfile(); }, [reloadProfile]));

  // 🆕 DEMO DATA FOR ANKIT RAJ - Add this entire block
useEffect(() => {
  const setupDemoDataForAnkit = async () => {
    const userId = 'ankit_raj_001';
    const profileKey = PROFILE_PREFIX + userId;
    
    // Check if demo data already exists
    const existingProfile = await AsyncStorage.getItem(profileKey);
    
    if (!existingProfile) {
      // Create rich demo profile for Ankit Raj
      const demoProfile = {
        id: userId,
        name: 'Ankit Raj',
        email: 'ankit.raj@traveler.com',
        phone: '+91 98765 43210',
        aadhar: 'DEMO-AADHAR-1234',
        nationality: 'Indian',
        address: 'Connaught Place, New Delhi',
        destination: {
          state: 'Assam',
          city: 'Guwahati',
          places: ['Kamakhya Temple', 'Umananda Island']
        },
        emergencyContacts: [
          { name: 'Rahul Sharma', relation: 'Brother', phone: '+91 99887 66554' },
          { name: 'Local Police', relation: 'Emergency', phone: '100' }
        ],
        kycCompleted: true,
        luggages: [
          {
            id: 'LUG-ABC123',
            label: 'Blue Backpack',
            ownerId: userId,
            ownerName: 'Ankit Raj',
            status: 'safe',
            createdAt: new Date().toISOString(),
            qrPayload: JSON.stringify({
              type: 'luggage',
              luggageId: 'LUG-ABC123',
              ownerId: userId,
              ownerName: 'Ankit Raj',
            }),
          },
          {
            id: 'LUG-DEF456',
            label: 'Red Suitcase',
            ownerId: userId,
            ownerName: 'Ankit Raj',
            status: 'safe',
            createdAt: new Date().toISOString(),
            qrPayload: JSON.stringify({
              type: 'luggage',
              luggageId: 'LUG-DEF456',
              ownerId: userId,
              ownerName: 'Ankit Raj',
            }),
          },
          {
            id: 'LUG-GHI789',
            label: 'Camera Bag',
            ownerId: userId,
            ownerName: 'Ankit Raj',
            status: 'lost',
            createdAt: new Date().toISOString(),
            qrPayload: JSON.stringify({
              type: 'luggage',
              luggageId: 'LUG-GHI789',
              ownerId: userId,
              ownerName: 'Ankit Raj',
            }),
          },
          {
            id: 'LUG-JKL012',
            label: 'Travel Backpack',
            ownerId: userId,
            ownerName: 'Ankit Raj',
            status: 'safe',
            createdAt: new Date().toISOString(),
            qrPayload: JSON.stringify({
              type: 'luggage',
              luggageId: 'LUG-JKL012',
              ownerId: userId,
              ownerName: 'Ankit Raj',
            }),
          },
          {
            id: 'LUG-MNO345',
            label: 'Laptop Bag',
            ownerId: userId,
            ownerName: 'Ankit Raj',
            status: 'safe',
            createdAt: new Date().toISOString(),
            qrPayload: JSON.stringify({
              type: 'luggage',
              luggageId: 'LUG-MNO345',
              ownerId: userId,
              ownerName: 'Ankit Raj',
            }),
          },
        ],
        familyId: 'FAM-2026-001',
        familyMembers: [
          { id: 'member_001', name: 'Rahul Sharma', relation: 'Brother', phone: '+91 99887 66554' },
          { id: 'member_002', name: 'Priya Raj', relation: 'Sister', phone: '+91 98765 12345' },
          { id: 'member_003', name: 'Anjali Raj', relation: 'Mother', phone: '+91 98765 11122' }
        ],
        travelHistory: [
          { date: '2026-04-01', location: 'New Delhi', activity: 'Departure' },
          { date: '2026-04-02', location: 'Guwahati', activity: 'Arrival' },
          { date: '2026-04-03', location: 'Kamakhya Temple', activity: 'Sightseeing' }
        ],
      };
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(profileKey, JSON.stringify(demoProfile));
      
      if (sessionService.saveProfile) {
        sessionService.saveProfile(userId, demoProfile);
      }
      
      console.log('✅ Demo data created for Ankit Raj');
      
      // Update state
      setProfile(demoProfile);
      setLuggages(demoProfile.luggages);
      setTourist({ id: userId, name: 'Ankit Raj' });
    } else {
      const parsed = JSON.parse(existingProfile);
      setProfile(parsed);
      setLuggages(parsed.luggages || []);
      setTourist({ id: parsed.id, name: parsed.name || 'Ankit Raj' });
    }
  };
  
  setupDemoDataForAnkit();
}, []);
  
  useEffect(() => {
    if (!profile?.kycCompleted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(kycPulseAnim, { toValue: 1.05, duration: 900, useNativeDriver: true }),
          Animated.timing(kycPulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    }
    Animated.parallel([
      Animated.timing(slideUpAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.timing(fadeInAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    Animated.spring(chatbotAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
  }, [profile, kycPulseAnim, slideUpAnim, fadeInAnim, chatbotAnim]);

  // ---------- Location → State fallback ----------
  const requestLocationPermission = async () => {
    if (Platform.OS === 'ios') {
      const auth = await Geolocation.requestAuthorization('whenInUse');
      return auth === 'granted';
    } else {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  };

  const reverseGeocodeToState = async (lat, lng) => {
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
      throw new Error('Google Maps API key missing');
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status !== 'OK') throw new Error(`Geocode failed: ${data.status}`);

    // Find the administrative_area_level_1 in address_components
    for (const result of data.results || []) {
      const comp = (result.address_components || []).find(c => c.types?.includes('administrative_area_level_1'));
      if (comp?.long_name) return comp.long_name;
    }
    return null;
  };

  const deriveGeoState = useCallback(async () => {
    try {
      const ok = await requestLocationPermission();
      if (!ok) {
        setGeoError('Location permission denied');
        return;
      }
      await new Promise((res, rej) => {
        Geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const { latitude, longitude } = pos.coords || {};
              if (latitude && longitude) {
                const st = await reverseGeocodeToState(latitude, longitude);
                setGeoState(st || null);
                setGeoError(null);
              } else {
                setGeoError('No coordinates');
              }
              res(null);
            } catch (e) {
              setGeoError(e?.message || 'Reverse geocode failed');
              res(null);
            }
          },
          (err) => {
            setGeoError(err?.message || 'Location error');
            res(null);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
      });
    } catch (e) {
      setGeoError(e?.message || 'Location error');
    }
  }, []);

  // Run geolocation ONLY if profile didn’t provide a state
  useEffect(() => {
    const profileState = getUserStateFromProfile(profile);
    if (!profileState) {
      deriveGeoState();
    } else {
      // clear geo fallback if profile has state
      setGeoState(null);
      setGeoError(null);
    }
  }, [profile, deriveGeoState]);

  // ---------- END Location fallback ----------

  const openFullKycScreen = () => navigation.navigate('KYC', { tourist });

  const createLuggage = () => {
    if (!profile?.kycCompleted) {
      Alert.alert('KYC Required', 'Please complete your KYC verification first to register luggage.');
      return;
    }
    const lugId = `LUG-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const newLug = {
      id: lugId,
      label: `Luggage ${luggages.length + 1}`,
      ownerId: profile.id,
      ownerName: profile.name,
      status: 'safe',
      createdAt: new Date().toISOString(),
      qrPayload: JSON.stringify({
        type: 'luggage',
        luggageId: lugId,
        ownerId: profile.id,
        ownerName: profile.name,
      }),
    };
    const updated = { ...profile, luggages: [...(profile.luggages || []), newLug] };
    sessionService.saveProfile(uidRef.current, updated);
    setProfile(updated);
    setLuggages(updated.luggages);
    navigation.navigate('QRCode', {
      mode: 'display',
      qrData: newLug.qrPayload,
      title: `${newLug.label} — QR`,
    });
  };

  const openScanScreen = () => navigation.navigate('QRCode', { mode: 'scan', onScanResult: handleScanResult });

  const handleScanResult = (scanText) => {
    try {
      const parsed = JSON.parse(scanText);
      if (parsed?.type === 'luggage' && parsed.luggageId) {
        const p = sessionService.getProfile(profile.id);
        const found = (p?.luggages || []).find((l) => l.id === parsed.luggageId);
        if (found) {
          Alert.alert('Luggage Found', `Luggage ID: ${parsed.luggageId}\nOwner: ${found.ownerName}\nPhone: ${profile?.phone ?? 'N/A'}`);
        } else {
          Alert.alert('Luggage Scanned', `Luggage ID: ${parsed.luggageId}\nOwner ID: ${parsed.ownerId ?? 'unknown'}`);
        }
      } else {
        Alert.alert('QR Code Scanned', scanText);
      }
    } catch (e) {
      Alert.alert('QR Code Content', scanText);
    }
  };

  const viewLuggage = (luggage) => {
    navigation.navigate('QRCode', {
      mode: 'display',
      qrData: luggage.qrPayload,
      title: `${luggage.label} — QR`,
    });
  };

  const toggleLuggageStatus = (luggageId) => {
    const updatedLugs = (profile.luggages || []).map((l) =>
      l.id === luggageId ? { ...l, status: l.status === 'lost' ? 'safe' : 'lost' } : l
    );
    const updatedProfile = { ...profile, luggages: updatedLugs };
    sessionService.saveProfile(uidRef.current, updatedProfile);
    setProfile(updatedProfile);
    setLuggages(updatedLugs);
  };

  const headerHeight = scrollY.interpolate({ inputRange: [0, 140], outputRange: [160, 96], extrapolate: 'clamp' });
  const headerTitleScale = scrollY.interpolate({ inputRange: [0, 140], outputRange: [1, 0.9], extrapolate: 'clamp' });

  const kycProgress = (() => {
    if (!profile) return 0;
    const fields = ['name', 'aadhar', 'phone', 'address', 'destination', 'emergencyContacts'];
    let filled = 0;
    if (profile.name) filled++;
    if (profile.aadhar) filled++;
    if (profile.phone) filled++;
    if (profile.address) filled++;
    if (profile.destination) filled++;
    if (profile.emergencyContacts && profile.emergencyContacts.length > 0) filled++;
    return Math.round((filled / fields.length) * 100);
  })();

  // ---------- Safety derived values ----------
  const profileState = getUserStateFromProfile(profile);
  const chosenState = profileState || geoState;      // prefer profile, else device location
  const safetyScore = getSafetyScoreForState(chosenState);
  const safety = safetyBadge(safetyScore);
  // ------------------------------------------

  const renderLuggageItem = ({ item }) => (
    <Animated.View style={[styles.luggageCard, { transform: [{ translateY: slideUpAnim }], opacity: fadeInAnim }]}>
      <View style={styles.luggageHeader}>
        <View style={styles.luggageInfo}>
          <Text style={styles.luggageTitle}>{item.label}</Text>
          <Text style={styles.luggageId}>ID: {item.id}</Text>
        </View>
        <View style={[styles.statusBadge, item.status === 'safe' ? styles.statusSafe : styles.statusLost]}>
          <Text style={[styles.statusText, item.status === 'safe' ? styles.statusTextSafe : styles.statusTextLost]}>
            {item.status === 'safe' ? '✓ Safe' : '⚠ Lost'}
          </Text>
        </View>
      </View>
      <View style={styles.luggageActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => viewLuggage(item)}>
          <Text style={styles.actionButtonText}>View QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.statusToggleButton]} onPress={() => toggleLuggageStatus(item.id)}>
          <Text style={styles.statusToggleText}>{item.status === 'lost' ? 'Mark Safe' : 'Mark Lost'}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* HEADER */}
      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <Animated.View style={[styles.headerInner, { transform: [{ scale: headerTitleScale }] }]}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(profile?.name || tourist.name || 'U').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.headerNames}>
              <Text style={styles.greetingText}>Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}</Text>
              <Text style={styles.headerName}>{profile?.name ?? tourist.name}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconCircle} onPress={() => navigation.navigate('Notifications')}>
              <Text style={styles.iconText}>🔔</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.progressChip} onPress={openFullKycScreen}>
              <View style={styles.progressLeft}><Text style={styles.progressNumber}>{kycProgress}%</Text></View>
              <View style={styles.progressRight}><Text style={styles.progressLabel}>{profile?.kycCompleted ? 'Verified' : 'KYC'}</Text></View>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>

      {/* BODY */}
      <View style={styles.surface}>
        <Animated.ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {!profile?.kycCompleted && (
            <Animated.View style={[styles.kycBanner, { transform: [{ scale: kycPulseAnim }] }]}>
              <View style={styles.kycContent}>
                <View style={styles.kycIcon}><Text style={styles.kycIconText}>⚠️</Text></View>
                <View style={styles.kycTextContainer}>
                  <Text style={styles.kycTitle}>Complete Your Verification</Text>
                  <Text style={styles.kycSubtitle}>Unlock all features by completing your KYC</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.kycButton} onPress={openFullKycScreen}>
                <Text style={styles.kycButtonText}>Verify Now</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Stats with Safety Score */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}><Text style={styles.statNumber}>{luggages.length}</Text><Text style={styles.statLabel}>Total Luggage</Text></View>
            <View style={styles.statCard}><Text style={[styles.statNumber, { color: luggages.filter(l => l.status === 'safe').length === luggages.length ? '#10B981' : '#F59E0B' }]}>{luggages.filter(l => l.status === 'safe').length}</Text><Text style={styles.statLabel}>Safe Items</Text></View>
            <View style={styles.statCard}><Text style={styles.statNumber}>{profile?.familyId ? '1' : '0'}</Text><Text style={styles.statLabel}>Family Groups</Text></View>

            {/* Safety Score tile */}
            <View style={[styles.statCard]}>
              <Text style={styles.statNumber}>{safetyScore != null ? Math.round(safetyScore) : '—'}</Text>
              <Text style={styles.statLabel}>Safety Score</Text>
            </View>
          </View>
          
          <View style={styles.mapContainer}>
            <Text style={styles.sectionTitle}>Live Location</Text>
            <View style={styles.mapCard}>
              <MapViewComponent followUser={true} markers={[]} style={styles.mapView} />
              <TouchableOpacity style={styles.mapOverlay} onPress={() => navigation.navigate('MapTab')}>
                <Text style={styles.mapOverlayText}>Tap to expand map</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Safety banner */}
          <View style={{ paddingHorizontal: 20, marginTop: 6, marginBottom: 12 }}>
            <View style={[styles.safetyBanner, { backgroundColor: safety.bg, borderLeftColor: safety.fg }]}>
              <Text style={[styles.safetyBannerTitle, { color: safety.fg }]}>
                {chosenState
                  ? `State: ${chosenState}`
                  : geoError
                    ? `State Unavailable (${geoError})`
                    : 'State Unavailable'}
              </Text>
              <Text style={[styles.safetyBannerSub, { color: safety.fg }]}>{safety.label}</Text>
            </View>
          </View>

          <View style={styles.quickActionsContainer}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsGrid}>
              <TouchableOpacity style={[styles.quickActionCard, !profile?.kycCompleted && styles.quickActionDisabled]} onPress={createLuggage}>
                <View style={styles.quickActionIcon}><Text style={styles.quickActionIconText}>📦</Text></View>
                <Text style={styles.quickActionTitle}>Create Luggage</Text>
                <Text style={styles.quickActionSubtitle}>Generate QR code</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionCard} onPress={openScanScreen}>
                <View style={styles.quickActionIcon}><Text style={styles.quickActionIconText}>📱</Text></View>
                <Text style={styles.quickActionTitle}>Scan QR</Text>
                <Text style={styles.quickActionSubtitle}>Find luggage</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionCard} onPress={() => navigation.navigate('MapTab')}>
                <View style={styles.quickActionIcon}><Text style={styles.quickActionIconText}>🗺️</Text></View>
                <Text style={styles.quickActionTitle}>View Map</Text>
                <Text style={styles.quickActionSubtitle}>Track location</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionCard} onPress={() => navigation.navigate('FamilyTab')}>
                <View style={styles.quickActionIcon}><Text style={styles.quickActionIconText}>👨‍👩‍👧‍👦</Text></View>
                <Text style={styles.quickActionTitle}>Family</Text>
                <Text style={styles.quickActionSubtitle}>Manage group</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.luggageSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Luggage</Text>
              {profile?.kycCompleted && (
                <TouchableOpacity style={styles.addButton} onPress={createLuggage}>
                  <Text style={styles.addButtonText}>+ Add</Text>
                </TouchableOpacity>
              )}
            </View>
            {luggages.length === 0 ? (
  <View style={styles.emptyState}>
    <Text style={styles.emptyIcon}>🧳</Text>
    <Text style={styles.emptyTitle}>No luggage yet</Text>
    <Text style={styles.emptySubtitle}>
      {!profile?.kycCompleted ? 'Complete KYC to start adding luggage' : 'Create your first luggage item to get started'}
    </Text>
  </View>
) : (
  <View style={{ marginTop: 6 }}>
    {luggages.map((item, index) => (
      <View key={item.id} style={{ marginBottom: index === luggages.length - 1 ? 0 : 12 }}>
        <Animated.View style={[styles.luggageCard, { transform: [{ translateY: slideUpAnim }], opacity: fadeInAnim }]}>
          <View style={styles.luggageHeader}>
            <View style={styles.luggageInfo}>
              <Text style={styles.luggageTitle}>{item.label}</Text>
              <Text style={styles.luggageId}>ID: {item.id}</Text>
            </View>
            <View style={[styles.statusBadge, item.status === 'safe' ? styles.statusSafe : styles.statusLost]}>
              <Text style={[styles.statusText, item.status === 'safe' ? styles.statusTextSafe : styles.statusTextLost]}>
                {item.status === 'safe' ? '✓ Safe' : '⚠ Lost'}
              </Text>
            </View>
          </View>
          <View style={styles.luggageActions}>
            <TouchableOpacity style={styles.actionButton} onPress={() => viewLuggage(item)}>
              <Text style={styles.actionButtonText}>View QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.statusToggleButton]} onPress={() => toggleLuggageStatus(item.id)}>
              <Text style={styles.statusToggleText}>{item.status === 'lost' ? 'Mark Safe' : 'Mark Lost'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    ))}
  </View>
)}
          </View>
        </Animated.ScrollView>
      </View>

      {/* FLOATING CHATBOT BUTTON */}
      <Animated.View
        style={[
          styles.chatbotFloat,
          {
            transform: [
              {
                scale: chatbotAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.navigate('Chatbot')}
          activeOpacity={0.85}
          style={styles.chatbotButton}
        >
          <Text style={styles.chatbotIcon}>💬</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 10,
    paddingTop: 3,
    zIndex: 0,
    marginBottom: 0,
  },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  headerNames: { justifyContent: 'center' },
  greetingText: { color: '#9CA3AF', fontSize: 13 },
  headerName: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 42, height: 42, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  iconText: { color: '#fff', fontSize: 16 },
  progressChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10, elevation: 2 },
  progressLeft: { backgroundColor: '#EEF2FF', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 },
  progressNumber: { fontWeight: '800', color: '#3730A3' },
  progressRight: {},
  progressLabel: { fontSize: 12, color: '#0F172A', fontWeight: '700' },
  surface: { flex: 1, backgroundColor: '#F8FAFC', borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -80, zIndex: 1, paddingTop: 15 },
  kycBanner: { margin: 20, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, borderLeftWidth: 4, borderLeftColor: '#F59E0B' },
  kycContent: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  kycIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#FDE68A', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  kycIconText: { fontSize: 18 },
  kycTextContainer: { flex: 1 },
  kycTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  kycSubtitle: { fontSize: 13, color: '#A16207' },
  kycButton: { backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignSelf: 'flex-end' },
  kycButtonText: { color: '#fff', fontWeight: '800' },

  statsContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 12, marginBottom: 12 },
  statCard: { flexGrow: 1, minWidth: (width - 20*2 - 12*3)/4, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 6 },

  mapContainer: { paddingHorizontal: 20, marginBottom: 12 },
  mapCard: { height: 180, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  mapView: { flex: 1 },
  mapOverlay: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(15,23,42,0.8)', padding: 8, borderRadius: 8, alignItems: 'center' },
  mapOverlayText: { color: '#fff', fontWeight: '700' },

  // Safety banner styles
  safetyBanner: { borderRadius: 12, padding: 12, borderLeftWidth: 4 },
  safetyBannerTitle: { fontSize: 14, fontWeight: '800' },
  safetyBannerSub: { fontSize: 12, fontWeight: '700', marginTop: 4 },

  quickActionsContainer: { paddingHorizontal: 20, marginBottom: 12 },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  quickActionCard: { width: (width - 56) / 2, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, alignItems: 'center' },
  quickActionDisabled: { opacity: 0.5 },
  quickActionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickActionIconText: { fontSize: 18 },
  quickActionTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  quickActionSubtitle: { fontSize: 12, color: '#6B7280', textAlign: 'center' },

  luggageSection: { paddingHorizontal: 20, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#111827', marginBottom: 12 },
  addButton: { backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  addButtonText: { color: '#fff', fontWeight: '800' },
  luggageCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  luggageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  luggageInfo: { flex: 1 },
  luggageTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  luggageId: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusSafe: { backgroundColor: '#D1FAE5' },
  statusLost: { backgroundColor: '#FEE2E2' },
  statusText: { fontWeight: '700' },
  statusTextSafe: { color: '#065F46' },
  statusTextLost: { color: '#991B1B' },
  luggageActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  actionButton: { backgroundColor: '#F3F4F6', paddingVertical: 10, borderRadius: 10, alignItems: 'center', paddingHorizontal: 16 },
  actionButtonText: { color: '#374151', fontWeight: '700' },
  statusToggleButton: { backgroundColor: '#FEE2E2' },
  statusToggleText: { color: '#991B1B', fontWeight: '800' },

  emptyState: { alignItems: 'center', padding: 28, backgroundColor: '#fff', borderRadius: 12, marginTop: 12 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center' },

  chatbotFloat: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    elevation: 10,
    zIndex:2,
  },
  chatbotButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  chatbotIcon: { fontSize: 24, color: '#fff' },
});
