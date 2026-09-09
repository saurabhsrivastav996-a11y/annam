import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import Order from '../models/Order.js';
import Donation from '../models/Donation.js';
import Reel from '../models/Reel.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

export const stats = asyncHandler(async (req, res) => {
  const [users, restaurants, orders, donations, reels, revenueAgg, byRole, byStatus] = await Promise.all([
    User.countDocuments(),
    Restaurant.countDocuments(),
    Order.countDocuments(),
    Donation.countDocuments(),
    Reel.countDocuments(),
    Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  res.json({
    users,
    restaurants,
    orders,
    donations,
    reels,
    revenue: revenueAgg[0]?.total || 0,
    usersByRole: Object.fromEntries(byRole.map((r) => [r._id, r.count])),
    ordersByStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
  });
});

export const listUsers = asyncHandler(async (req, res) => {
  const { role, search } = req.query;
  const filter = {};
  if (role && role !== 'all') filter.role = role;
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json(users.map((u) => ({ ...u.toPublic(), createdAt: u.createdAt })));
});

export const setUserSuspended = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === 'admin') throw new ApiError(403, 'Admin accounts cannot be suspended');

  user.isSuspended = Boolean(req.body.isSuspended);
  await user.save();
  res.json(user.toPublic());
});

export const setRestaurantApproval = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { isApproved: Boolean(req.body.isApproved) },
    { new: true }
  );
  if (!restaurant) throw new ApiError(404, 'Restaurant not found');
  res.json(restaurant);
});

export const listAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .populate('restaurantId', 'name')
    .populate('customerId', 'name email')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(orders);
});

export const setReelFlag = asyncHandler(async (req, res) => {
  const reel = await Reel.findByIdAndUpdate(
    req.params.id,
    { isFlagged: Boolean(req.body.isFlagged) },
    { new: true }
  );
  if (!reel) throw new ApiError(404, 'Reel not found');
  res.json(reel);
});
