import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import Reel from '../models/Reel.js';
import Donation from '../models/Donation.js';
import Order from '../models/Order.js';
import { connectDB, disconnectDB } from '../config/db.js';
import * as demo from './data.js';
import { seedHistory } from './history.js';

/** Wipes and repopulates every collection with the demo dataset. */
export async function seedDatabase() {
  await Promise.all([
    User.deleteMany({}),
    Restaurant.deleteMany({}),
    FoodItem.deleteMany({}),
    Reel.deleteMany({}),
    Donation.deleteMany({}),
    Order.deleteMany({}),
  ]);

  const userByEmail = new Map();
  for (const u of demo.users) {
    const user = new User(u);
    await user.setPassword(demo.DEMO_PASSWORD);
    await user.save();
    userByEmail.set(u.email, user);
  }

  const restaurantByName = new Map();
  for (const { ownerEmail, menu, ...rest } of demo.restaurants) {
    const restaurant = await Restaurant.create({ ...rest, ownerUserId: userByEmail.get(ownerEmail)._id });
    restaurantByName.set(restaurant.name, restaurant);
    await FoodItem.insertMany(menu.map((m) => ({ ...m, restaurantId: restaurant._id })));
  }

  await Reel.insertMany(
    demo.reels.map(({ restaurant, ...rest }) => ({
      ...rest,
      restaurantId: restaurantByName.get(restaurant)._id,
      views: Math.floor(Math.random() * 900) + 100,
      likes: Math.floor(Math.random() * 200) + 20,
    }))
  );

  // Surplus is posted near closing time, so deadlines land at 22:00 today
  // (tomorrow, if it is already past that).
  const pickupBefore = new Date();
  pickupBefore.setHours(22, 0, 0, 0);
  if (pickupBefore < new Date()) pickupBefore.setDate(pickupBefore.getDate() + 1);

  await Donation.insertMany(
    demo.donations.map(({ restaurant, volunteerEmail, ...rest }) => {
      const r = restaurantByName.get(restaurant);
      return {
        ...rest,
        restaurantId: r._id,
        pickupAddress: r.address,
        pickupLocation: r.location,
        pickupBefore,
        volunteerId: volunteerEmail ? userByEmail.get(volunteerEmail)._id : null,
        ...(rest.status === 'Completed'
          ? { acceptedAt: new Date(Date.now() - 3600e3), completedAt: new Date() }
          : {}),
      };
    })
  );

  // Keep each volunteer's impact counters consistent with the donations above,
  // which are inserted directly rather than going through the accept/complete API.
  for (const d of demo.donations.filter((x) => x.status === 'Completed' && x.volunteerEmail)) {
    await User.updateOne(
      { _id: userByEmail.get(d.volunteerEmail)._id },
      { $inc: { 'stats.donationsCollected': 1, 'stats.mealsServed': d.quantity } }
    );
  }

  // One delivered order so the customer's history and ratings are not empty.
  const customer = userByEmail.get('customer@annam.dev');
  const spice = restaurantByName.get('Spice Bites');
  const menu = await FoodItem.find({ restaurantId: spice._id }).limit(2);
  const items = menu.map((f) => ({ foodId: f._id, name: f.name, price: f.price, qty: 1 }));
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  await Order.create({
    customerId: customer._id,
    restaurantId: spice._id,
    deliveryId: userByEmail.get('delivery@annam.dev')._id,
    items,
    subtotal,
    deliveryFee: 30,
    total: subtotal + 30,
    status: 'Delivered',
    paymentStatus: 'paid',
    deliveryAddress: '12 Indiranagar 100ft Rd, Bengaluru 560038',
    deliveryLocation: { type: 'Point', coordinates: [77.6408, 12.9719] },
    pickupOtp: '4821',
    statusHistory: ['Placed', 'Accepted', 'Preparing', 'Ready', 'OutForDelivery', 'Delivered'].map(
      (status, i) => ({ status, at: new Date(Date.now() - (6 - i) * 6e5) })
    ),
  });

  // Rated, delivered orders so every restaurant page opens with real reviews,
  // and each restaurant's average is derived from them rather than invented.
  const tally = new Map();

  for (const [i, r] of demo.reviews.entries()) {
    const restaurant = restaurantByName.get(r.restaurant);
    const menuItems = await FoodItem.find({ restaurantId: restaurant._id, name: { $in: r.dishes } });
    const reviewItems = menuItems.map((f) => ({ foodId: f._id, name: f.name, price: f.price, qty: 1 }));
    if (!reviewItems.length) continue;

    const reviewSubtotal = reviewItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const placedAt = new Date(Date.now() - (i + 1) * 36e5 * 20);

    await Order.create({
      customerId: userByEmail.get(r.email)._id,
      restaurantId: restaurant._id,
      deliveryId: userByEmail.get('delivery@annam.dev')._id,
      items: reviewItems,
      subtotal: reviewSubtotal,
      deliveryFee: 30,
      total: reviewSubtotal + 30,
      status: 'Delivered',
      paymentStatus: 'paid',
      deliveryAddress: 'Indiranagar, Bengaluru',
      pickupOtp: '1234',
      rating: r.rating,
      review: r.text,
      createdAt: placedAt,
      statusHistory: [{ status: 'Delivered', at: placedAt }],
    });

    const current = tally.get(restaurant.name) || { sum: 0, count: 0 };
    tally.set(restaurant.name, { sum: current.sum + r.rating, count: current.count + 1 });
  }

  for (const [name, { sum, count }] of tally) {
    const restaurant = restaurantByName.get(name);
    restaurant.rating = Number((sum / count).toFixed(2));
    restaurant.ratingCount = count;
    await restaurant.save();
  }

  // Weeks of past trade, so the analytics tab has something to plot on a
  // first run. Written last: it needs every restaurant's menu to exist.
  const menusByRestaurantId = new Map();
  for (const restaurant of restaurantByName.values()) {
    menusByRestaurantId.set(
      restaurant._id.toString(),
      await FoodItem.find({ restaurantId: restaurant._id }).lean()
    );
  }

  await seedHistory({
    restaurants: [...restaurantByName.values()],
    menusByRestaurantId,
    customerIds: demo.users
      .filter((u) => u.role === 'customer')
      .map((u) => userByEmail.get(u.email)._id),
    deliveryId: userByEmail.get('delivery@annam.dev')._id,
  });

  const counts = {
    users: await User.countDocuments(),
    restaurants: await Restaurant.countDocuments(),
    foodItems: await FoodItem.countDocuments(),
    reels: await Reel.countDocuments(),
    donations: await Donation.countDocuments(),
    orders: await Order.countDocuments(),
    reviews: await Order.countDocuments({ rating: { $ne: null } }),
  };
  return counts;
}

/** Seeds only when the database has no users yet (used on in-memory boots). */
export async function seedIfEmpty() {
  if (await User.countDocuments()) return null;
  const counts = await seedDatabase();
  console.log('[seed] demo data loaded:', counts);
  console.log(`[seed] all demo logins use password: ${demo.DEMO_PASSWORD}`);
  return counts;
}

// `npm run seed` entry point.
const isCli = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isCli) {
  connectDB()
    .then(seedDatabase)
    .then(async (counts) => {
      console.log('[seed] done:', counts);
      console.log(`[seed] password for every demo account: ${demo.DEMO_PASSWORD}`);
      if (mongoose.connection.readyState) await disconnectDB();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exit(1);
    });
}
