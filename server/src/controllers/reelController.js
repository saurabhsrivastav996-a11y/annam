import Reel from '../models/Reel.js';
import Restaurant from '../models/Restaurant.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { uploadMedia } from '../config/cloudinary.js';

export const listReels = asyncHandler(async (req, res) => {
  const { restaurantId, limit = 20 } = req.query;
  const filter = { isFlagged: false };
  if (restaurantId) filter.restaurantId = restaurantId;

  const reels = await Reel.find(filter)
    .populate('restaurantId', 'name imageUrl cuisineType rating isTransparentKitchen')
    .sort({ createdAt: -1 })
    .limit(Number(limit));

  res.json(reels);
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

export const likeReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } }, { new: true });
  if (!reel) throw new ApiError(404, 'Reel not found');
  res.json({ likes: reel.likes });
});

export const viewReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
  if (!reel) throw new ApiError(404, 'Reel not found');
  res.json({ views: reel.views });
});

export const deleteReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findById(req.params.id);
  if (!reel) throw new ApiError(404, 'Reel not found');

  const owns = await Restaurant.exists({ _id: reel.restaurantId, ownerUserId: req.user._id });
  if (!owns && req.user.role !== 'admin') throw new ApiError(403, 'Not your reel');

  await reel.deleteOne();
  res.json({ message: 'Reel deleted' });
});
