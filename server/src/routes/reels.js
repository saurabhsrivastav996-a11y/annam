import express from 'express';
import { body } from 'express-validator';
import { listReels, createReel, likeReel, viewReel, deleteReel } from '../controllers/reelController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import { uploadVideo } from '../middleware/upload.js';

const router = express.Router();

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

router.post('/:id/like', likeReel);
router.post('/:id/view', viewReel);
router.delete('/:id', requireAuth, requireRole('restaurant', 'admin'), deleteReel);

export default router;
