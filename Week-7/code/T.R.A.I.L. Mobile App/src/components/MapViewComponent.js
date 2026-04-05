// src/components/MapViewComponent.js
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
  Image,
} from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';

// 🔴 local geofences (lat/lng objects)
import GEOFENCES from '../assets/geofenced.json';

const DEFAULT_REGION = {
  latitude: 21.0,
  longitude: 78.0,
  latitudeDelta: 10.0,
  longitudeDelta: 10.0,
};

async function requestLocationPermissionAndroid() {
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'This app requires access to your location to center the map.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('Permission error', err);
    return false;
  }
}

// --- geo helpers ---
const toLatLng = (p) => ({ latitude: p.lat, longitude: p.lng });
const centroid = (pts) => {
  if (!pts?.length) return null;
  let x = 0, y = 0;
  pts.forEach(p => { x += p.lat; y += p.lng; });
  return { latitude: x / pts.length, longitude: y / pts.length };
};
const boundsFromPts = (pts) => {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  pts.forEach(p => {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  });
  return { minLat, maxLat, minLng, maxLng };
};
const kmDist = (a, b) => {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const s1 =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(s1));
};
// -------------------

const MapViewComponent = forwardRef(
  (
    {
      followUser = true,
      markers = [],
      style,
      showGeofences = false,
      centerTo,               // {latitude, longitude} to center to externally
      onZoneEvent,            // ({ type: 'enter'|'exit', zone }) => void
    },
    ref
  ) => {
    const mapRef = useRef(null);
    const watchIdRef = useRef(null);

    const [hasLocationPermission, setHasLocationPermission] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userLocation, setUserLocation] = useState(null);
    const [region, setRegion] = useState(DEFAULT_REGION);
    const [zoomLevel, setZoomLevel] = useState(15);

    // simple zone state to prevent spamming enter/exit
    const insideZonesRef = useRef(new Set());

    useImperativeHandle(ref, () => ({
      animateToRegion: (r, duration = 500) => {
        if (mapRef.current?.animateToRegion) mapRef.current.animateToRegion(r, duration);
      },
      fitToSuppliedMarkers: (ids = [], options = {}) => {
        if (mapRef.current?.fitToSuppliedMarkers) mapRef.current.fitToSuppliedMarkers(ids, options);
      },
      getNativeMap: () => mapRef.current,
    }));

    // center externally when centerTo changes
    useEffect(() => {
      if (centerTo?.latitude && centerTo?.longitude) {
        const r = {
          latitude: centerTo.latitude,
          longitude: centerTo.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        animateAndSetRegion(r);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [centerTo?.latitude, centerTo?.longitude]);

    useEffect(() => {
      (async () => {
        let granted = true;
        if (Platform.OS === 'android') {
          granted = await requestLocationPermissionAndroid();
        }
        setHasLocationPermission(granted);

        if (granted) {
          const pos = await getCurrentLocationSafe();
          if (pos) {
            setUserLocation(pos);
            // 👇 after we know user position, try to frame nearest polygon
            frameNearestPolygonOrUser(pos);
            startWatchingPosition();
          } else {
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      })();

      return () => stopWatchingPosition();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // keep following user if flag + we already know position
    useEffect(() => {
      if (followUser && userLocation) {
        const r = {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        animateAndSetRegion(r);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userLocation, followUser]);

    function animateAndSetRegion(r) {
      setRegion(r);
      if (mapRef.current?.animateToRegion) mapRef.current.animateToRegion(r, 500);
    }

    async function getCurrentLocationSafe() {
      setLoading(true);
      try {
        const pos = await new Promise((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              resolve({ latitude, longitude, timestamp: position.timestamp });
            },
            (error) => reject(error),
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 10000,
              forceRequestLocation: true,
              showLocationDialog: true,
            }
          );
        });
        setLoading(false);
        return pos;
      } catch (e) {
        console.warn('Could not get current location: ', e);
        setLoading(false);
        return null;
      }
    }

    function startWatchingPosition() {
      if (watchIdRef.current) return;
      try {
        watchIdRef.current = Geolocation.watchPosition(
          (position) => {
            if (!position?.coords) return;
            const { latitude, longitude } = position.coords;
            const loc = { latitude, longitude, timestamp: position.timestamp };
            setUserLocation(loc);
            // check zone enter/exit
            if (showGeofences) checkZones(loc);
          },
          (error) => console.warn('watchPosition error', error),
          {
            enableHighAccuracy: true,
            distanceFilter: 5,
            interval: 3000,
            fastestInterval: 2000,
          }
        );
      } catch (e) {
        console.warn('startWatchingPosition failed', e);
      }
    }

    function stopWatchingPosition() {
      try {
        if (watchIdRef.current != null) {
          Geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = null;
      } catch (e) {
        watchIdRef.current = null;
      }
    }

    function onPressCenter() {
      if (userLocation) {
        const r = {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        animateAndSetRegion(r);
      }
    }

    function onZoomIn() {
      const r = {
        ...region,
        latitudeDelta: Math.max(region.latitudeDelta / 2, 0.0005),
        longitudeDelta: Math.max(region.longitudeDelta / 2, 0.0005),
      };
      animateAndSetRegion(r);
      setZoomLevel((z) => Math.min(20, z + 1));
    }

    function onZoomOut() {
      const r = {
        ...region,
        latitudeDelta: Math.min(region.latitudeDelta * 2, 40),
        longitudeDelta: Math.min(region.longitudeDelta * 2, 40),
      };
      animateAndSetRegion(r);
      setZoomLevel((z) => Math.max(1, z - 1));
    }

    // --- Frame nearest polygon to user (if within ~100km), else keep user
    function frameNearestPolygonOrUser(pos) {
      if (!showGeofences || !Array.isArray(GEOFENCES) || !GEOFENCES.length) {
        const r = {
          latitude: pos.latitude,
          longitude: pos.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        return animateAndSetRegion(r);
      }

      let best = null;
      let bestDist = Infinity;
      GEOFENCES.forEach((z) => {
        if (!z?.active || !Array.isArray(z.path) || !z.path.length) return;
        const c = centroid(z.path);
        if (!c) return;
        const d = kmDist(pos, c);
        if (d < bestDist) {
          bestDist = d;
          best = z;
        }
      });

      if (best && bestDist < 100) {
        // Fit to polygon bounds
        const b = boundsFromPts(best.path);
        const coords = [
          { latitude: b.minLat, longitude: b.minLng },
          { latitude: b.minLat, longitude: b.maxLng },
          { latitude: b.maxLat, longitude: b.maxLng },
          { latitude: b.maxLat, longitude: b.minLng },
        ];
        if (mapRef.current?.fitToCoordinates) {
          mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 60, bottom: 60, left: 60, right: 60 },
            animated: true,
          });
        } else {
          const c = centroid(best.path);
          animateAndSetRegion({
            latitude: c.latitude,
            longitude: c.longitude,
            latitudeDelta: Math.max((b.maxLat - b.minLat) * 1.6, 0.01),
            longitudeDelta: Math.max((b.maxLng - b.minLng) * 1.6, 0.01),
          });
        }
      } else {
        // fallback: center on user
        animateAndSetRegion({
          latitude: pos.latitude,
          longitude: pos.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
    }

    // --- point-in-polygon (ray casting)
    function pointInPoly(point, poly) {
      const x = point.longitude;
      const y = point.latitude;
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].lng, yi = poly[i].lat;
        const xj = poly[j].lng, yj = poly[j].lat;
        const intersect =
          yi > y !== yj > y &&
          x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0000001) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }

    function checkZones(loc) {
      const nowInside = new Set();
      (GEOFENCES || []).forEach((z) => {
        if (!z?.active || !Array.isArray(z.path) || !z.path.length) return;
        const inside = pointInPoly(loc, z.path);
        if (inside) nowInside.add(z.name);
        const wasInside = insideZonesRef.current.has(z.name);
        if (inside && !wasInside) {
          insideZonesRef.current.add(z.name);
          onZoneEvent && onZoneEvent({ type: 'enter', zone: z });
        }
        if (!inside && wasInside) {
          insideZonesRef.current.delete(z.name);
          onZoneEvent && onZoneEvent({ type: 'exit', zone: z });
        }
      });
      // clean up any zones that no longer exist
      insideZonesRef.current.forEach((name) => {
        if (!nowInside.has(name)) insideZonesRef.current.delete(name);
      });
    }

    // If MapView isn't available show placeholder
    if (!MapView) {
      return (
        <View style={[styles.fallback, style]}>
          <Text style={styles.placeholderText}>Map package not available</Text>
          <Text style={styles.placeholderTextSmall}>Install react-native-maps to show interactive map.</Text>
        </View>
      );
    }

    return (
      <View style={[styles.container, style]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={region}
          region={region}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass
          rotateEnabled={false}
          toolbarEnabled={false}
        >
          {/* 🔴 Geofence polygons */}
          {showGeofences &&
            Array.isArray(GEOFENCES) &&
            GEOFENCES.filter(z => z?.active && Array.isArray(z.path) && z.path.length).map((z, idx) => {
              const coords = z.path.map(toLatLng);
              return (
                <Polygon
                  key={`zone_${idx}_${z.name}`}
                  coordinates={coords}
                  strokeColor="rgba(220, 38, 38, 0.9)"   // red-600
                  fillColor="rgba(239, 68, 68, 0.25)"       // red-500 @ 25%
                  strokeWidth={2}
                  zIndex={1000}
                />
              );
            })}

          {/* user marker */}
          {userLocation && (
            <Marker
              key="__user_marker"
              coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
              title="You are here"
              description="Current device location"
              zIndex={2000}
            >
              <View style={styles.userMarker}>
                <View style={styles.userMarkerCore} />
              </View>
            </Marker>
          )}

          {/* optional markers */}
          {markers.map((m) => (
            <Marker
              key={m.id ?? `${m.latitude}-${m.longitude}`}
              coordinate={{ latitude: m.latitude, longitude: m.longitude }}
              title={m.title}
              description={m.description}
            />
          ))}
        </MapView>

        {/* Controls: center + zoom */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity onPress={onPressCenter} style={styles.controlButton} accessibilityLabel="Center">
            <Image source={require('../assets/center.png')} style={styles.controlIcon} />
          </TouchableOpacity>

          <View style={styles.zoomContainer}>
            <TouchableOpacity onPress={onZoomIn} style={[styles.controlButton, styles.zoomBtn]}>
              <Text style={styles.zoomTxt}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onZoomOut} style={[styles.controlButton, styles.zoomBtn]}>
              <Text style={styles.zoomTxt}>−</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Loading indicator while initial location resolves */}
        {loading && (
          <View className="loadingOverlay" style={styles.loadingOverlay}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 8 }}>Getting location…</Text>
          </View>
        )}
      </View>
    );
  }
);

export default MapViewComponent;

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', height: '100%' },
  map: { flex: 1 },
  fallback: { flex: 1, backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center', padding: 14 },
  placeholderText: { fontSize: 16, color: '#333', marginBottom: 6 },
  placeholderTextSmall: { color: '#666', marginBottom: 10 },

  userMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,136,229,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(30,136,229,0.35)',
  },
  userMarkerCore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1E88E5',
    borderWidth: 2,
    borderColor: '#fff',
  },

  controlsContainer: { position: 'absolute', right: 12, top: 12, alignItems: 'center' },
  controlButton: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: '#fff', elevation: 4,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  controlIcon: { width: 20, height: 20, tintColor: '#333' },

  zoomContainer: { alignItems: 'center', justifyContent: 'center' },
  zoomBtn: { width: 44, height: 44, borderRadius: 10 },
  zoomTxt: { fontSize: 22, fontWeight: '700', color: '#333' },

  loadingOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '46%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
});
