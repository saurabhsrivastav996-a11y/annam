/**
 * Strips keys starting with "$" or containing "." from request payloads, so a
 * body like {"email": {"$ne": null}} cannot reach Mongo as an operator.
 *
 * `req.body` and `req.params` are plain objects and are cleaned in place.
 * `req.query` is a getter in Express 5 — deleting keys from what it returns
 * does not stick — so it is replaced with a cleaned copy instead. That was
 * verified against Express 5: in-place deletion silently left "$ne" present.
 */

const isUnsafeKey = (key) => key.startsWith('$') || key.includes('.');

/** Cleans a plain object or array in place. */
function scrubInPlace(value) {
  // The raw webhook body is a Buffer; walking its byte indices is pointless
  // and would corrupt the bytes the signature is computed over.
  if (Buffer.isBuffer(value)) return;

  if (Array.isArray(value)) {
    value.forEach(scrubInPlace);
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (isUnsafeKey(key)) delete value[key];
      else scrubInPlace(value[key]);
    }
  }
}

/** Returns a cleaned copy, for values that cannot be mutated in place. */
function scrubCopy(value) {
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(scrubCopy);

  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (!isUnsafeKey(key)) out[key] = scrubCopy(inner);
    }
    return out;
  }
  return value;
}

export function mongoSanitize(req, res, next) {
  scrubInPlace(req.body);
  scrubInPlace(req.params);

  const cleanQuery = scrubCopy(req.query);
  Object.defineProperty(req, 'query', {
    value: cleanQuery,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  next();
}
