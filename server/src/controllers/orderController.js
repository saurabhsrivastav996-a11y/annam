import crypto from 'node:crypto';
import Order, { STATUS_FLOW, STATUS_ROLES } from '../models/Order.js';
import FoodItem from '../models/FoodItem.js';
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { emitToOrder, emitToUser } from '../sockets/emitters.js';
import { roadDistanceKm, travelMinutes, etaMinutes, pointToCoord } from '../utils/geo.js';

const DELIVERY_FEE = 30;

/** True when this user is allowed to see/act on the order at all. */
function canAccessOrder(order, user) {
  if (user.role === 'admin') return true;
  const uid = user._id.toString();
  if (order.customerId?._id?.toString?.() === uid || order.customerId?.toString?.() === uid) return true;
  if (order.deliveryId?._id?.toString?.() === uid || order.deliveryId?.toString?.() === uid) return true;
  return false;
}

export const createOrder = asyncHandler(async (req, res) => {
  const { restaurantId, items, deliveryAddress, paymentMethod = 'cod', lat, lng } = req.body;

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new ApiError(404, 'Restaurant not found');
  if (!restaurant.isOpen) throw new ApiError(400, 'This restaurant is currently closed');

  // Price from the database, never from the client payload.
  const foodIds = items.map((i) => i.foodId);
  const foods = await FoodItem.find({ _id: { $in: foodIds }, restaurantId });
  const foodById = new Map(foods.map((f) => [f._id.toString(), f]));

  const orderItems = items.map(({ foodId, qty }) => {
    const food = foodById.get(String(foodId));
    if (!food) throw new ApiError(400, `Menu item ${foodId} is not available at this restaurant`);
    if (!food.isAvailable) throw new ApiError(400, `${food.name} is currently unavailable`);
    return { foodId: food._id, name: food.name, price: food.price, qty: Number(qty) };
  });

  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);

  const order = await Order.create({
    customerId: req.user._id,
    restaurantId,
    items: orderItems,
    subtotal,
    deliveryFee: DELIVERY_FEE,
    total: subtotal + DELIVERY_FEE,
    deliveryAddress,
    paymentMethod,
    // Mock gateway: card payments are treated as settled on creation.
    paymentStatus: paymentMethod === 'mock-card' ? 'paid' : 'pending',
    pickupOtp: String(crypto.randomInt(1000, 9999)),
    statusHistory: [{ status: 'Placed', at: new Date() }],
    ...(lat && lng
      ? { deliveryLocation: { type: 'Point', coordinates: [Number(lng), Number(lat)] } }
      : {}),
  });

  emitToUser(restaurant.ownerUserId.toString(), 'order:new', { orderId: order._id });

  res.status(201).json(order);
});

/**
 * Distance still to travel and minutes remaining.
 * Measured from the courier once they are carrying the food, and from the
 * kitchen before that — the leg that has not happened yet is the one that
 * matters to the person waiting.
 */
export function orderEta(order, courierPosition = null) {
  const restaurant = pointToCoord(order.restaurantId?.location);
  const destination = pointToCoord(order.deliveryLocation);
  if (!destination) return { distanceKm: null, etaMinutes: null };

  const origin = order.status === 'OutForDelivery' && courierPosition ? courierPosition : restaurant;
  if (!origin) return { distanceKm: null, etaMinutes: null };

  if (['Delivered', 'Cancelled'].includes(order.status)) {
    return { distanceKm: null, etaMinutes: null };
  }

  return {
    distanceKm: roadDistanceKm(origin, destination),
    etaMinutes: etaMinutes({ from: origin, to: destination, status: order.status }),
  };
}

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('restaurantId', 'name address phone location imageUrl')
    .populate('customerId', 'name phone')
    .populate('deliveryId', 'name phone location');
  if (!order) throw new ApiError(404, 'Order not found');

  const isOwnerOfRestaurant =
    req.user.role === 'restaurant' &&
    (await Restaurant.exists({ _id: order.restaurantId?._id, ownerUserId: req.user._id }));

  if (!canAccessOrder(order, req.user) && !isOwnerOfRestaurant) {
    throw new ApiError(403, 'You cannot view this order');
  }

  res.json({ ...order.toObject(), ...orderEta(order) });
});

