import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Restaurant from '../models/Restaurant.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

/**
 * What a kitchen sees about its own trade.
 *
 * Two decisions worth stating, because both are easy to get quietly wrong:
 *
 * Revenue is `subtotal`, never `total`. The ₹30 delivery fee is collected
 * from the customer but is not the restaurant's money, so counting it would
 * overstate every kitchen's earnings by ₹30 an order. The admin dashboard
 * does use `total`, and is right to — that view is platform turnover.
 *
 * Only delivered orders count as revenue. An order sitting in Preparing is
 * not income yet, and a cancelled one never will be.
 */

// Every seeded address is in Bengaluru, and "which hour is busy" is a question
// about the kitchen's own clock, not UTC.
const TIMEZONE = 'Asia/Kolkata';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

/** Clamps the window to something a chart can actually show. */
function windowDays(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.min(n, MAX_DAYS);
}

/** A YYYY-MM-DD key in the kitchen's timezone. */
function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Fills the days nobody ordered.
 *
 * Mongo only returns buckets that have rows, so a quiet Tuesday is simply
 * absent. Plotting that as-is draws a line straight from Monday to Wednesday
 * and hides the gap; a zero is the honest reading.
 */
function fillDays(rows, days) {
  const found = new Map(rows.map((r) => [r._id, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(new Date(Date.now() - i * 86400000));
    const hit = found.get(key);
    out.push({ date: key, revenue: hit?.revenue || 0, orders: hit?.orders || 0 });
  }
  return out;
}

export const myAnalytics = asyncHandler(async (req, res) => {
  const days = windowDays(req.query.days);

  // An admin can look at any kitchen; an owner only ever sees their own.
  let restaurant;
  if (req.user.role === 'admin' && req.query.restaurantId) {
    if (!mongoose.isValidObjectId(req.query.restaurantId)) {
      throw new ApiError(400, 'restaurantId must be a valid id');
    }
    restaurant = await Restaurant.findById(req.query.restaurantId).select('name rating ratingCount').lean();
  } else {
    restaurant = await Restaurant.findOne({ ownerUserId: req.user._id })
      .select('name rating ratingCount')
      .lean();
  }
  if (!restaurant) throw new ApiError(404, 'No restaurant profile to report on yet');

  const since = new Date(Date.now() - days * 86400000);
  const match = { restaurantId: restaurant._id, createdAt: { $gte: since } };
  const delivered = { ...match, status: 'Delivered' };

  const [totals, daily, dishes, statuses, hours, ratings] = await Promise.all([
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, '$subtotal', 0] } },
        },
      },
    ]),

    Order.aggregate([
      { $match: delivered },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIMEZONE } },
          revenue: { $sum: '$subtotal' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    Order.aggregate([
      { $match: delivered },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.name',
          qty: { $sum: '$items.qty' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
        },
      },
      { $sort: { qty: -1, revenue: -1 } },
      { $limit: 5 },
    ]),

    Order.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),

    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $hour: { date: '$createdAt', timezone: TIMEZONE } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    Order.aggregate([
      { $match: { ...match, rating: { $gte: 1 } } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);

  const t = totals[0] || { orders: 0, delivered: 0, cancelled: 0, revenue: 0 };

  // Averaged over delivered orders only, to match how revenue is counted.
  const averageOrder = t.delivered ? Math.round(t.revenue / t.delivered) : 0;
  // Of everything placed in the window, not of everything ever placed.
  const cancellationRate = t.orders ? Number(((t.cancelled / t.orders) * 100).toFixed(1)) : 0;

  const ratingCounts = Object.fromEntries(ratings.map((r) => [r._id, r.count]));
  const ratedTotal = ratings.reduce((sum, r) => sum + r.count, 0);
  const ratedSum = ratings.reduce((sum, r) => sum + r._id * r.count, 0);

  res.json({
    restaurant: { _id: restaurant._id, name: restaurant.name },
    days,
    since,
    totals: {
      orders: t.orders,
      delivered: t.delivered,
      cancelled: t.cancelled,
      revenue: t.revenue,
      averageOrder,
      cancellationRate,
    },
    daily: fillDays(daily, days),
    topDishes: dishes.map((d) => ({ name: d._id, qty: d.qty, revenue: d.revenue })),
    ordersByStatus: Object.fromEntries(statuses.map((s) => [s._id, s.count])),
    // Every hour present, so the quiet ones are visible rather than missing.
    byHour: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: hours.find((h) => h._id === hour)?.orders || 0,
    })),
    ratings: {
      // The restaurant's lifetime average, which is what customers see.
      lifetime: restaurant.rating || 0,
      lifetimeCount: restaurant.ratingCount || 0,
      // In-window distribution, which is what tells an owner if things moved.
      inWindow: ratedTotal ? Number((ratedSum / ratedTotal).toFixed(2)) : 0,
      inWindowCount: ratedTotal,
      distribution: Object.fromEntries([5, 4, 3, 2, 1].map((n) => [n, ratingCounts[n] || 0])),
    },
  });
});
