import express from 'express';
import { body } from 'express-validator';
import {
  listDonations,
  createDonation,
  acceptDonation,
  updateDonationStatus,
  cancelDonation,
  donationStats,
  recommendedDonations,
} from '../controllers/donationController.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';

const router = express.Router();

router.get('/stats', donationStats);
router.get('/', optionalAuth, listDonations);
router.get('/recommended', requireAuth, requireRole('volunteer', 'admin'), recommendedDonations);

router.post(
  '/',
  requireAuth,
  requireRole('restaurant', 'admin'),
  [
    body('description').trim().notEmpty().withMessage('Describe the surplus food'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  ],
  validate,
  createDonation
);

router.put('/:id/accept', requireAuth, requireRole('volunteer', 'admin'), acceptDonation);
router.put('/:id/status', requireAuth, requireRole('volunteer', 'admin'), updateDonationStatus);
router.delete('/:id', requireAuth, requireRole('restaurant', 'admin'), cancelDonation);

export default router;
