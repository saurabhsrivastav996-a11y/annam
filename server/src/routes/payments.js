import express from 'express';
import { body } from 'express-validator';
import {
  getConfig,
  createCheckout,
  verifyCheckout,
  abandonCheckout,
  webhook,
} from '../controllers/paymentController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';

const router = express.Router();

router.get('/config', getConfig);

// Razorpay calls this server-to-server; it authenticates with a signature over
// the raw body rather than a JWT, so no requireAuth here.
router.post('/webhook', webhook);

router.post(
  '/checkout',
  requireAuth,
  requireRole('customer', 'admin'),
  [
    body('restaurantId').isMongoId().withMessage('A valid restaurantId is required'),
    body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
    body('items.*.foodId').isMongoId(),
    body('items.*.qty').isInt({ min: 1 }),
    body('deliveryAddress').trim().notEmpty().withMessage('Delivery address is required'),
  ],
  validate,
  createCheckout
);

router.post(
  '/verify',
  requireAuth,
  [
    body('razorpay_order_id').trim().notEmpty(),
    body('razorpay_payment_id').trim().notEmpty(),
    body('razorpay_signature').trim().notEmpty(),
  ],
  validate,
  verifyCheckout
);

router.post(
  '/abandon',
  requireAuth,
  [body('razorpay_order_id').trim().notEmpty()],
  validate,
  abandonCheckout
);

export default router;
