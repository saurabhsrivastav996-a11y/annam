import mongoose from 'mongoose';

const reelSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', default: null },
    title: { type: String, required: true },
    videoUrl: { type: String, required: true },
    thumbnailUrl: String,
    likes: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    isFlagged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Reel', reelSchema);
