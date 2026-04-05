// src/screens/GroupModeScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import api from '../services/api';

export default function GroupModeScreen({ route }) {
  // if backend exists, load group members for passed familyId or demo
  const familyId = route?.params?.familyId ?? null;
  const [members, setMembers] = useState([
    { id: 'u1', name: 'Alice', loc: { lat: 28.6, lon: 77.2 } },
    { id: 'u2', name: 'Bob', loc: { lat: 28.61, lon: 77.21 } },
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      // try to fetch live group members if api provides endpoint
      try {
        if (api && typeof api.getGroupMembers === 'function' && familyId) {
          setLoading(true);
          const gm = await api.getGroupMembers(familyId);
          if (Array.isArray(gm) && gm.length) setMembers(gm);
        }
      } catch (e) {
        console.warn('Group fetch failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [familyId]);

  function checkDistance(member) {
    const dist = Math.round(Math.random() * 200); // mocked
    if (dist > 100) {
      Alert.alert('Stray detected', `${member.name} is ${dist} m away from group`);
    } else {
      Alert.alert('OK', `${member.name} within range (${dist} m)`);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Group Members</Text>
      {loading ? (
        <Text style={{ color: '#666' }}>Loading...</Text>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={{ fontWeight: '700' }}>{item.name}</Text>
              <TouchableOpacity onPress={() => checkDistance(item)} style={styles.btn}>
                <Text style={{ color: '#fff' }}>Check</Text>
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#f8f9fa' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, alignItems: 'center', backgroundColor: '#fff', borderRadius: 10 },
  btn: { backgroundColor: '#ff4d4d', padding: 8, borderRadius: 6 },
});
