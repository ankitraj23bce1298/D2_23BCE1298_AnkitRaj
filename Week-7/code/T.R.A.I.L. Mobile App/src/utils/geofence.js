export function isInsideCircle(point, center, radiusMeters){
    const toRad = x => x * Math.PI / 180;
    const R = 6378137; // Earth radius in meters
    const dLat = toRad(center.lat - point.lat);
    const dLon = toRad(center.lon - point.lon);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(point.lat)) * Math.cos(toRad(center.lat)) * Math.sin(dLon/2)*Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c;
    return d <= radiusMeters;
    }