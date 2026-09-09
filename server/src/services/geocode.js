/**
 * Address <-> coordinates, via Nominatim (OpenStreetMap).
 *
 * Chosen to match the map: no API key, no billing account. The trade is
 * Nominatim's usage policy, which this module is built around — at most one
 * request a second, an identifying User-Agent, and caching so the same address
 * is never looked up twice.
 *
 * Every function resolves to null rather than throwing. A geocoder that is
 * down, slow or rate-limited must not stop someone ordering dinner; the caller
 * stores no coordinates and distance simply reads as unknown.
 */

const BASE = 'https://nominatim.openstreetmap.org';
const MIN_GAP_MS = 1100; // Nominatim allows 1 req/sec; leave headroom
const TIMEOUT_MS = 6000;
const CACHE_MAX = 500;

// Nominatim asks that applications identify themselves.
const USER_AGENT = 'Annam/1.0 (food delivery demo; +https://github.com/annam)';

const cache = new Map();
let lastRequestAt = 0;
let queue = Promise.resolve();

/** Same address typed with different spacing or case is the same lookup. */
const cacheKey = (value) => String(value).trim().toLowerCase().replace(/\s+/g, ' ');

function remember(key, value) {
  // Cheap LRU: oldest insertion drops out once the cap is hit.
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

/** Serialises calls and keeps them at least MIN_GAP_MS apart. */
function schedule(work) {
  const run = queue.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return work();
  });

  // Keep the chain alive even when one call fails.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function request(path, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await doFetch(`${BASE}${path}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // timeout, offline, blocked — all mean "unknown"
  } finally {
    clearTimeout(timer);
  }
}

/** Shapes one Nominatim hit into what the rest of the app expects. */
function toResult(hit) {
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, displayName: hit.display_name || '' };
}

/**
 * Address -> { lat, lng, displayName }, or null if it cannot be placed.
 * `countryCodes` biases results; the demo data is Indian.
 */
export async function geocode(address, { fetchImpl, countryCodes = 'in' } = {}) {
  const query = String(address || '').trim();
  if (query.length < 3) return null;

  const key = `f:${countryCodes}:${cacheKey(query)}`;
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '0',
  });
  if (countryCodes) params.set('countrycodes', countryCodes);

  const body = await schedule(() => request(`/search?${params}`, fetchImpl));
  const result = Array.isArray(body) && body.length ? toResult(body[0]) : null;

  remember(key, result);
  return result;
}

/** Coordinates -> a human address, for "use my current location". */
export async function reverseGeocode(lat, lng, { fetchImpl } = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;

  const key = `r:${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    zoom: '18',
  });

  const body = await schedule(() => request(`/reverse?${params}`, fetchImpl));
  const result = body?.display_name
    ? { lat: Number(lat), lng: Number(lng), displayName: body.display_name }
    : null;

  remember(key, result);
  return result;
}

/** Test seam. */
export function _resetCache() {
  cache.clear();
  lastRequestAt = 0;
}
