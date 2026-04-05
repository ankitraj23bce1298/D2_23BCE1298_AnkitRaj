// src/screens/LoginScreen.js
//
// QR login screen redesigned to match the app theme used across Home / Family / Map screens.
// - Merged dark header in SafeAreaView
// - Clear instructions, card-like scanner area, and helpful actions (Skip, Manual ID entry)
// - Shows a small preview once scanned and a Continue button
// - Uses same color palette (dark header, blue accents, soft cards)
// - Copy-paste ready

import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import QRCodeScanner from 'react-native-qrcode-scanner';

export default function LoginScreen({ navigation }) {
  const [scanned, setScanned] = useState(null);
  const [scanningError, setScanningError] = useState(null);

  function onSuccess(e) {
    try {
      const payload = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      // Basic validation
      if (!payload?.id) {
        throw new Error('Missing id in payload');
      }
      setScanned(payload);
      setScanningError(null);
      // Replace navigation to Home with the scanned tourist
      // small delay to allow user to see preview (optional)
      setTimeout(() => {
        navigation.replace('Home', { tourist: payload });
      }, 600);
    } catch (err) {
      console.warn('Invalid QR payload', err);
      setScanningError('QR invalid or unsupported');
      Alert.alert('Invalid QR', 'The scanned QR code is not a valid Digital Tourist ID.');
    }
  }

  function handleSkipDemo() {
    navigation.replace('Home', { tourist: { id: 'demo', name: 'Ankit Raj' } });
  }

  function handleManualEntry() {
    Alert.prompt(
      'Manual ID',
      'Enter tourist ID (demo mode)',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Open',
          onPress: (text) => {
            if (!text) return;
            navigation.replace('Home', { tourist: { id: text.trim(), name: `User ${text.trim()}` } });
          },
        },
      ],
      'plain-text',
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1F2937" />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Scan Digital ID</Text>
            <Text style={styles.headerSubtitle}>Point your camera at a valid QR code</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleManualEntry}>
            <Text style={styles.iconBtnText}>Manual</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.scannerCard}>
          <Text style={styles.instruction}>Align the QR code inside the frame</Text>

          <View style={styles.scannerWrapper}>
            <QRCodeScanner
              onRead={onSuccess}
              fadeIn
              reactivate={false}
              showMarker
              markerStyle={styles.marker}
              topContent={<Text style={styles.topHint}>Scanning...</Text>}
              bottomContent={null}
              cameraStyle={styles.camera}
            />
          </View>

          <Text style={styles.hint}>Tip: Use the device camera in good lighting for best results</Text>

          {scanningError ? <Text style={styles.errorText}>{scanningError}</Text> : null}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkipDemo}>
            <Text style={styles.skipBtnText}>Skip (Demo)</Text>
          </TouchableOpacity>

          {scanned ? (
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={() => navigation.replace('Home', { tourist: scanned })}
            >
              <Text style={styles.continueBtnText}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.continueBtn, styles.continueBtnDisabled]}
              onPress={() => Alert.alert('No scan yet', 'Please scan a QR code or use Manual entry.')}
            >
              <Text style={styles.continueBtnText}>Continue</Text>
            </TouchableOpacity>
          )}
        </View>

        {scanned && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Scanned ID Preview</Text>
            <Text style={styles.previewLine}>ID: <Text style={styles.previewValue}>{scanned.id}</Text></Text>
            <Text style={styles.previewLine}>Name: <Text style={styles.previewValue}>{scanned.name ?? '—'}</Text></Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    backgroundColor: '#1F2937',
    paddingTop: Platform.OS === 'ios' ? 14 : 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    elevation: 6,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  backIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#9CA3AF', marginTop: 2, fontSize: 12 },

  headerActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  iconBtnText: { color: '#fff', fontWeight: '700' },

  content: { flex: 1, padding: 16, paddingTop: 20 },

  scannerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    elevation: 3,
    borderWidth: 1,
    borderColor: '#EFF6FF',
  },
  instruction: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  scannerWrapper: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 12,
  },
  camera: {
    height: '100%',
    width: '100%',
  },
  marker: {
    borderColor: '#3B82F6',
    borderRadius: 8,
    borderWidth: 2,
  },
  topHint: { color: '#fff', fontSize: 12, paddingTop: 6 },

  hint: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  errorText: { color: '#DC2626', fontWeight: '700', marginTop: 4 },

  actionsRow: {
    flexDirection: 'row',
    marginTop: 16,
    justifyContent: 'space-between',
    width: '100%',
  },
  skipBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 12,
  },
  skipBtnText: { color: '#374151', fontWeight: '800' },

  continueBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.6 },
  continueBtnText: { color: '#fff', fontWeight: '900' },

  previewCard: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EFF6FF',
  },
  previewTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginBottom: 8 },
  previewLine: { fontSize: 14, color: '#374151', marginBottom: 4 },
  previewValue: { fontWeight: '800', color: '#0F172A' },
});
