import express from 'express';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { register, login, me } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import { ROLES } from '../models/User.js';
import { isTest } from '../config/env.js';

const router = express.Router();

// Brute-force guard on credential endpoints (OWASP A07). 20/min still makes
// password guessing hopeless while leaving room to switch between demo accounts.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a minute.' },
  skip: () => isTest,
});

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().normalizeEmail().withMessage('A valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(ROLES).withMessage('Invalid role'),
  ],
  validate,
  register
);

router.post(
  '/login',
  authLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  login
);

router.get('/me', requireAuth, me);

export default router;
