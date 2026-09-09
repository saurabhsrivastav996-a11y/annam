import express from 'express';
import {
  stats,
  listUsers,
  setUserSuspended,
  setRestaurantApproval,
  listAllOrders,
  setReelFlag,
} from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/stats', stats);
router.get('/users', listUsers);
router.put('/users/:id/suspend', setUserSuspended);
router.put('/restaurants/:id/approve', setRestaurantApproval);
router.get('/orders', listAllOrders);
router.put('/reels/:id/flag', setReelFlag);

export default router;
