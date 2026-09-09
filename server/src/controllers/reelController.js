import Reel from '../models/Reel.js';
import ReelLike from '../models/ReelLike.js';
import Restaurant from '../models/Restaurant.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { uploadMedia } from '../config/cloudinary.js';
import { pageSize, cursorFilter, pageResult } from '../utils/paginate.js';

export const listReels = asyncHandler(async (req, res) => {
  const { restaurantId, limit, cursor } = req.query;
  const size = pageSize(limit);

  const filter = { isFlagged: false, ...cursorFilter(cursor) };
  if (restaurantId) filter.restaurantId = restaurantId;

  // One extra row tells us whether another page exists, without a count query.
  const rows = await Reel.find(filter)
    .populate('restaurantId', 'name imageUrl cuisineType rating isTransparentKitchen')
    .sort({ _id: -1 })
    .limit(size + 1)
    .lean();

  res.json(pageResult(rows, size));
});

export const createReel = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ ownerUserId: req.user._id });
  if (!restaurant) throw new ApiError(400, 'Create your restaurant profile first');

  let videoUrl = req.body.videoUrl;
  if (req.file) ({ url: videoUrl } = await uploadMedia(req.file, { folder: 'annam/reels', resourceType: 'video' }));
  if (!videoUrl) throw new ApiError(400, 'A video file or videoUrl is required');

  const reel = await Reel.create({
    restaurantId: restaurant._id,
    title: req.body.title,
    foodId: req.body.foodId || null,
    thumbnailUrl: req.body.thumbnailUrl,
    videoUrl,
  });

  res.status(201).json(reel);
});

/**
 * Toggles this user's like. Signed in, one per person — an open counter is
 * trivially inflated, which would make every reel's numbers meaningless.
 */
export const likeReel = asyncHandler(async (req, res) => {
  const reelId = req.params.id;
  if (!(await Reel.exists({ _id: reelId }))) throw new ApiError(404, 'Reel not found');

  const existing = await ReelLike.findOneAndDelete({ reelId, userId: req.user._id });

  if (existing) {
    const reel = await Reel.findByIdAndUpdate(reelId, { $inc: { likes: -1 } }, { new: true });
    return res.json({ likes: Math.max(0, reel.likes), liked: false });
  }

  try {
    await ReelLike.create({ reelId, userId: req.user._id });
  } catch (err) {
    // Duplicate key: two taps raced. The like already exists, so report success.
    if (err.code !== 11000) throw err;
    const reel = await Reel.findById(reelId);
    return res.json({ likes: reel.likes, liked: true });
  }

  const reel = await Reel.findByIdAndUpdate(reelId, { $inc: { likes: 1 } }, { new: true });
  res.json({ likes: reel.likes, liked: true });
});

/**
 * View count. Deliberately open, since a viewer need not have an account, but
 * rate-limited at the route so it cannot be spun up in a loop.
 */
export const viewReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
  if (!reel) throw new ApiError(404, 'Reel not found');
  res.json({ views: reel.views });
});

/** Which of these reels the signed-in user has already liked. */
export const myReelLikes = asyncHandler(async (req, res) => {
  const likes = await ReelLike.find({ userId: req.user._id }).select('reelId').lean();
  res.json(likes.map((l) => l.reelId));
});

export const deleteReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findById(req.params.id);
  if (!reel) throw new ApiError(404, 'Reel not found');

  const owns = await Restaurant.exists({ _id: reel.restaurantId, ownerUserId: req.user._id });
  if (!owns && req.user.role !== 'admin') throw new ApiError(403, 'Not your reel');

  await Promise.all([reel.deleteOne(), ReelLike.deleteMany({ reelId: reel._id })]);
  res.json({ message: 'Reel deleted' });
});
