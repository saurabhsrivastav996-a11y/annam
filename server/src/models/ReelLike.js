import mongoose from 'mongoose';

/**
 * One row per person per reel.
 *
 * The count lives denormalised on the Reel for cheap reads; this collection is
 * what makes it honest. The unique compound index means a double-tap, a retry
 * or a scripted loop cannot inflate a restaurant's numbers.
 */
const reelLikeSchema = new mongoose.Schema(
  {
    reelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

reelLikeSchema.index({ reelId: 1, userId: 1 }, { unique: true });

export default mongoose.model('ReelLike', reelLikeSchema);
