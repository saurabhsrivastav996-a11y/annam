import mongoose from 'mongoose';

const restaurantSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: String,
    address: { type: String, required: true },
    cuisineType: { type: String, default: 'Indian', index: true },
    category: { type: String, enum: ['veg', 'non-veg', 'both'], default: 'both', index: true },
    imageUrl: String,
    phone: String,
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    isTransparentKitchen: { type: Boolean, default: false },
    kitchenStreamUrl: String,
    isApproved: { type: Boolean, default: true },
    isOpen: { type: Boolean, default: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [78.4867, 17.3850] },
    },
  },
  { timestamps: true }
);

restaurantSchema.index({ location: '2dsphere' });
restaurantSchema.index({ name: 'text', cuisineType: 'text', description: 'text' });

export default mongoose.model('Restaurant', restaurantSchema);
