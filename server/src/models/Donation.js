import mongoose from 'mongoose';

export const DONATION_STATUSES = ['Posted', 'Accepted', 'Collected', 'Completed', 'Expired'];

const donationSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    description: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    units: { type: String, default: 'meals' },
    foodType: { type: String, enum: ['veg', 'non-veg', 'mixed'], default: 'veg' },
    pickupAddress: String,
    pickupBefore: Date,
    pickupLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [78.4867, 17.3850] },
    },
    status: { type: String, enum: DONATION_STATUSES, default: 'Posted', index: true },
    volunteerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    postedAt: { type: Date, default: Date.now },
    acceptedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

donationSchema.index({ pickupLocation: '2dsphere' });

export default mongoose.model('Donation', donationSchema);
