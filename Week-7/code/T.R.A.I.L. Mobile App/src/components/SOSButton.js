import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  AppState,
} from 'react-native';
import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';

// FALL DETECTION PARAMETERS
const ACC_THRESHOLD_G = 2.4;
const QUIET_WINDOW_MS = 2500;
const ACC_POLL_INTERVAL_MS = 200;

export default function SOSButton({ onPress }) {
  const [isArmed, setIsArmed] = useState(true);
  const accelerometerSubscription = useRef(null);
  const lastSpikeTime = useRef(0);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      stopAccelerometer();
    };
  }, []);

  useEffect(() => {
    if (isArmed && appState.current === 'active') startAccelerometer();
    else stopAccelerometer();
  }, [isArmed]);

  function handleAppStateChange(nextAppState) {
    appState.current = nextAppState;
    if (nextAppState !== 'active') stopAccelerometer();
    else if (isArmed) startAccelerometer();
  }

  // Fall detection logic remains the same
  function startAccelerometer() {
    if (accelerometerSubscription.current) return;
    setUpdateIntervalForType(SensorTypes.accelerometer, ACC_POLL_INTERVAL_MS);
    accelerometerSubscription.current = accelerometer.subscribe(
      ({ x, y, z }) => {
        const g = Math.sqrt(Math.pow(x / 9.81, 2) + Math.pow(y / 9.81, 2) + Math.pow(z / 9.81, 2));
        if (g >= ACC_THRESHOLD_G) {
          lastSpikeTime.current = Date.now();
          setTimeout(() => {
            if (Date.now() - lastSpikeTime.current >= QUIET_WINDOW_MS) {
              // Trigger the parent's SOS press handler for fall detection
              onPress('fall_detected');
            }
          }, QUIET_WINDOW_MS);
        }
      },
      () => {}
    );
  }

  function stopAccelerometer() {
    if (accelerometerSubscription.current) {
      accelerometerSubscription.current.unsubscribe();
      accelerometerSubscription.current = null;
    }
  }

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.sosBtn}
        onPress={() => onPress('manual_button')} // Trigger modal
        onLongPress={() => onPress('long_press')} // Also trigger modal
      >
        <Text style={styles.sosText}>SOS</Text>
      </TouchableOpacity>
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ fontSize: 14, color: '#424242', fontWeight: '500' }}>
          Hold for 1s or Tap to Send Alert
        </Text>
      </View>
       <TouchableOpacity
          style={[styles.small, { backgroundColor: isArmed ? '#F44336' : '#999', marginTop: 10 }]}
          onPress={() => setIsArmed((s) => !s)}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{isArmed ? 'Fall Detection ON' : 'Fall Detection OFF'}</Text>
        </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  sosBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#D32F2F',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D32F2F',
    shadowOpacity: 0.4,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.5)'
  },
  sosText: { color: '#fff', fontWeight: '900', fontSize: 28 },
  small: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
});
