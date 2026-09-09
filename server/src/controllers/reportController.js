import Report, { REPORT_TARGETS } from '../models/Report.js';
import Reel from '../models/Reel.js';
import Order from '../models/Order.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { pageSize } from '../utils/paginate.js';

/** Confirms the thing being reported actually exists. */
async function targetExists(targetType, targetId) {
  if (targetType === 'reel') return Reel.exists({ _id: targetId });
  // A review lives on the order that left it.
  return Order.exists({ _id: targetId, rating: { $ne: null } });
}

/** Anyone signed in can report a reel or a review. */
export const createReport = asyncHandler(async (req, res) => {
  const { targetType, targetId, reason, note } = req.body;

  if (!REPORT_TARGETS.includes(targetType)) throw new ApiError(400, 'Unknown report target');
  if (!(await targetExists(targetType, targetId))) throw new ApiError(404, 'That content no longer exists');

  try {
    const report = await Report.create({
      reporterId: req.user._id,
      targetType,
      targetId,
      reason,
      note,
    });
    return res.status(201).json({ id: report._id, status: report.status });
  } catch (err) {
    // Duplicate key: this person already reported this item. Say thank you
    // rather than an error — re-reporting is not a mistake worth surfacing.
    if (err.code === 11000) return res.status(200).json({ status: 'already-reported' });
    throw err;
  }
});

/**
 * The moderation queue: one row per reported item, not per report, with the
 * number of separate people who complained — that count is what an admin
 * actually triages on.
 */
export const listReports = asyncHandler(async (req, res) => {
  const status = req.query.status || 'open';
  const size = pageSize(req.query.limit, 25);

  const groups = await Report.aggregate([
    { $match: status === 'all' ? {} : { status } },
    {
      $group: {
        _id: { targetType: '$targetType', targetId: '$targetId' },
        reports: { $sum: 1 },
        reasons: { $addToSet: '$reason' },
        notes: { $push: '$note' },
        latest: { $max: '$createdAt' },
        anyId: { $first: '$_id' },
      },
    },
    { $sort: { reports: -1, latest: -1 } },
    { $limit: size },
  ]);

  // Attach what was actually reported, so the admin can judge it in place.
  const items = await Promise.all(
    groups.map(async (g) => {
      const { targetType, targetId } = g._id;
      const content =
        targetType === 'reel'
          ? await Reel.findById(targetId).populate('restaurantId', 'name').lean()
          : await Order.findById(targetId).select('review rating restaurantId reviewHidden').populate('restaurantId', 'name').lean();

      return {
        targetType,
        targetId,
        reportCount: g.reports,
        reasons: g.reasons,
        notes: g.notes.filter(Boolean),
        latest: g.latest,
        reportId: g.anyId,
        content: content || null,
        hidden: targetType === 'reel' ? Boolean(content?.isFlagged) : Boolean(content?.reviewHidden),
      };
    })
  );

  res.json({ items, hasMore: groups.length === size, nextCursor: null });
});

/**
 * Resolves every open report on one item.
 * `action: 'hide'` takes the content down; `'dismiss'` leaves it up. Either
 * way the queue is cleared, so the same item does not resurface tomorrow.
 */
export const resolveReports = asyncHandler(async (req, res) => {
  const { targetType, targetId, action, resolution } = req.body;

  if (!REPORT_TARGETS.includes(targetType)) throw new ApiError(400, 'Unknown report target');
  if (!['hide', 'dismiss', 'restore'].includes(action)) {
    throw new ApiError(400, 'Action must be hide, restore or dismiss');
  }

  const hidden = action === 'hide';

  if (targetType === 'reel') {
    const reel = await Reel.findByIdAndUpdate(targetId, { isFlagged: hidden }, { new: true });
    if (!reel) throw new ApiError(404, 'Reel not found');
  } else {
    const order = await Order.findByIdAndUpdate(targetId, { reviewHidden: hidden }, { new: true });
    if (!order) throw new ApiError(404, 'Review not found');
  }

  const { modifiedCount } = await Report.updateMany(
    { targetType, targetId, status: 'open' },
    {
      status: action === 'dismiss' ? 'dismissed' : 'actioned',
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      resolution: resolution ? String(resolution).slice(0, 300) : undefined,
    }
  );

  res.json({ targetType, targetId, hidden, reportsResolved: modifiedCount });
});

/** Counts for the admin dashboard badge. */
export const reportSummary = asyncHandler(async (req, res) => {
  const [open, actioned, dismissed] = await Promise.all([
    Report.countDocuments({ status: 'open' }),
    Report.countDocuments({ status: 'actioned' }),
    Report.countDocuments({ status: 'dismissed' }),
  ]);
  res.json({ open, actioned, dismissed });
});
