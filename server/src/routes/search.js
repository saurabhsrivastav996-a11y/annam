import express from 'express';
import rateLimit from 'express-rate-limit';
import { query } from 'express-validator';
import { naturalSearch, claudeEnabled } from '../services/nlSearch.js';
import { validate } from '../middleware/error.js';
import { asyncHandler } from '../utils/ApiError.js';
import { isTest } from '../config/env.js';

const router = express.Router();

// Parsing can cost a model call, so cap it per IP.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many searches. Try again in a minute.' },
  skip: () => isTest,
});

/** Tells the client whether to advertise natural-language search. */
router.get('/config', (req, res) => {
  res.json({
    naturalLanguage: claudeEnabled,
    hint: claudeEnabled
      ? 'Ask for what you feel like — "something spicy under ₹300"'
      : 'Search dishes by name, price or diet — "veg under 300"',
  });
});

router.get(
  '/',
  searchLimiter,
  [query('q').trim().isLength({ min: 2 }).withMessage('Type at least two characters')],
  validate,
  asyncHandler(async (req, res) => {
    const { filters, parsedBy, dishes } = await naturalSearch(req.query.q, { limit: 30 });
    res.json({ query: req.query.q, filters, parsedBy, count: dishes.length, dishes });
  })
);

export default router;
