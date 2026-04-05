// screens/QRCodeScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import QRCode from 'react-native-qrcode-svg';
import { CameraKitCameraScreen } from 'react-native-camera-kit';

export default function QRCodeScreen({ route, navigation }) {
  const { mode = 'display', qrData = '', title = 'QR Code', onScanResult } = route.params || {};
  const [hasScanned, setHasScanned] = useState(false);

  useEffect(() => {
    navigation.setOptions?.({ title: title || (mode === 'scan' ? 'Scan QR' : 'QR Code') });
  }, [navigation, title, mode]);

  const handleScan = useCallback(
    (event) => {
      if (hasScanned) return;
      setHasScanned(true);

      try {
        const text = event?.nativeEvent?.codeStringValue || event?.codeStringValue || '';
        if (!text) throw new Error('No QR content');

        // If a callback was provided (HomeScreen passes one), use it
        if (typeof onScanResult === 'function') {
          onScanResult(text);
        } else {
          // Fallback: try to parse and show a quick summary
          let parsed = null;
          try { parsed = JSON.parse(text); } catch {}
          if (parsed?.type === 'luggage') {
            Alert.alert(
              'Luggage QR',
              `ID: ${parsed?.luggageId}\nOwner: ${parsed?.ownerName || 'N/A'}`
            );
          } else {
            Alert.alert('QR Scanned', text.slice(0, 300));
          }
        }
      } catch (err) {
        Alert.alert('Scan Error', err?.message || 'Failed to read the QR.');
      } finally {
        // Close screen after a short delay for UX
        setTimeout(() => navigation.goBack(), 400);
      }
    },
    [hasScanned, onScanResult, navigation]
  );

  if (mode === 'scan') {
    return (
      <SafeAreaView style={styles.safeDark}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        <View style={styles.scanHeader}>
          <Text style={styles.scanTitle}>Scan QR</Text>
          <Text style={styles.scanSub}>Align the QR within the frame</Text>
        </View>

        <View style={styles.cameraWrap}>
          <CameraKitCameraScreen
            style={styles.camera}
            cameraOptions={{
              flashMode: 'auto',
              focusMode: 'on',
              zoomMode: 'on',
              ratioOverlay: '1:1',
              showFrame: true,
              frameColor: '#3B82F6',
              laserColor: '#3B82F6',
            }}
            scanBarcode
            onReadCode={handleScan} // event.nativeEvent.codeStringValue
            hideControls
          />
        </View>

        <View style={styles.scanFooter}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // display mode
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title || 'QR Code'}</Text>
        <Text style={styles.headerSub}>Show this code when needed</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.qrBox}>
          {qrData ? (
            <QRCode value={qrData} size={240} ecl="M" />
          ) : (
            <Text style={styles.placeholder}>No QR data</Text>
          )}
        </View>
        {qrData ? (
          <Text style={styles.caption} numberOfLines={2}>
            {(() => {
              try {
                const obj = JSON.parse(qrData);
                if (obj?.type === 'luggage') {
                  return `Luggage: ${obj?.luggageId}\nOwner: ${obj?.ownerName || 'N/A'}`;
                }
              } catch {}
              return qrData;
            })()}
          </Text>
        ) : null}
      </View>

      <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.doneText}>Done</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A', alignItems: 'center', paddingTop: 10 },
  safeDark: { flex: 1, backgroundColor: '#0F172A' },

  header: { width: '100%', paddingHorizontal: 20, marginTop: 6, marginBottom: 8 },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 20 },
  headerSub: { color: 'rgba(255,255,255,0.7)', marginTop: 4, fontWeight: '600' },

  card: {
    backgroundColor: '#fff',
    width: '88%',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 18,
  },
  qrBox: { backgroundColor: '#F3F4F6', padding: 14, borderRadius: 16 },
  caption: { color: '#111827', textAlign: 'center', marginTop: 14, fontWeight: '600' },
  placeholder: { color: '#6B7280' },

  doneBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  doneText: { color: '#fff', fontWeight: '800' },

  scanHeader: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  scanTitle: { color: '#fff', fontWeight: '800', fontSize: 20 },
  scanSub: { color: 'rgba(255,255,255,0.7)', marginTop: 4, fontWeight: '600' },

  cameraWrap: { flex: 1, overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  camera: { flex: 1 },

  scanFooter: { padding: 16, alignItems: 'center' },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  cancelText: { color: '#fff', fontWeight: '700' },
});
