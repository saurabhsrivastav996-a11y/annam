import express from 'express';
import { body } from 'express-validator';
import {
  listRestaurants,
  getRestaurant,
  getMyRestaurant,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from '../controllers/restaurantController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/error.js';
import { uploadImage } from '../middleware/upload.js';

const router = express.Router();

router.get('/', listRestaurants);
router.get('/mine', requireAuth, requireRole('restaurant', 'admin'), getMyRestaurant);
router.get('/:id', getRestaurant);

router.post(
  '/',
  requireAuth,
  requireRole('restaurant', 'admin'),
  [
    body('name').trim().notEmpty().withMessage('Restaurant name is required'),
    body('address').trim().notEmpty().withMessage('Address is required'),
  ],
  validate,
  createRestaurant
);

router.put('/:id', requireAuth, requireRole('restaurant', 'admin'), updateRestaurant);
router.delete('/:id', requireAuth, requireRole('restaurant', 'admin'), deleteRestaurant);

router.post(
  '/:id/menu',
  requireAuth,
  requireRole('restaurant', 'admin'),
  uploadImage.single('image'),
  [
    body('name').trim().notEmpty().withMessage('Item name is required'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  ],
  validate,
  addMenuItem
);

router.put(
  '/:id/menu/:itemId',
  requireAuth,
  requireRole('restaurant', 'admin'),
  uploadImage.single('image'),
  updateMenuItem
);

router.delete('/:id/menu/:itemId', requireAuth, requireRole('restaurant', 'admin'), deleteMenuItem);

export default router;
