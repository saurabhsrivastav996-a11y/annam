import express from 'express';
import rateLimit from 'express-rate-limit';
import { query } from 'express-validator';
import { geocode, reverseGeocode } from '../services/geocode.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import { asyncHandler } from '../utils/ApiError.js';
import { isTest } from '../config/env.js';

const router = express.Router();

// Nominatim is a donated service. Signed-in users only, and capped per IP, so
// this endpoint cannot be turned into a free bulk-geocoding proxy.
const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many address lookups. Try again in a minute.' },
  skip: () => isTest,
});

router.use(requireAuth, geocodeLimiter);

/** Address -> coordinates. 404 when the address cannot be placed. */
router.get(
  '/',
  [query('q').trim().isLength({ min: 3 }).withMessage('Enter at least 3 characters')],
  validate,
  asyncHandler(async (req, res) => {
    const result = await geocode(req.query.q);
    if (!result) return res.status(404).json({ error: 'We could not find that address' });
    res.json(result);
  })
);

/** Coordinates -> address, for "use my current location". */
router.get(
  '/reverse',
  [query('lat').isFloat({ min: -90, max: 90 }), query('lng').isFloat({ min: -180, max: 180 })],
  validate,
  asyncHandler(async (req, res) => {
    const result = await reverseGeocode(req.query.lat, req.query.lng);
    if (!result) return res.status(404).json({ error: 'No address found at that point' });
    res.json(result);
  })
);

export default router;
