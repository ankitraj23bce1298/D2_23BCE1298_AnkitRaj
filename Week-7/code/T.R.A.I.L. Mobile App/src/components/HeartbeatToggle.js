// src/components/HeartbeatToggle.js
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import api from '../services/api';

export default function HeartbeatToggle({ tourist }) {
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => stopHeartbeat();
  }, []);

  function stopHeartbeat() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
  }

  async function sendHeartbeatNow() {
    try {
      Geolocation.getCurrentPosition(
        (pos) => {
          const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          api.sendHeartbeat(tourist.id, loc)
            .then(() => console.log('[Heartbeat] sent', loc))
            .catch((e) => console.warn('[Heartbeat] error', e));
        },
        (err) => console.warn('Heartbeat geoloc error', err),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
      );
    } catch (e) {
      console.warn('sendHeartbeatNow error', e);
    }
  }

  function startHeartbeat(intervalMs = 10000) {
    if (running) return;
    sendHeartbeatNow(); // immediate
    intervalRef.current = setInterval(sendHeartbeatNow, intervalMs);
    setRunning(true);
    Alert.alert('Heartbeat', 'Automatic heartbeat started (dev mode)');
  }

  function toggle() {
    if (running) stopHeartbeat();
    else startHeartbeat();
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity onPress={toggle} style={[styles.btn, running ? styles.btnOn : styles.btnOff]}>
        <Text style={styles.btnText}>{running ? 'Stop Heartbeat' : 'Start Heartbeat'}</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>Sends periodic location to API (stub) for family tracking.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: 8 },
  btn: { padding: 10, borderRadius: 8, minWidth: 160, alignItems: 'center' },
  btnOn: { backgroundColor: '#2e7d32' },
  btnOff: { backgroundColor: '#ff6f00' },
  btnText: { color: '#fff', fontWeight: '700' },
  hint: { color: '#666', fontSize: 12, marginTop: 6, textAlign: 'center' },
});
