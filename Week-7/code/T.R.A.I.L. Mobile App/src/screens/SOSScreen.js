// src/screens/SOSScreen.js
// Police and Hospital lists replaced with single "Nearest" entries.
// Police phone -> 100, Hospital phone -> 108.
// Navigate opens native maps search for "police" / "hospital".

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Vibration,
  ScrollView,
  Linking,
  Share,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import SOSButton from '../components/SOSButton';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// --- CONFIG (keep null if you don't want to call Places API) ---
const GOOGLE_PLACES_API_KEY = null;
const PLACES_RADIUS_METERS = 5000;

// --- Mock Tourist ---
const MOCK_TOURIST = { id: 'tourist123', name: 'Alex Doe' };

// --- Built-in "Nearest" entries for police and hospitals ---
const MOCK_NEARBY_PLACES = {
  police: [
    {
      id: 'p_nearest',
      name: 'Nearest Police Station',
      address: '',
      phone: '100',
      latitude: null,
      longitude: null,
      distance: '',
      searchQuery: 'police',
    },
  ],
  hospitals: [
    {
      id: 'h_nearest',
      name: 'Nearest Hospital',
      address: '',
      phone: '108',
      latitude: null,
      longitude: null,
      distance: '',
      searchQuery: 'hospital',
    },
  ],
};

