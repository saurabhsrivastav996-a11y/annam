import { useCallback, useEffect, useState } from 'react';
import api, { errMsg } from '../services/api.js';

/**
 * GET a path into { data, loading, error, reload }.
 *
 * The path is the cache key: change it and the hook refetches. Pass `skip` to
 * hold off entirely (e.g. while the id it depends on is still loading).
 */
export function useFetch(path, { skip = false, initial = null } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (skip || !path) return undefined;

    // Guards against a slow response for an old path overwriting a newer one.
    let cancelled = false;

    (async () => {
      try {
        const res = await api.get(path);
        if (cancelled) return;
        setData(res.data);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(errMsg(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, skip, nonce]);

  /** Refetches the current path on demand (after a mutation, say). */
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, setData, loading, error, reload };
}
