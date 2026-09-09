import express from 'express';
import { body } from 'express-validator';
import {
  createOrder,
  getOrder,
  listMyOrders,
  updateOrderStatus,
  acceptDelivery,
  rateOrder,
  getPickupOtp,
  setAvailability,
} from '../controllers/orderController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import { ORDER_STATUSES } from '../models/Order.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', listMyOrders);
router.put('/availability', requireRole('delivery'), setAvailability);

router.post(
  '/',
  requireRole('customer', 'admin'),
  [
    body('restaurantId').isMongoId().withMessage('A valid restaurantId is required'),
    body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
    body('items.*.foodId').isMongoId(),
    body('items.*.qty').isInt({ min: 1 }),
    body('deliveryAddress').trim().notEmpty().withMessage('Delivery address is required'),
  ],
  validate,
  createOrder
);

router.get('/:id', getOrder);
router.get('/:id/otp', getPickupOtp);

router.put(
  '/:id/status',
  [body('status').isIn(ORDER_STATUSES).withMessage('Invalid status')],
  validate,
  updateOrderStatus
);

router.put('/:id/accept', requireRole('delivery'), acceptDelivery);

router.post(
  '/:id/rate',
  requireRole('customer'),
  [body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5')],
  validate,
  rateOrder
);

export default router;