/** Orders for the logged-in user, scoped by their role. */
export const listMyOrders = asyncHandler(async (req, res) => {
  const { role, _id } = req.user;
  let filter;

  if (role === 'customer') {
    filter = { customerId: _id };
  } else if (role === 'restaurant') {
    const restaurant = await Restaurant.findOne({ ownerUserId: _id });
    if (!restaurant) return res.json([]);
    filter = { restaurantId: restaurant._id };
  } else if (role === 'delivery') {
    // Unassigned ready orders are visible so a courier can claim one.
    filter = { $or: [{ deliveryId: _id }, { deliveryId: null, status: 'Ready' }] };
  } else if (role === 'admin') {
    filter = {};
  } else {
    // Any other role (e.g. volunteer) has no business seeing orders at all.
    return res.json([]);
  }

  const orders = await Order.find(filter)
    .populate('restaurantId', 'name address location imageUrl')
    .populate('customerId', 'name phone')
    .populate('deliveryId', 'name phone')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json(
    orders.map((o) => {
      const withEta = { ...o.toObject(), ...orderEta(o) };
      // A courier deciding whether to claim a job wants the ride to the kitchen too.
      if (req.user.role === 'delivery') {
        const restaurant = pointToCoord(o.restaurantId?.location);
        const drop = pointToCoord(o.deliveryLocation);
        withEta.legKm = { pickup: null, drop: roadDistanceKm(restaurant, drop) };
        withEta.dropMinutes = travelMinutes(withEta.legKm.drop);
      }
      return withEta;
    })
  );
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const order = await Order.findById(req.params.id).select('+pickupOtp');
  if (!order) throw new ApiError(404, 'Order not found');

  const allowedRoles = STATUS_ROLES[status];
  if (!allowedRoles) throw new ApiError(400, `Unknown status: ${status}`);
  if (!allowedRoles.includes(req.user.role)) {
    throw new ApiError(403, `Role "${req.user.role}" cannot set status "${status}"`);
  }
  if (!STATUS_FLOW[order.status].includes(status)) {
    throw new ApiError(400, `Cannot move an order from ${order.status} to ${status}`);
  }

  // Restaurants may only touch their own orders.
  if (req.user.role === 'restaurant') {
    const owns = await Restaurant.exists({ _id: order.restaurantId, ownerUserId: req.user._id });
    if (!owns) throw new ApiError(403, 'You do not own this order');
  }
  // A courier must have claimed the order first.
  if (req.user.role === 'delivery' && order.deliveryId?.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'This order is assigned to another delivery partner');
  }
  // Pickup requires the OTP the customer sees on their tracking page.
  if (status === 'OutForDelivery' && req.body.otp !== order.pickupOtp) {
    throw new ApiError(400, 'Incorrect pickup OTP');
  }

  order.status = status;
  order.statusHistory.push({ status, at: new Date() });
  if (status === 'Delivered') order.paymentStatus = 'paid';
  await order.save();

  // Order room only: everyone watching this order (customer, kitchen, courier)
  // is already in it, and a second emit to the customer's user room would
  // deliver the same update twice.
  emitToOrder(order._id.toString(), 'order:status', { orderId: order._id, status });

  res.json(order);
});

/** A delivery partner claims an unassigned order that is Ready for pickup. */
export const acceptDelivery = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).select('+pickupOtp');
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.deliveryId) throw new ApiError(409, 'Order already claimed by another partner');
  if (order.status !== 'Ready') throw new ApiError(400, 'Order is not ready for pickup yet');

  order.deliveryId = req.user._id;
  await order.save();

  emitToOrder(order._id.toString(), 'order:assigned', {
    orderId: order._id,
    delivery: { id: req.user._id, name: req.user.name, phone: req.user.phone },
  });

  res.json(order);
});

export const rateOrder = asyncHandler(async (req, res) => {
  const { rating, review } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.customerId.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'You can only rate your own orders');
  }
  if (order.status !== 'Delivered') throw new ApiError(400, 'Only delivered orders can be rated');
  if (order.rating) throw new ApiError(409, 'This order has already been rated');

  order.rating = rating;
  order.review = typeof review === 'string' ? review.trim() : undefined;
  await order.save();

  // Fold the new score into the restaurant's running average.
  const restaurant = await Restaurant.findById(order.restaurantId);
  if (restaurant) {
    const total = restaurant.rating * restaurant.ratingCount + rating;
    restaurant.ratingCount += 1;
    restaurant.rating = Number((total / restaurant.ratingCount).toFixed(2));
    await restaurant.save();
  }

  // Return the same populated shape as GET /orders/:id. Handing back a raw
  // document would blank the restaurant and courier names on the page that
  // just submitted the review, and hide the review it wrote.
  const populated = await Order.findById(order._id)
    .populate('restaurantId', 'name address phone location imageUrl')
    .populate('customerId', 'name phone')
    .populate('deliveryId', 'name phone location');

  res.json(populated);
});

/** Customer-facing: the OTP to read out to the courier at handoff. */
export const getPickupOtp = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).select('+pickupOtp customerId');
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.customerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new ApiError(403, 'Not your order');
  }
  res.json({ otp: order.pickupOtp });
});

export const setAvailability = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.isAvailable = Boolean(req.body.isAvailable);
  await user.save();
  res.json({ isAvailable: user.isAvailable });
});
