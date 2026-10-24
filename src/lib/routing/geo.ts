export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Road distance approximation used ONLY to label estimates — never as a measured value. */
export function estimateRoadKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * 1.28 * 10) / 10;
}

/** Average urban speed assumption for estimates (km/h), documented in docs/ROUTING.md. */
export const ESTIMATE_SPEED_KMH = 46;

export function estimateDurationMin(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / ESTIMATE_SPEED_KMH) * 60));
}
