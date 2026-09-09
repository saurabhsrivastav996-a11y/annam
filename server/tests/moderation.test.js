import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import Reel from '../src/models/Reel.js';
import Order from '../src/models/Order.js';
import Report from '../src/models/Report.js';

jest.setTimeout(60000);

let admin, owner, reporter, other, restaurant, items, reel;

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

beforeEach(async () => {
  admin = await makeUser({ email: 'admin@test.dev', role: 'admin' });
  owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
  reporter = await makeUser({ email: 'reporter@test.dev', role: 'customer' });
  other = await makeUser({ email: 'other@test.dev', role: 'customer' });
  ({ restaurant, items } = await makeRestaurantWithMenu(owner.user._id));

  reel = await Reel.create({
    restaurantId: restaurant._id,
    title: 'Questionable clip',
    videoUrl: '/seed-media/reels/x.mp4',
  });
});

const report = (token, body) => request(app).post('/api/reports').set(auth(token)).send(body);

/** A delivered, reviewed order — the thing a review report points at. */
async function reviewedOrder(text = 'Terrible, avoid') {
  return Order.create({
    customerId: other.user._id,
    restaurantId: restaurant._id,
    items: [{ foodId: items[0]._id, name: items[0].name, price: items[0].price, qty: 1 }],
    subtotal: items[0].price,
    total: items[0].price + 30,
    status: 'Delivered',
    deliveryAddress: '12 Test Street',
    rating: 1,
    review: text,
  });
}

describe('reporting content', () => {
  it('accepts a report from any signed-in user', async () => {
    const res = await report(reporter.token, {
      targetType: 'reel',
      targetId: String(reel._id),
      reason: 'inappropriate',
      note: 'Not food at all',
    });

    expect(res.status).toBe(201);
    expect(await Report.countDocuments()).toBe(1);
  });

  it('refuses an anonymous report', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ targetType: 'reel', targetId: String(reel._id) });

    expect(res.status).toBe(401);
  });

  it('counts one report per person however many times they file it', async () => {
    const body = { targetType: 'reel', targetId: String(reel._id), reason: 'spam' };

    const first = await report(reporter.token, body);
    const second = await report(reporter.token, body);

    expect(first.status).toBe(201);
    // Repeat reporting is not an error, it just does not stack.
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('already-reported');
    expect(await Report.countDocuments()).toBe(1);
  });

  it('lets separate people pile onto the same item', async () => {
    const body = { targetType: 'reel', targetId: String(reel._id), reason: 'offensive' };

    await report(reporter.token, body);
    await report(other.token, body);

    expect(await Report.countDocuments()).toBe(2);
  });

  it('rejects an unknown target type and a missing target', async () => {
    const badType = await report(reporter.token, { targetType: 'restaurant', targetId: String(reel._id) });
    const missing = await report(reporter.token, {
      targetType: 'reel',
      targetId: '000000000000000000000000',
    });

    expect(badType.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe('the moderation queue', () => {
  it('is closed to non-admins', async () => {
    const res = await request(app).get('/api/reports').set(auth(reporter.token));
    expect(res.status).toBe(403);
  });

  it('groups by item and counts the separate complainants', async () => {
    const body = { targetType: 'reel', targetId: String(reel._id), reason: 'spam' };
    await report(reporter.token, body);
    await report(other.token, { ...body, reason: 'offensive' });

    const res = await request(app).get('/api/reports').set(auth(admin.token));

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].reportCount).toBe(2);
    expect(res.body.items[0].reasons).toEqual(expect.arrayContaining(['spam', 'offensive']));
    // The admin can see what was actually reported.
    expect(res.body.items[0].content.title).toBe('Questionable clip');
  });

  it('busiest item first', async () => {
    const second = await Reel.create({
      restaurantId: restaurant._id,
      title: 'Only mildly odd',
      videoUrl: '/x.mp4',
    });

    await report(reporter.token, { targetType: 'reel', targetId: String(second._id) });
    await report(reporter.token, { targetType: 'reel', targetId: String(reel._id) });
    await report(other.token, { targetType: 'reel', targetId: String(reel._id) });

    const res = await request(app).get('/api/reports').set(auth(admin.token));
    expect(res.body.items[0].content.title).toBe('Questionable clip');
  });
});

describe('acting on a report', () => {
  const resolve = (body) =>
    request(app).put('/api/reports/resolve').set(auth(admin.token)).send(body);

  it('hides a reel and clears its reports', async () => {
    await report(reporter.token, { targetType: 'reel', targetId: String(reel._id) });

    const res = await resolve({ targetType: 'reel', targetId: String(reel._id), action: 'hide' });

    expect(res.body.hidden).toBe(true);
    expect(res.body.reportsResolved).toBe(1);
    expect((await Reel.findById(reel._id)).isFlagged).toBe(true);
    expect(await Report.countDocuments({ status: 'open' })).toBe(0);
  });

  it('a hidden reel disappears from the public feed', async () => {
    await report(reporter.token, { targetType: 'reel', targetId: String(reel._id) });
    await resolve({ targetType: 'reel', targetId: String(reel._id), action: 'hide' });

    const feed = await request(app).get('/api/reels');
    expect(feed.body.items.map((r) => r.title)).not.toContain('Questionable clip');
  });

  it('dismissing leaves the content up but clears the queue', async () => {
    await report(reporter.token, { targetType: 'reel', targetId: String(reel._id) });

    const res = await resolve({
      targetType: 'reel',
      targetId: String(reel._id),
      action: 'dismiss',
      resolution: 'Looked fine to me',
    });

    expect(res.body.hidden).toBe(false);
    expect((await Reel.findById(reel._id)).isFlagged).toBe(false);
    expect(await Report.countDocuments({ status: 'dismissed' })).toBe(1);
    expect(await Report.countDocuments({ status: 'open' })).toBe(0);
  });

  it('restores something hidden by mistake', async () => {
    await report(reporter.token, { targetType: 'reel', targetId: String(reel._id) });
    await resolve({ targetType: 'reel', targetId: String(reel._id), action: 'hide' });
    await resolve({ targetType: 'reel', targetId: String(reel._id), action: 'restore' });

    expect((await Reel.findById(reel._id)).isFlagged).toBe(false);
  });

  it('hides a review without losing its rating', async () => {
    const order = await reviewedOrder();
    await report(reporter.token, { targetType: 'review', targetId: String(order._id) });

    await resolve({ targetType: 'review', targetId: String(order._id), action: 'hide' });

    const res = await request(app).get(`/api/restaurants/${restaurant._id}/reviews`);
    // The words are gone from the list...
    expect(res.body.reviews.map((r) => r.review)).not.toContain('Terrible, avoid');
    // ...but the score still counts towards the average.
    expect(res.body.total).toBe(1);
  });

  it('rejects an unknown action', async () => {
    const res = await resolve({ targetType: 'reel', targetId: String(reel._id), action: 'nuke' });
    expect(res.status).toBe(400);
  });

  it('reports a summary for the dashboard', async () => {
    await report(reporter.token, { targetType: 'reel', targetId: String(reel._id) });
    const res = await request(app).get('/api/reports/summary').set(auth(admin.token));

    expect(res.body).toMatchObject({ open: 1, actioned: 0, dismissed: 0 });
  });
});
