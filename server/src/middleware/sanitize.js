/**
 * Strips keys starting with "$" or containing "." from request payloads.
 * Blocks NoSQL operator injection such as {"email": {"$ne": null}} without
 * reassigning req.query, which Express 5 exposes as a getter.
 */
function scrub(value) {
  if (Array.isArray(value)) {
    value.forEach(scrub);
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key];
      } else {
        scrub(value[key]);
      }
    }
  }
}

export function mongoSanitize(req, res, next) {
  scrub(req.body);
  scrub(req.params);
  scrub(req.query);
  next();
}
