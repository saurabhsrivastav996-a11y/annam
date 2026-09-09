import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import Reel from '../models/Reel.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { uploadMedia } from '../config/cloudinary.js';

/** Throws unless the caller owns this restaurant (admins bypass). */
async function assertOwner(restaurantId, user) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new ApiError(404, 'Restaurant not found');
  if (user.role !== 'admin' && restaurant.ownerUserId.toString() !== user._id.toString()) {
    throw new ApiError(403, 'You do not own this restaurant');
  }
  return restaurant;
}

export const listRestaurants = asyncHandler(async (req, res) => {
  const { search, cuisine, category, lat, lng, radius = 10000, limit = 50 } = req.query;

  const filter = { isApproved: true };
  if (cuisine) filter.cuisineType = cuisine;
  if (category && category !== 'all') filter.category = { $in: [category, 'both'] };
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { cuisineType: rx }, { description: rx }];
  }
  if (lat && lng) {
    filter.location = {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: Number(radius),
      },
    };
  }

  const restaurants = await Restaurant.find(filter).limit(Number(limit)).lean();
  res.json(restaurants);
});

export const getRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id).lean();
  if (!restaurant) throw new ApiError(404, 'Restaurant not found');

  const [menu, reels] = await Promise.all([
    FoodItem.find({ restaurantId: restaurant._id }).lean(),
    Reel.find({ restaurantId: restaurant._id, isFlagged: false }).sort({ createdAt: -1 }).lean(),
  ]);

  res.json({ ...restaurant, menu, reels });
});

export const getMyRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ ownerUserId: req.user._id }).lean();
  if (!restaurant) return res.json(null);
  const menu = await FoodItem.find({ restaurantId: restaurant._id }).lean();
  res.json({ ...restaurant, menu });
});

export const createRestaurant = asyncHandler(async (req, res) => {
  const existing = await Restaurant.findOne({ ownerUserId: req.user._id });
  if (existing) throw new ApiError(409, 'You already have a restaurant profile');

  const { lng, lat, ...rest } = req.body;
  const restaurant = await Restaurant.create({
    ...rest,
    ownerUserId: req.user._id,
    ...(lng && lat ? { location: { type: 'Point', coordinates: [Number(lng), Number(lat)] } } : {}),
  });

  res.status(201).json(restaurant);
});

export const updateRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await assertOwner(req.params.id, req.user);

  // Ownership, ratings and approval are not client-editable, so drop them here.
  const { lng, lat, ownerUserId: _o, rating: _r, ratingCount: _rc, isApproved: _a, ...updates } = req.body;
  Object.assign(restaurant, updates);
  if (lng && lat) restaurant.location = { type: 'Point', coordinates: [Number(lng), Number(lat)] };

  await restaurant.save();
  res.json(restaurant);
});

export const deleteRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await assertOwner(req.params.id, req.user);
  await Promise.all([
    FoodItem.deleteMany({ restaurantId: restaurant._id }),
    Reel.deleteMany({ restaurantId: restaurant._id }),
    restaurant.deleteOne(),
  ]);
  res.json({ message: 'Restaurant and its menu deleted' });
});

// ---- Menu ----

export const addMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await assertOwner(req.params.id, req.user);

  let imageUrl = req.body.imageUrl;
  if (req.file) ({ url: imageUrl } = await uploadMedia(req.file, { folder: 'annam/food' }));

  const item = await FoodItem.create({ ...req.body, imageUrl, restaurantId: restaurant._id });
  res.status(201).json(item);
});

export const updateMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await assertOwner(req.params.id, req.user);

  const item = await FoodItem.findOne({ _id: req.params.itemId, restaurantId: restaurant._id });
  if (!item) throw new ApiError(404, 'Menu item not found');

  if (req.file) {
    const { url } = await uploadMedia(req.file, { folder: 'annam/food' });
    item.imageUrl = url;
  }
  const { restaurantId: _rid, ...updates } = req.body;
  Object.assign(item, updates);

  await item.save();
  res.json(item);
});

export const deleteMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await assertOwner(req.params.id, req.user);
  const item = await FoodItem.findOneAndDelete({ _id: req.params.itemId, restaurantId: restaurant._id });
  if (!item) throw new ApiError(404, 'Menu item not found');
  res.json({ message: 'Menu item deleted' });
});
