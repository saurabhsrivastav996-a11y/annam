import mongoose from 'mongoose';

export const ORDER_STATUSES = [
  'Placed', 'Accepted', 'Preparing', 'Ready', 'OutForDelivery', 'Delivered', 'Cancelled',
];

// Who may move an order into a given status.
export const STATUS_ROLES = {
  Accepted: ['restaurant', 'admin'],
  Preparing: ['restaurant', 'admin'],
  Ready: ['restaurant', 'admin'],
  OutForDelivery: ['delivery', 'admin'],
  Delivered: ['delivery', 'admin'],
  Cancelled: ['customer', 'restaurant', 'admin'],
};

// Legal forward transitions; anything else is rejected with 400.
export const STATUS_FLOW = {
  Placed: ['Accepted', 'Cancelled'],
  Accepted: ['Preparing', 'Cancelled'],
  Preparing: ['Ready', 'Cancelled'],
  Ready: ['OutForDelivery', 'Cancelled'],
  OutForDelivery: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};

const orderItemSchema = new mongoose.Schema(
  {
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
    name: String,
    price: Number,
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    items: {
      type: [orderItemSchema],
      validate: [(v) => Array.isArray(v) && v.length > 0, 'Order must contain at least one item'],
    },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 30 },
    total: { type: Number, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'Placed', index: true },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now } }],
    deliveryAddress: { type: String, required: true },
    // No default: an address we could not place must read as unknown rather
    // than silently claiming to be in the middle of Bengaluru.
    deliveryLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    // Courier reads this to the restaurant at pickup; guards against wrong-order handoffs.
    pickupOtp: { type: String, select: false },
    paymentMethod: { type: String, enum: ['cod', 'mock-card', 'razorpay'], default: 'cod' },
    paymentStatus: {
      type: String,
      // 'refunding' covers the window between asking the gateway and it
      // confirming, which can take days on a card.
      enum: ['pending', 'paid', 'refunding', 'refunded', 'refund_failed'],
      default: 'pending',
    },
    cancellationReason: String,
    rating: { type: Number, min: 1, max: 5 },
    review: String,
  },
  { timestamps: true }
);

export default mongoose.model('Order', orderSchema);
