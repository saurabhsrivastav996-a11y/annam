import express from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { listReels, createReel, likeReel, viewReel, deleteReel, myReelLikes } from '../controllers/reelController.js';
import { isTest } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import { uploadVideo } from '../middleware/upload.js';

const router = express.Router();

// Views stay open to signed-out viewers, so cap them per IP rather than leave
// an unauthenticated counter anyone can spin in a loop.
const viewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});

router.get('/', listReels);

router.post(
  '/',
  requireAuth,
  requireRole('restaurant', 'admin'),
  uploadVideo.single('video'),
  [body('title').trim().notEmpty().withMessage('Give the reel a title')],
  validate,
  createReel
);

// Liking requires an account: one per person, and it toggles.
router.post('/:id/like', requireAuth, likeReel);
router.get('/likes/mine', requireAuth, myReelLikes);
router.post('/:id/view', viewLimiter, viewReel);
router.delete('/:id', requireAuth, requireRole('restaurant', 'admin'), deleteReel);

export default router;
