import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import Order from '../src/models/Order.js';

jest.setTimeout(60000);

const DAY = 86400000;

/** Writes an order straight to the collection, dated wherever the test needs it. */
async function seedOrder({
  restaurantId,
  customerId,
  status = 'Delivered',
  items = [{ name: 'Dal', price: 100, qty: 1 }],
  daysAgo = 0,
  rating,
}) {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const at = new Date(Date.now() - daysAgo * DAY);

  const order = await Order.create({
    customerId,
    restaurantId,
    items: items.map((i) => ({ ...i, foodId: restaurantId })),
    subtotal,
    deliveryFee: 30,
    total: subtotal + 30,
    status,
    deliveryAddress: '5 Test Road, Hyderabad',
    ...(rating ? { rating } : {}),
  });

  // Mongoose marks createdAt immutable once timestamps are on, so it drops a
  // $set on it without complaining. Go through the driver to backdate.
  if (daysAgo) {
    await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: at } });
  }
  return order;
}

describe('GET /api/restaurants/mine/analytics', () => {
  let owner;
  let customer;
  let restaurant;

  beforeAll(startDb);
  afterAll(stopDb);
  afterEach(clearDb);

  beforeEach(async () => {
    owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
    customer = await makeUser({ email: 'eater@test.dev', role: 'customer' });
    ({ restaurant } = await makeRestaurantWithMenu(owner.user._id));
  });

  const get = (token, query = '') =>
    request(app).get(`/api/restaurants/mine/analytics${query}`).set(auth(token));

  it('needs a signed-in user', async () => {
    const res = await request(app).get('/api/restaurants/mine/analytics');
    expect(res.status).toBe(401);
  });

  it('is closed to customers', async () => {
    const res = await get(customer.token);
    expect(res.status).toBe(403);
  });

  it('says so plainly when the owner has no restaurant yet', async () => {
    const fresh = await makeUser({ email: 'new-owner@test.dev', role: 'restaurant' });
    const res = await get(fresh.token);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no restaurant/i);
  });

  it('counts revenue from the subtotal, not the total', async () => {
    // The ₹30 delivery fee is collected from the customer but is not the
    // kitchen's money. Two orders of ₹100 are ₹200 of revenue, not ₹260.
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id });

    const res = await get(owner.token);

    expect(res.status).toBe(200);
    expect(res.body.totals.revenue).toBe(200);
  });

  it('counts only delivered orders as revenue', async () => {
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id, status: 'Delivered' });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id, status: 'Preparing' });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id, status: 'Cancelled' });

    const { body } = await get(owner.token);

    expect(body.totals.orders).toBe(3);
    expect(body.totals.delivered).toBe(1);
    expect(body.totals.cancelled).toBe(1);
    // Only the delivered one.
    expect(body.totals.revenue).toBe(100);
  });

  it('averages the order value over delivered orders only', async () => {
    await seedOrder({
      restaurantId: restaurant._id,
      customerId: customer.user._id,
      items: [{ name: 'Dal', price: 100, qty: 1 }],
    });
    await seedOrder({
      restaurantId: restaurant._id,
      customerId: customer.user._id,
      items: [{ name: 'Dal', price: 300, qty: 1 }],
    });
    // A pending order must not drag the average down.
    await seedOrder({
      restaurantId: restaurant._id,
      customerId: customer.user._id,
      status: 'Placed',
      items: [{ name: 'Dal', price: 1000, qty: 1 }],
    });

    const { body } = await get(owner.token);
    expect(body.totals.averageOrder).toBe(200);
  });

  it('reports the cancellation rate over everything placed', async () => {
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id, status: 'Cancelled' });

    const { body } = await get(owner.token);
    expect(body.totals.cancellationRate).toBe(25);
  });

  it('ignores orders older than the window', async () => {
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id, daysAgo: 2 });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id, daysAgo: 40 });

    const { body } = await get(owner.token, '?days=7');

    expect(body.days).toBe(7);
    expect(body.totals.orders).toBe(1);
  });

  it('never reports on another kitchen', async () => {
    const rival = await makeUser({ email: 'rival@test.dev', role: 'restaurant' });
    const { restaurant: theirs } = await makeRestaurantWithMenu(rival.user._id);
    await seedOrder({ restaurantId: theirs._id, customerId: customer.user._id });

    const { body } = await get(owner.token);

    expect(body.restaurant._id).toBe(restaurant._id.toString());
    expect(body.totals.orders).toBe(0);
    expect(body.totals.revenue).toBe(0);
  });

  it('ranks dishes by how many actually sold', async () => {
    await seedOrder({
      restaurantId: restaurant._id,
      customerId: customer.user._id,
      items: [{ name: 'Dal', price: 100, qty: 3 }, { name: 'Roti', price: 20, qty: 1 }],
    });
    await seedOrder({
      restaurantId: restaurant._id,
      customerId: customer.user._id,
      items: [{ name: 'Dal', price: 100, qty: 2 }],
    });

    const { body } = await get(owner.token);

    expect(body.topDishes[0]).toEqual({ name: 'Dal', qty: 5, revenue: 500 });
    expect(body.topDishes[1]).toEqual({ name: 'Roti', qty: 1, revenue: 20 });
  });

  it('returns one entry per day in the window, zeros included', async () => {
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id });

    const { body } = await get(owner.token, '?days=7');

    // A day nobody ordered has to read as zero, not go missing — a gap would
    // draw a straight line across it and hide the quiet day.
    expect(body.daily).toHaveLength(7);
    expect(body.daily.filter((d) => d.revenue === 0)).toHaveLength(6);
    expect(body.daily.at(-1).revenue).toBe(100);
  });

  it('returns all 24 hours so the quiet ones are visible', async () => {
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id });

    const { body } = await get(owner.token);

    expect(body.byHour).toHaveLength(24);
    expect(body.byHour.map((h) => h.hour)).toEqual([...Array(24).keys()]);
    expect(body.byHour.reduce((sum, h) => sum + h.orders, 0)).toBe(1);
  });

  it('summarises ratings without pretending an unrated window has a score', async () => {
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id, rating: 5 });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id, rating: 4 });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id });

    const { body } = await get(owner.token);

    expect(body.ratings.inWindow).toBe(4.5);
    expect(body.ratings.inWindowCount).toBe(2);
    expect(body.ratings.distribution).toEqual({ 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 });
  });

  it('reports zeros rather than failing on a kitchen with no orders', async () => {
    const { body } = await get(owner.token);

    expect(body.totals).toEqual({
      orders: 0,
      delivered: 0,
      cancelled: 0,
      revenue: 0,
      averageOrder: 0,
      cancellationRate: 0,
    });
    expect(body.topDishes).toEqual([]);
    expect(body.ratings.inWindow).toBe(0);
  });

  it('clamps a silly window rather than trying to serve it', async () => {
    const huge = await get(owner.token, '?days=99999');
    expect(huge.body.days).toBe(365);

    const nonsense = await get(owner.token, '?days=banana');
    expect(nonsense.body.days).toBe(30);

    const negative = await get(owner.token, '?days=-5');
    expect(negative.body.days).toBe(30);
  });

  it('lets an admin look at a named kitchen', async () => {
    const admin = await makeUser({ email: 'boss@test.dev', role: 'admin' });
    await seedOrder({ restaurantId: restaurant._id, customerId: customer.user._id });

    const res = await get(admin.token, `?restaurantId=${restaurant._id}`);

    expect(res.status).toBe(200);
    expect(res.body.restaurant.name).toBe(restaurant.name);
    expect(res.body.totals.revenue).toBe(100);
  });

  it('rejects a malformed restaurantId from an admin', async () => {
    const admin = await makeUser({ email: 'boss2@test.dev', role: 'admin' });
    const res = await get(admin.token, '?restaurantId=not-an-id');

    expect(res.status).toBe(400);
  });
});
