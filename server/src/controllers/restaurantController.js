import mongoose from 'mongoose';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import Reel from '../models/Reel.js';
import Order from '../models/Order.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { uploadMedia } from '../config/cloudinary.js';
import { parseStreamUrl, isPlayableStreamUrl } from '../utils/streamUrl.js';
import { roadDistanceKm, travelMinutes, pointToCoord, PREP_MINUTES } from '../utils/geo.js';
import { pageSize, cursorFilter, pageResult } from '../utils/paginate.js';

/** How the client should play this kitchen's stream, if it has a usable one. */
function resolveStream(restaurant) {
  if (!restaurant.isTransparentKitchen) return null;
  return parseStreamUrl(restaurant.kitchenStreamUrl);
}

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
  // Without the customer's position we cannot honestly quote a distance, so
  // the plain listing simply omits it rather than inventing one.
  if (!lat || !lng) {
    const restaurants = await Restaurant.find(filter).limit(Number(limit)).lean();
    return res.json(restaurants);
  }

  // $geoNear both sorts by proximity and hands back the real distance, so the
  // list is not re-measured per card afterwards. It must lead the pipeline.
  const near = { lat: Number(lat), lng: Number(lng) };
  const restaurants = await Restaurant.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [near.lng, near.lat] },
        distanceField: 'straightLineMetres',
        maxDistance: Number(radius),
        spherical: true,
        query: filter,
      },
    },
    { $limit: Number(limit) },
  ]);

  res.json(restaurants.map((r) => withDistance(r, near)));
});

/** Attaches an estimated road distance and delivery time from `from`. */
function withDistance(restaurant, from) {
  const to = pointToCoord(restaurant.location);
  const distanceKm = roadDistanceKm(from, to);
  const travel = travelMinutes(distanceKm);

  return {
    ...restaurant,
    distanceKm,
    // A fresh order still has to be cooked, so quote the full wait.
    etaMinutes: travel === null ? null : travel + PREP_MINUTES.Placed,
  };
}

export const getRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id).lean();
  if (!restaurant) throw new ApiError(404, 'Restaurant not found');

  const { lat, lng } = req.query;
  const near = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;

  const [menu, reels] = await Promise.all([
    FoodItem.find({ restaurantId: restaurant._id }).lean(),
    Reel.find({ restaurantId: restaurant._id, isFlagged: false }).sort({ createdAt: -1 }).lean(),
  ]);

  const base = near ? withDistance(restaurant, near) : restaurant;
  res.json({ ...base, menu, reels, kitchenStream: resolveStream(restaurant) });
});

export const getMyRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ ownerUserId: req.user._id }).lean();
  if (!restaurant) return res.json(null);
  const menu = await FoodItem.find({ restaurantId: restaurant._id }).lean();
  res.json({ ...restaurant, menu, kitchenStream: resolveStream(restaurant) });
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

  // Reject a stream link we could never play, rather than storing a dead URL.
  if (updates.kitchenStreamUrl !== undefined && !isPlayableStreamUrl(updates.kitchenStreamUrl)) {
    throw new ApiError(400, 'Paste a YouTube video/live link, or a direct .mp4/.m3u8 URL');
  }
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

// ---- Reviews ----

/** Public initial-only name, so a review does not publish a full identity. */
function displayName(name) {
  const parts = String(name || 'Guest').trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * Ratings left on delivered orders for this restaurant, newest first, plus the
 * star breakdown so the page can show the distribution rather than one average.
 */
export const listReviews = asyncHandler(async (req, res) => {
  const restaurantId = req.params.id;
  const size = pageSize(req.query.limit);

  const exists = await Restaurant.exists({ _id: restaurantId });
  if (!exists) throw new ApiError(404, 'Restaurant not found');

  const [orders, breakdown] = await Promise.all([
    Order.find({
      restaurantId,
      rating: { $exists: true, $ne: null },
      ...cursorFilter(req.query.cursor),
    })
      .select('rating review createdAt customerId items')
      .populate('customerId', 'name')
      .sort({ _id: -1 })
      .limit(size + 1)
      .lean(),
    Order.aggregate([
      { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId), rating: { $ne: null } } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  breakdown.forEach(({ _id, count }) => {
    if (counts[_id] !== undefined) counts[_id] = count;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const average = total
    ? Number((Object.entries(counts).reduce((sum, [star, n]) => sum + star * n, 0) / total).toFixed(2))
    : 0;

  const page = pageResult(
    orders.map((o) => ({
      id: o._id,
      rating: o.rating,
      review: o.review || '',
      author: displayName(o.customerId?.name),
      // What they actually ate gives the rating context.
      dishes: (o.items || []).map((i) => i.name).filter(Boolean).slice(0, 3),
      createdAt: o.createdAt,
      _id: o._id,
    })),
    size
  );

  res.json({ average, total, counts, reviews: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore });
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
