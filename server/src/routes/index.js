import express from 'express';
import authRoutes from './auth.js';
import restaurantRoutes from './restaurants.js';
import orderRoutes from './orders.js';
import donationRoutes from './donations.js';
import reelRoutes from './reels.js';
import userRoutes from './users.js';
import adminRoutes from './admin.js';
import paymentRoutes from './payments.js';
import geocodeRoutes from './geocode.js';
import reportRoutes from './reports.js';

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'annam-api', time: new Date() }));

router.use('/auth', authRoutes);
router.use('/restaurants', restaurantRoutes);
router.use('/orders', orderRoutes);
router.use('/donations', donationRoutes);
router.use('/reels', reelRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);
router.use('/geocode', geocodeRoutes);
router.use('/reports', reportRoutes);

export default router;
