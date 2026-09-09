import mongoose from 'mongoose';

const foodSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: String,
    price: { type: Number, required: true, min: 0 },
    imageUrl: String,
    category: { type: String, enum: ['veg', 'non-veg'], default: 'veg', index: true },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('FoodItem', foodSchema);
