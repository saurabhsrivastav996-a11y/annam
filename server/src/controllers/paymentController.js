import crypto from 'node:crypto';
import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import FoodItem from '../models/FoodItem.js';
import Restaurant from '../models/Restaurant.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { emitToUser } from '../sockets/emitters.js';
import {
  razorpay,
  razorpayEnabled,
  toPaise,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../config/razorpay.js';
import { env } from '../config/env.js';
import { notifyOrderPlaced } from '../services/notify.js';
import { geocode } from '../services/geocode.js';

const DELIVERY_FEE = 30;

/** Lets the client know whether to offer online payment, and with which key. */
export const getConfig = asyncHandler(async (req, res) => {
  res.json({
    enabled: razorpayEnabled,
    // Publishable key only. The secret never leaves the server.
    keyId: razorpayEnabled ? env.razorpay.keyId : null,
    currency: 'INR',
  });
});

/** Prices the basket server-side and opens a Razorpay order for it. */
export const createCheckout = asyncHandler(async (req, res) => {
  if (!razorpayEnabled) {
    throw new ApiError(503, 'Online payment is not configured on this server');
  }

  const { restaurantId, items, deliveryAddress, lat, lng } = req.body;

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new ApiError(404, 'Restaurant not found');
  if (!restaurant.isOpen) throw new ApiError(400, 'This restaurant is currently closed');

  // Same rule as cash orders: prices come from the database, never the client.
  const foods = await FoodItem.find({ _id: { $in: items.map((i) => i.foodId) }, restaurantId });
  const foodById = new Map(foods.map((f) => [f._id.toString(), f]));

  const priced = items.map(({ foodId, qty }) => {
    const food = foodById.get(String(foodId));
    if (!food) throw new ApiError(400, `Menu item ${foodId} is not available at this restaurant`);
    if (!food.isAvailable) throw new ApiError(400, `${food.name} is currently unavailable`);
    return { foodId: food._id, name: food.name, price: food.price, qty: Number(qty) };
  });

  const subtotal = priced.reduce((sum, i) => sum + i.price * i.qty, 0);
  const amount = subtotal + DELIVERY_FEE;

  // A gateway rejection (bad keys, gateway down, amount limits) is a normal
  // failure mode, not a bug in Annam — surface it as such instead of a 500.
  let rzpOrder;
  try {
    rzpOrder = await razorpay.orders.create({
      amount: toPaise(amount),
      currency: 'INR',
      receipt: `annam_${crypto.randomBytes(8).toString('hex')}`,
      notes: { customerId: req.user._id.toString(), restaurant: restaurant.name },
    });
  } catch (err) {
    const reason = err?.error?.description || err?.message || 'unknown error';
    console.error('[razorpay] could not open an order:', reason);

    if (err?.statusCode === 401) {
      throw new ApiError(502, 'Payment gateway rejected our credentials. Check the Razorpay keys.');
    }
    throw new ApiError(502, `Payment gateway is unavailable right now (${reason}). Try cash on delivery.`);
  }

  // Same rule as a cash order: use the confirmed pin, else geocode the address,
  // else store nothing rather than inventing a location.
  const deliveryPoint =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : await geocode(deliveryAddress);

  const payment = await Payment.create({
    customerId: req.user._id,
    restaurantId,
    items: priced,
    subtotal,
    deliveryFee: DELIVERY_FEE,
    amount,
    deliveryAddress,
    razorpayOrderId: rzpOrder.id,
    ...(deliveryPoint
      ? { deliveryLocation: { type: 'Point', coordinates: [deliveryPoint.lng, deliveryPoint.lat] } }
      : {}),
  });

  res.status(201).json({
    razorpayOrderId: rzpOrder.id,
    amount: payment.amount,
    amountInPaise: rzpOrder.amount,
    currency: rzpOrder.currency,
    keyId: env.razorpay.keyId,
    restaurantName: restaurant.name,
  });
});

/**
 * Turns a verified payment into a real order.
 * Idempotent: replaying the same callback returns the order already created
 * rather than placing a second one.
 */
async function fulfil(payment) {
  if (payment.orderId) return Order.findById(payment.orderId);

  const order = await Order.create({
    customerId: payment.customerId,
    restaurantId: payment.restaurantId,
    items: payment.items,
    subtotal: payment.subtotal,
    deliveryFee: payment.deliveryFee,
    total: payment.amount,
    deliveryAddress: payment.deliveryAddress,
    deliveryLocation: payment.deliveryLocation,
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    pickupOtp: String(crypto.randomInt(1000, 9999)),
    statusHistory: [{ status: 'Placed', at: new Date() }],
  });

  payment.status = 'paid';
  payment.orderId = order._id;
  await payment.save();

  const restaurant = await Restaurant.findById(payment.restaurantId).select('ownerUserId');
  if (restaurant) {
    emitToUser(restaurant.ownerUserId.toString(), 'order:new', { orderId: order._id });
  }
  notifyOrderPlaced(order);

  return order;
}

/** Called by the browser once Razorpay Checkout reports success. */
export const verifyCheckout = asyncHandler(async (req, res) => {
  const { razorpay_order_id: rzpOrderId, razorpay_payment_id: rzpPaymentId, razorpay_signature: signature } =
    req.body;

  const payment = await Payment.findOne({ razorpayOrderId: rzpOrderId });
  if (!payment) throw new ApiError(404, 'Unknown payment');
  if (payment.customerId.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'This payment belongs to another account');
  }

  // The browser is not trusted: without a valid signature nothing is created.
  if (!verifyPaymentSignature({ razorpayOrderId: rzpOrderId, razorpayPaymentId: rzpPaymentId, signature })) {
    payment.status = 'failed';
    payment.failureReason = 'Signature verification failed';
    await payment.save();
    throw new ApiError(400, 'Payment could not be verified');
  }

  payment.razorpayPaymentId = rzpPaymentId;
  const order = await fulfil(payment);

  res.json({ order });
});

/** Customer closed the Razorpay modal, or the gateway reported a failure. */
export const abandonCheckout = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    razorpayOrderId: req.body.razorpay_order_id,
    customerId: req.user._id,
  });
  if (!payment) throw new ApiError(404, 'Unknown payment');

  // A paid order must never be walked back by a client-reported failure.
  if (payment.status === 'created') {
    payment.status = 'failed';
    payment.failureReason = String(req.body.reason || 'Cancelled by customer').slice(0, 200);
    await payment.save();
  }

  res.json({ status: payment.status });
});

/**
 * Razorpay's server-to-server confirmation.
 *
 * The browser can be closed the instant after paying, so the callback above is
 * not guaranteed to arrive. This is the path that makes fulfilment reliable.
 * `req.body` is the raw Buffer — the signature covers the exact bytes sent.
 */
export const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  if (!verifyWebhookSignature(raw, signature)) {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  const event = JSON.parse(raw.toString('utf8'));
  const entity = event?.payload?.payment?.entity;
  if (!entity?.order_id) return res.json({ received: true });

  const payment = await Payment.findOne({ razorpayOrderId: entity.order_id });
  if (!payment) return res.json({ received: true });

  if (event.event === 'payment.captured') {
    payment.razorpayPaymentId = entity.id;
    await fulfil(payment);
  } else if (event.event === 'payment.failed' && payment.status === 'created') {
    payment.status = 'failed';
    payment.failureReason = entity.error_description || 'Payment failed';
    await payment.save();
  }

  // Always 200 on a verified event, or Razorpay will keep retrying.
  res.json({ received: true });
});
