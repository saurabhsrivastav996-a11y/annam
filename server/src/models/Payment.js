import mongoose from 'mongoose';

/**
 * A checkout attempt, created before the customer is sent to Razorpay.
 *
 * It holds the server-priced basket so the eventual order is built from what we
 * quoted, not from whatever the browser sends back after paying. The real Order
 * is only written once the payment signature verifies.
 */
const paymentSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },

    items: [
      {
        foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
        name: String,
        price: Number,
        qty: Number,
        _id: false,
      },
    ],
    subtotal: Number,
    deliveryFee: Number,
    amount: { type: Number, required: true }, // rupees, as quoted
    currency: { type: String, default: 'INR' },

    deliveryAddress: { type: String, required: true },
    deliveryLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [77.5946, 12.9716] },
    },

    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: String,

    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },
    // Set once the payment clears, so a replayed callback cannot order twice.
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    failureReason: String,
  },
  { timestamps: true }
);

export default mongoose.model('Payment', paymentSchema);
