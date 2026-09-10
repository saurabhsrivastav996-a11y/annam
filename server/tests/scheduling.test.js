import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import Order from '../src/models/Order.js';
import Restaurant from '../src/models/Restaurant.js';
import {
  planSchedule,
  leadMinutesFor,
  releaseDueOrders,
  MAX_AHEAD_DAYS,
  RELEASE_BUFFER_MINUTES,
  UNKNOWN_TRAVEL_MINUTES,
  CLOSED_AT_RELEASE_REASON,
} from '../src/services/scheduling.js';
import { PREP_MINUTES } from '../src/utils/geo.js';

jest.setTimeout(60000);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Test kitchens sit at the model's default point in central Hyderabad. Orders
// here send exact coordinates, so no test depends on reaching a geocoder.
const BANJARA_HILLS = { lat: 17.4126, lng: 78.4392 }; // a short ride
const GACHIBOWLI = { lat: 17.4401, lng: 78.3489 }; // across the city
const point = ({ lat, lng }) => ({ type: 'Point', coordinates: [lng, lat] });

let customer, owner, intruder, restaurant, items;

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

beforeEach(async () => {
  customer = await makeUser({ email: 'customer@test.dev', role: 'customer' });
  owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
  intruder = await makeUser({ email: 'intruder@test.dev', role: 'customer' });
  ({ restaurant, items } = await makeRestaurantWithMenu(owner.user._id));
});

const inHours = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

/** Places an order to Banjara Hills; pass scheduledFor to book it for later. */
const place = (body = {}) =>
  request(app)
    .post('/api/orders')
    .set(auth(customer.token))
    .send({
      restaurantId: restaurant._id.toString(),
      items: [{ foodId: items[0]._id.toString(), qty: 1 }],
      deliveryAddress: 'Road No. 12, Banjara Hills, Hyderabad',
      ...BANJARA_HILLS,
      ...body,
    });

const setStatus = (orderId, token, status) =>
  request(app).put(`/api/orders/${orderId}/status`).set(auth(token)).send({ status });

const leadTo = (to) =>
  leadMinutesFor({ restaurantLocation: restaurant.location, deliveryLocation: to && point(to) });

describe('planning a slot', () => {
  const plan = (scheduledFor, now = new Date()) =>
    planSchedule({
      scheduledFor,
      restaurantLocation: restaurant.location,
      deliveryLocation: point(BANJARA_HILLS),
      now,
    });

  it('treats an order with no slot as an order for now', () => {
    expect(plan(undefined)).toBeNull();
    expect(plan('')).toBeNull();
  });

  it('starts the kitchen early enough for prep, the ride and a buffer', () => {
    const now = new Date();
    const slot = new Date(now.getTime() + 3 * HOUR);
    const lead = leadTo(BANJARA_HILLS);

    expect(lead).toBeGreaterThan(PREP_MINUTES.Placed + RELEASE_BUFFER_MINUTES);
    expect(plan(slot, now)).toEqual({
      scheduledFor: slot,
      releaseAt: new Date(slot.getTime() - lead * MINUTE),
    });
  });

  it('starts earlier for an address further away', () => {
    expect(leadTo(GACHIBOWLI)).toBeGreaterThan(leadTo(BANJARA_HILLS));
  });

  it('assumes a ride when the address could not be placed on a map', () => {
    expect(leadTo(null)).toBe(PREP_MINUTES.Placed + UNKNOWN_TRAVEL_MINUTES + RELEASE_BUFFER_MINUTES);
  });

  it('refuses a slot the kitchen cannot make, and says what it can', () => {
    const now = new Date();
    const tooSoon = new Date(now.getTime() + (leadTo(BANJARA_HILLS) - 5) * MINUTE);

    expect(() => plan(tooSoon, now)).toThrow(/earliest this kitchen can deliver there/);
  });

  it('refuses a slot beyond the booking window', () => {
    const now = new Date();
    const tooFar = new Date(now.getTime() + (MAX_AHEAD_DAYS * 24 + 1) * HOUR);

    expect(() => plan(tooFar, now)).toThrow(`up to ${MAX_AHEAD_DAYS} days ahead`);
  });

  it('refuses a time it cannot read', () => {
    expect(() => plan('not-a-date')).toThrow(/valid date/);
  });
});

