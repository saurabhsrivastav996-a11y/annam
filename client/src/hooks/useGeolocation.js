import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'annam_position';

function readStored() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

/**
 * The viewer's coordinates, if they will share them.
 *
 * Distances are only shown when this returns a position — quoting "2.4 km"
 * from a guessed location would be worse than showing nothing. The last fix is
 * remembered so a repeat visit shows distances before the prompt resolves.
 */
export function useGeolocation({ ask = true } = {}) {
  const [position, setPosition] = useState(readStored);

  // Seeded rather than set from inside the effect, which would cause an extra
  // render pass before the browser prompt has even appeared.
  const [status, setStatus] = useState(() => {
    if (readStored()) return 'ready';
    if (!supported) return 'unsupported';
    return ask ? 'locating' : 'idle';
  });

  /** Fires the browser prompt. Does not touch state synchronously. */
  const locate = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lng: coords.longitude };
        setPosition(next);
        setStatus('ready');
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // A blocked storage API is not a reason to lose the position.
        }
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  /** Retry button: the user asked for this, so show the pending state. */
  const request = useCallback(() => {
    if (!supported) return setStatus('unsupported');
    setStatus('locating');
    locate();
  }, [locate]);

  useEffect(() => {
    if (!ask || position || !supported) return;
    locate();
  }, [ask, position, locate]);

  return { position, status, request };
}

/** "Nearby" within 50 m, "800 m" under a kilometre, "2.4 km" above. */
export function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return null;
  // Rounding to the nearest 50 m would render anything very close as "0 m".
  if (km < 0.05) return 'Nearby';
  if (km < 1) return `${Math.round((km * 1000) / 50) * 50} m`;
  return `${km.toFixed(1)} km`;
}

/** "25 min" up to an hour, "1 h 10 min" beyond it. */
export function formatDuration(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
