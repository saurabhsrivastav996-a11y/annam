/**
 * Distance and delivery-time estimates.
 *
 * There is no routing service behind this. Adding one would mean a paid API
 * key and a network round trip per card in the list, so distances are computed
 * from coordinates and corrected with a winding factor. That is an estimate,
 * and the UI labels it as one — it is close enough to choose a restaurant by,
 * and it costs nothing and works offline.
 */

const EARTH_RADIUS_KM = 6371;

/** Streets are not straight; city road distance runs ~30% over the crow-flies line. */
export const ROAD_WINDING_FACTOR = 1.3;

/** A two-wheeler averaging its way through city traffic, not open-road speed. */
export const AVG_SPEED_KMH = 18;

/** Kitchen time still to come, by where the order has got to. */
export const PREP_MINUTES = {
  Placed: 18,
  Accepted: 15,
  Preparing: 10,
  Ready: 2,
  OutForDelivery: 0,
  Delivered: 0,
  Cancelled: 0,
};

const toRad = (deg) => (deg * Math.PI) / 180;

const isCoord = (p) =>
  p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) &&
  Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/** Great-circle distance in km, or null if either point is unusable. */
export function haversineKm(from, to) {
  if (!isCoord(from) || !isCoord(to)) return null;

  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Straight-line distance nudged towards what the road actually costs. */
export function roadDistanceKm(from, to) {
  const straight = haversineKm(from, to);
  if (straight === null) return null;
  return Number((straight * ROAD_WINDING_FACTOR).toFixed(2));
}

/** Travel minutes for a road distance, rounded up — never promise zero. */
export function travelMinutes(roadKm) {
  if (roadKm === null || !Number.isFinite(roadKm)) return null;
  return Math.max(1, Math.ceil((roadKm / AVG_SPEED_KMH) * 60));
}

/**
 * Minutes until the food arrives: what the kitchen still owes, plus the ride.
 * Pass the courier's live position once they are moving and the estimate
 * follows them instead of the restaurant.
 */
export function etaMinutes({ from, to, status = 'Placed' }) {
  const roadKm = roadDistanceKm(from, to);
  const travel = travelMinutes(roadKm);
  if (travel === null) return null;

  return travel + (PREP_MINUTES[status] ?? 0);
}

/** GeoJSON [lng, lat] -> { lat, lng }. Returns null for anything malformed. */
export function pointToCoord(point) {
  const [lng, lat] = point?.coordinates || [];
  return isCoord({ lat, lng }) ? { lat, lng } : null;
}

/** "Nearby" within 50 m, "800 m" under a kilometre, "2.4 km" above. */
export function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return null;
  // Rounding to the nearest 50 m would render anything very close as "0 m".
  if (km < 0.05) return 'Nearby';
  if (km < 1) return `${Math.round((km * 1000) / 50) * 50} m`;
  return `${km.toFixed(1)} km`;
}