describe('placing a scheduled order', () => {
  it('books it as Scheduled rather than handing it to the kitchen', async () => {
    const res = await place({ scheduledFor: inHours(3) });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Scheduled');
    expect(new Date(res.body.releaseAt).getTime()).toBeLessThan(new Date(res.body.scheduledFor).getTime());
    expect(res.body.statusHistory.map((h) => h.status)).toEqual(['Scheduled']);
  });

  it('places an order with no slot straight away, as before', async () => {
    const res = await place();

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Placed');
    expect(res.body.scheduledFor).toBeNull();
  });

  it('turns away a slot too soon to cook and deliver, without creating an order', async () => {
    const res = await place({ scheduledFor: inHours(0.25) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/earliest/);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('rejects a slot that is not a date at the door', async () => {
    const res = await place({ scheduledFor: 'tomorrow evening' });
    expect(res.status).toBe(400);
  });

  it('shows the slot rather than a countdown', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3) });
    const res = await request(app).get(`/api/orders/${order._id}`).set(auth(customer.token));

    expect(res.status).toBe(200);
    expect(res.body.etaMinutes).toBeNull();
    expect(res.body.distanceKm).toBeGreaterThan(0);
    expect(res.body.scheduledFor).toBe(order.scheduledFor);
  });
});

describe('who can move a scheduled order', () => {
  it('does not let the kitchen start it before it is released', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3) });
    expect((await setStatus(order._id, owner.token, 'Accepted')).status).toBe(400);
  });

  it('does not let anyone release it early through the API', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3) });

    expect((await setStatus(order._id, owner.token, 'Placed')).status).toBe(400);
    expect((await Order.findById(order._id)).status).toBe('Scheduled');
  });

  it('lets the customer cancel their own', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3) });
    const res = await setStatus(order._id, customer.token, 'Cancelled');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Cancelled');
  });

  it('does not let another customer cancel it', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3) });

    expect((await setStatus(order._id, intruder.token, 'Cancelled')).status).toBe(403);
    expect((await Order.findById(order._id)).status).toBe('Scheduled');
  });
});

describe('releasing scheduled orders', () => {
  const justAfterStart = (order) => new Date(new Date(order.releaseAt).getTime() + MINUTE);

  it('leaves an order alone until its start time', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3) });

    expect(await releaseDueOrders()).toEqual({ released: 0, cancelled: 0 });
    expect((await Order.findById(order._id)).status).toBe('Scheduled');
  });

  it('hands it to the kitchen when it is time to start', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3) });

    expect(await releaseDueOrders({ now: justAfterStart(order) })).toEqual({ released: 1, cancelled: 0 });

    const saved = await Order.findById(order._id);
    expect(saved.status).toBe('Placed');
    expect(saved.statusHistory.map((h) => h.status)).toEqual(['Scheduled', 'Placed']);
  });

  it('releases each order once, even when two runs overlap', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3) });
    const now = justAfterStart(order);

    const [first, second] = await Promise.all([releaseDueOrders({ now }), releaseDueOrders({ now })]);

    expect(first.released + second.released).toBe(1);
    const saved = await Order.findById(order._id);
    expect(saved.statusHistory.filter((h) => h.status === 'Placed')).toHaveLength(1);
  });

  it('is an ordinary order for the kitchen once released', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3) });
    await releaseDueOrders({ now: justAfterStart(order) });

    expect((await setStatus(order._id, owner.token, 'Accepted')).status).toBe(200);
  });

  it('cancels and refunds it if the kitchen has closed by then', async () => {
    const { body: order } = await place({ scheduledFor: inHours(3), paymentMethod: 'mock-card' });
    await Restaurant.updateOne({ _id: restaurant._id }, { isOpen: false });

    expect(await releaseDueOrders({ now: justAfterStart(order) })).toEqual({ released: 0, cancelled: 1 });

    const saved = await Order.findById(order._id);
    expect(saved.status).toBe('Cancelled');
    expect(saved.cancellationReason).toBe(CLOSED_AT_RELEASE_REASON);
    expect(saved.paymentStatus).toBe('refunded');
  });
});
