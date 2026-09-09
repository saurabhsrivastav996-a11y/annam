import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['customer', 'restaurant', 'delivery', 'volunteer', 'admin'];

const addressSchema = new mongoose.Schema(
  { street: String, city: String, state: String, zip: String },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'customer', index: true },
    phone: String,
    address: addressSchema,
    // Delivery partners: online/offline toggle and last known position
    isAvailable: { type: Boolean, default: false },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [77.5946, 12.9716] }, // [lng, lat]
    },
    // Volunteer impact stats
    stats: {
      donationsCollected: { type: Number, default: 0 },
      mealsServed: { type: Number, default: 0 },
    },
    // Opt-out switch honoured by every email notification.
    notifications: {
      email: { type: Boolean, default: true },
    },
    isSuspended: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.index({ location: '2dsphere' });

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    phone: this.phone,
    address: this.address,
    isAvailable: this.isAvailable,
    notifications: this.notifications,
    stats: this.stats,
    isSuspended: this.isSuspended,
  };
};

export default mongoose.model('User', userSchema);
