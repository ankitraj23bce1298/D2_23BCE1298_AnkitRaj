// src/services/geofenceService.js
const API_BASE =
  process.env.API_BASE_URL ||
  'http://172.16.45.163:3000'; // ← change to your backend URL if needed

export async function fetchGeofences() {
  const res = await fetch(`${API_BASE}/api/geofences`);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Failed to fetch geofences: ${res.status} ${txt}`);
  }
  return res.json(); // [{ id, name, path:[{lat,lng}...], active }]
}