export default function SOSScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [nearby, setNearby] = useState({ police: [], hospitals: [] });
  const [placesLoading, setPlacesLoading] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState(null);
  const countdownInterval = useRef(null);
  const sosReason = useRef('manual_button');

  // Load emergency contact from backend (/profiles/me), navigation params, or AsyncStorage (KYC)
  useEffect(() => {
    let cancelled = false;
    async function loadEmergencyContact() {
      try {
        // 1) Try backend profile (preferred) using apiFetch
        try {
          // dynamic import to avoid circular issues if api isn't available in some contexts
          const { apiFetch } = require('../services/api');
          const resp = await apiFetch('/profiles/me');
          if (resp && resp.ok && resp.body) {
            const user = resp.body;
            // emergencyContacts may be JSON array or object
            const ec = user.emergencyContacts;
            if (ec) {
              if (Array.isArray(ec) && ec.length > 0) {
                const first = ec[0];
                const phone = typeof first === 'string' ? first : first.phone || null;
                if (phone && !cancelled) { setEmergencyContact(phone); return; }
              } else if (typeof ec === 'object') {
                const phone = ec.phone || null;
                if (phone && !cancelled) { setEmergencyContact(phone); return; }
              }
            }
          }
        } catch (be) {
          // ignore backend errors and fallback
        }

        // 2) Check navigation params
        const navContact = navigation?.getParam ? navigation.getParam('emergencyContact') : null;
        if (navContact) {
          if (!cancelled) setEmergencyContact(navContact);
          return;
        }
        // 3) Check route params (React Navigation v5+)
        const routeContact = navigation?.route?.params?.emergencyContact;
        if (routeContact) {
          if (!cancelled) setEmergencyContact(routeContact);
          return;
        }
        // 4) Fallback to AsyncStorage where KYC may have stored contact under 'emergencyContact'
        const stored = await AsyncStorage.getItem('emergencyContact');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!cancelled) setEmergencyContact(parsed?.phone || parsed);
        }
      } catch (e) {
        // ignore and fallback to built-in numbers
      }
    }
    loadEmergencyContact();
    return () => { cancelled = true; };
  }, [navigation]);

  useEffect(() => {
    // mock async location fetch - replace with real geolocation if desired
    const fetchLocation = () => {
      setTimeout(() => {
        const initialLocation = {
          latitude: 12.8238,
          longitude: 80.0437,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setLocation(initialLocation);
      }, 700);
    };
    fetchLocation();
  }, []);

  // Open native maps search for a query
  const openMapsSearch = async (query) => {
    try {
      if (Platform.OS === 'ios') {
        const appleMapsURL = `maps://?q=${encodeURIComponent(query)}`;
        const appleMapsHttp = `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
        const supported = await Linking.canOpenURL(appleMapsURL);
        if (supported) {
          await Linking.openURL(appleMapsURL);
        } else {
          await Linking.openURL(appleMapsHttp);
        }
      } else {
        const geo = `geo:0,0?q=${encodeURIComponent(query)}`;
        const googleMaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
        const supported = await Linking.canOpenURL(geo);
        if (supported) {
          await Linking.openURL(geo);
        } else {
          await Linking.openURL(googleMaps);
        }
      }
    } catch (err) {
      const fallback = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      Linking.openURL(fallback).catch(() => {
        Alert.alert('Error', 'Could not open maps app.');
      });
    }
  };

  // Fetch nearby places: we keep police & hospital as built-in nearest entries.
  useEffect(() => {
    if (!location) return;
    let cancelled = false;

    async function fetchNearbyPlaces() {
      setPlacesLoading(true);
      try {
        // If you had a Google key you might call Places for richer results.
        // For now use the simple nearest placeholders
        setNearby(MOCK_NEARBY_PLACES);
      } catch (err) {
        setNearby(MOCK_NEARBY_PLACES);
      } finally {
        if (!cancelled) setPlacesLoading(false);
      }
    }

    fetchNearbyPlaces();
    return () => {
      cancelled = true;
    };
  }, [location]);

  useEffect(() => {
    if (isModalVisible && countdown > 0) {
      // start countdown
      countdownInterval.current = setInterval(() => {
        setCountdown((prev) => prev - 1);
        // short vibration tick
        Vibration.vibrate(200);
      }, 1000);
    } else if (countdown === 0) {
      clearInterval(countdownInterval.current);
      triggerFinalSOS();
    }
    return () => clearInterval(countdownInterval.current);
  }, [isModalVisible, countdown]);

  // Returns the first available emergency number, preferring user's KYC emergency contact
  const getFirstEmergencyNumber = () => {
    // 1) If user provided an emergency contact during KYC (state holds phone or object)
    if (emergencyContact) {
      // emergencyContact might be a string phone or an object { name, phone }
      if (typeof emergencyContact === 'string' && emergencyContact.trim().length > 0) return emergencyContact;
      if (typeof emergencyContact === 'object' && emergencyContact.phone) return emergencyContact.phone;
    }

    // 2) Check nearby police list
    if (nearby && nearby.police && nearby.police.length && nearby.police[0].phone) {
      return nearby.police[0].phone;
    }
    // 3) Check nearby hospitals
    if (nearby && nearby.hospitals && nearby.hospitals.length && nearby.hospitals[0].phone) {
      return nearby.hospitals[0].phone;
    }
    // 4) fallback to mock data
    if (MOCK_NEARBY_PLACES.police && MOCK_NEARBY_PLACES.police[0].phone) return MOCK_NEARBY_PLACES.police[0].phone;
    if (MOCK_NEARBY_PLACES.hospitals && MOCK_NEARBY_PLACES.hospitals[0].phone) return MOCK_NEARBY_PLACES.hospitals[0].phone;
    return '100';
  };

  const handleSosPress = (reason) => {
    sosReason.current = reason || 'manual_button';
    setCountdown(5);
    setModalVisible(true);
    Vibration.vibrate(300);

    // Create SOS record on backend immediately (optional)
    (async () => {
      try {
        const { apiFetch } = require('../services/api');
        await apiFetch('/sos', { method: 'POST', body: JSON.stringify({ reason: sosReason.current, location }) });
      } catch (e) {
        // ignore
      }
    })();

    // DO NOT initiate call here — call will be made automatically when countdown reaches 0
  };

  const cancelSOS = () => {
    setModalVisible(false);
    clearInterval(countdownInterval.current);
    setCountdown(5);
  };

  const triggerFinalSOS = () => {
    setModalVisible(false);
    setCountdown(5);

    // Make the phone call to the preferred emergency contact (if available)
    const emergencyNumber = getFirstEmergencyNumber();
    if (emergencyNumber) {
      // Attempt to call — this will open the device dialer. Note: mobile OSs do not allow silent calls without user interaction.
      handlePhoneCall(emergencyNumber);
    }

    Alert.alert(
      'SOS Sent',
      `An alert for "${sosReason.current}" has been sent to your emergency contacts.`
    );
    // TODO: hook into real alert backend or local notification logic
  };

  const shareLiveLocation = async () => {
    if (!location) {
      Alert.alert('Location not ready', 'Unable to share — location not available yet.');
      return;
    }
    try {
      const googleMapsUrl = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
      await Share.share({
        message: `I'm sharing my live location: ${googleMapsUrl}`,
        title: 'My Live Location',
      });
    } catch (error) {
      Alert.alert('Error', 'Could not share location.');
    }
  };

  const handlePhoneCall = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert('Phone not available', 'Phone number not available for this place.');
      return;
    }
    // Ensure proper tel: URL and catch errors
    const telUrl = `tel:${phoneNumber}`;
    Linking.canOpenURL(telUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(telUrl);
        }
        // Some Android devices may not support tel: schema in simulator — still try http fallback
        return Linking.openURL(`tel:${phoneNumber}`);
      })
      .catch(() => {
        Alert.alert('Error', 'Could not initiate phone call.');
      });
  };

  // If coords exist -> open directions; otherwise perform a maps search (nearest).
  const handleNavigation = (place) => {
    if (place && place.latitude && place.longitude) {
      const url = Platform.select({
        ios: `maps://?daddr=${place.latitude},${place.longitude}&dirflg=d`,
        android: `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}&travelmode=driving`,
      });
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Could not open navigation app.');
      });
    } else if (place && place.searchQuery) {
      openMapsSearch(place.searchQuery);
    } else {
      // fallback to generic hospital search
      openMapsSearch('hospital');
    }
  };

  const toggleMapSize = () => {
    setMapExpanded((v) => !v);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header merged into SafeAreaView for consistent top color */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.headerTitle}>Emergency Assistance</Text>
            <Text style={styles.headerSubtitle}>Quick access to police & hospitals</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerAction} onPress={shareLiveLocation}>
            <Text style={styles.headerActionText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerAction, { marginLeft: 8, backgroundColor: '#EEF2FF' }]}
            onPress={() => {
              // quick open maps search for police
              openMapsSearch('police');
            }}
          >
            <Text style={[styles.headerActionText, { color: '#1E40AF' }]}>Find</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={[styles.contentContainer, mapExpanded && styles.contentCompressed]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* SOS Button card */}
        <View style={styles.sosCard}>
          <View style={styles.sosCardInner}>
            <View style={{ alignItems: 'center' }}>
              <SOSButton tourist={MOCK_TOURIST} location={location} onPress={handleSosPress} />
              <Text style={styles.sosHint}>Hold the button to trigger SOS (5s countdown)</Text>
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.rowActions}>
          <TouchableOpacity style={styles.quickAction} onPress={shareLiveLocation}>
            <View style={styles.quickActionIcon}><Text style={styles.quickActionIconText}>📍</Text></View>
            <Text style={styles.quickActionLabel}>Share Location</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.quickAction, styles.quickActionPrimary]} onPress={() => handlePhoneCall('108')}>
            <View style={[styles.quickActionIcon, styles.quickActionIconPrimary]}><Text style={styles.quickActionIconText}>🚨</Text></View>
            <Text style={[styles.quickActionLabel, styles.quickActionLabelPrimary]}>Emergency Call</Text>
          </TouchableOpacity>
        </View>

        {/* Police card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconContainerPolice}>
              <Text style={styles.cardIcon}>🚔</Text>
            </View>
            <View>
              <Text style={styles.cardTitle}>Police Stations</Text>
              <Text style={styles.cardSubtitle}>Nearest police & emergency services</Text>
            </View>
          </View>

          {placesLoading ? (
            <View style={styles.cardBody}>
              <ActivityIndicator size="small" color="#3B82F6" />
            </View>
          ) : (
            nearby.police.map((place) => (
              <View key={place.id} style={styles.placeRow}>
                <View style={styles.placeInfo}>
                  <Text style={styles.placeName}>{place.name}</Text>
                  {place.address ? <Text style={styles.placeAddress}>{place.address}</Text> : null}
                  <Text style={styles.placeDistance}>{place.distance || 'Nearby'}</Text>
                </View>

                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity style={[styles.actionButton, styles.navigateButton]} onPress={() => handleNavigation(place)}>
                    <Text style={styles.actionButtonText}>🧭 Navigate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, styles.callButton]} onPress={() => handlePhoneCall(place.phone ?? '100')}>
                    <Text style={styles.actionButtonText}>📞 Call</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Hospital card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconContainerHospital}>
              <Text style={styles.cardIcon}>🏥</Text>
            </View>
            <View>
              <Text style={styles.cardTitle}>Hospitals</Text>
              <Text style={styles.cardSubtitle}>Nearest medical help & emergency care</Text>
            </View>
          </View>

          {placesLoading ? (
            <View style={styles.cardBody}>
              <ActivityIndicator size="small" color="#3B82F6" />
            </View>
          ) : (
            nearby.hospitals.map((place) => (
              <View key={place.id} style={styles.placeRow}>
                <View style={styles.placeInfo}>
                  <Text style={styles.placeName}>{place.name}</Text>
                  {place.address ? <Text style={styles.placeAddress}>{place.address}</Text> : null}
                  <Text style={styles.placeDistance}>{place.distance || 'Nearby'}</Text>
                </View>

                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity style={[styles.actionButton, styles.navigateButton]} onPress={() => handleNavigation(place)}>
                    <Text style={styles.actionButtonText}>🧭 Navigate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, styles.callButton]} onPress={() => handlePhoneCall(place.phone ?? '108')}>
                    <Text style={styles.actionButtonText}>📞 Call</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Countdown Modal */}
      <Modal animationType="fade" transparent={true} visible={isModalVisible} onRequestClose={cancelSOS}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SENDING SOS</Text>
              <View style={styles.sosIndicator} />
            </View>

            <View style={styles.countdownCircle}>
              <Text style={styles.countdownText}>{countdown}</Text>
              <Text style={styles.countdownLabel}>seconds</Text>
            </View>

            <Text style={styles.modalSubtitle}>Alerting your emergency contacts and local authorities</Text>

            <TouchableOpacity style={styles.cancelButton} onPress={cancelSOS}>
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 14 : 12,
    paddingBottom: 14,
    backgroundColor: '#1F2937',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  backBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  backIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerAction: { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  headerActionText: { color: '#fff', fontWeight: '700' },

  contentContainer: { flex: 1 },
  contentCompressed: { flex: 0.5 },

  mapStrip: {
    height: height * 0.18,
    margin: 18,
    borderRadius: 14,
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  mapStripExpanded: {
    height: height * 0.36,
  },
  mapStripInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapStripText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  mapToggle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  mapToggleText: { fontSize: 22, fontWeight: '700', color: '#374151' },

  sosCard: {
    marginHorizontal: 18,
    marginTop: 13,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    alignItems: 'center',
  },
  sosCardInner: { width: '100%', alignItems: 'center' },
  sosHint: { marginTop: 12, fontSize: 13, color: '#6B7280' },

  sosQuickRow: { marginTop: 12, flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  sosSmallBtn: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginHorizontal: 6, elevation: 2 },
  sosSmallBtnPrimary: { backgroundColor: '#3B82F6' },
  sosSmallIcon: { fontSize: 20, marginBottom: 4 },
  sosSmallLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },

  rowActions: { flexDirection: 'row', paddingHorizontal: 18, marginTop: 18, marginBottom: 8 },
  quickAction: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', elevation: 2, marginRight: 12 },
  quickActionPrimary: { backgroundColor: '#3B82F6', marginRight: 0 },
  quickActionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  quickActionIconPrimary: { backgroundColor: '#EDEBFF' },
  quickActionIconText: { fontSize: 18 },
  quickActionLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
  quickActionLabelPrimary: { color: '#fff' },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    marginHorizontal: 18,
    marginTop: 18,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
  cardHeader: {     flexDirection: 'row',     alignItems: 'center',     padding: 16,     paddingBottom: 12,     borderBottomWidth: 1,     borderBottomColor: '#F3F4F6',   },

  cardIconContainerPolice: {     width: 48,     height: 48,     borderRadius: 12,     backgroundColor: '#E0F2FE',     justifyContent: 'center',     alignItems: 'center',     marginRight: 12,   },
  cardIconContainerHospital: {     width: 48,     height: 48,     borderRadius: 12,     backgroundColor: '#FEF3E8',     justifyContent: 'center',     alignItems: 'center',     marginRight: 12,   },
  cardIcon: { fontSize: 18 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  cardSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  cardBody: { padding: 16 },

  placeRow: {     flexDirection: 'row',     paddingHorizontal: 16,     paddingVertical: 14,     alignItems: 'center',     borderBottomWidth: 1,     borderBottomColor: '#F8FAFC',   },
  placeInfo: { flex: 1, marginRight: 12 },
  placeName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  placeAddress: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  placeDistance: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginTop: 6 },

  actionButtonsRow: { flexDirection: 'column', alignItems: 'flex-end' },
  actionButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, minWidth: 110, alignItems: 'center', justifyContent: 'center', marginBottom: 8, elevation: 2 },
  navigateButton: { backgroundColor: '#3B82F6' },
  callButton: { backgroundColor: '#10B981' },
  actionButtonText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

  bottomSpacing: { height: 28 },

  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(2,6,23,0.6)' },
  modalContent: { backgroundColor: '#FFF', borderRadius: 20, padding: 28, alignItems: 'center', width: width * 0.86, maxWidth: 420 },
  modalHeader: { alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#DC2626', marginBottom: 8 },
  sosIndicator: { width: 44, height: 6, backgroundColor: '#DC2626', borderRadius: 6 },
  countdownCircle: {     width: 140, height: 140, borderRadius: 70, backgroundColor: '#DC2626',     alignItems: 'center', justifyContent: 'center', marginBottom: 18, elevation: 10,   },
  countdownText: { fontSize: 48, color: '#FFF', fontWeight: '900', lineHeight: 52 },
  countdownLabel: { fontSize: 12, color: '#FFF', fontWeight: '700', opacity: 0.95 },
  modalSubtitle: { fontSize: 15, textAlign: 'center', color: '#6B7280', marginBottom: 18, lineHeight: 20 },
  cancelButton: { backgroundColor: '#374151', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 28 },
  cancelButtonText: { color: '#FFF', fontSize: 15, fontWeight: '800', textAlign: 'center' },
});
