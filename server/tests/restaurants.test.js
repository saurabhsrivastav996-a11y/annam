import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import FoodItem from '../src/models/FoodItem.js';
import Reel from '../src/models/Reel.js';
import Order from '../src/models/Order.js';
import Restaurant from '../src/models/Restaurant.js';

jest.setTimeout(60000);

let owner, stranger, customer, restaurant, items;

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

beforeEach(async () => {
  owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
  stranger = await makeUser({ email: 'stranger@test.dev', role: 'restaurant' });
  customer = await makeUser({ email: 'customer@test.dev', role: 'customer' });
  ({ restaurant, items } = await makeRestaurantWithMenu(owner.user._id));
});

describe('browsing restaurants', () => {
  it('is public and includes the menu on the detail route', async () => {
    const list = await request(app).get('/api/restaurants');
    const detail = await request(app).get(`/api/restaurants/${restaurant._id}`);

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(detail.body.menu).toHaveLength(items.length);
    expect(detail.body.reels).toEqual([]);
  });

  it('filters by search term', async () => {
    const hit = await request(app).get('/api/restaurants?search=Test Kitchen');
    const miss = await request(app).get('/api/restaurants?search=nonexistent');

    expect(hit.body).toHaveLength(1);
    expect(miss.body).toHaveLength(0);
  });

  it('treats a search term with regex characters as literal text', async () => {
    const res = await request(app).get('/api/restaurants?search=.*');
    expect(res.body).toHaveLength(0);
  });

  it('404s for an unknown id and 400s for a malformed one', async () => {
    const missing = await request(app).get('/api/restaurants/000000000000000000000000');
    const malformed = await request(app).get('/api/restaurants/not-an-id');

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});

describe('menu management', () => {
  it('lets the owner add an item', async () => {
    const res = await request(app)
      .post(`/api/restaurants/${restaurant._id}/menu`)
      .set(auth(owner.token))
      .send({ name: 'Paneer Tikka', price: 250, category: 'veg' });

    expect(res.status).toBe(201);
    expect(res.body.restaurantId).toBe(restaurant._id.toString());
  });

  it('refuses a non-owner restaurant account', async () => {
    const res = await request(app)
      .post(`/api/restaurants/${restaurant._id}/menu`)
      .set(auth(stranger.token))
      .send({ name: 'Sneaky', price: 1 });

    expect(res.status).toBe(403);
  });

  it('refuses a customer entirely', async () => {
    const res = await request(app)
      .post(`/api/restaurants/${restaurant._id}/menu`)
      .set(auth(customer.token))
      .send({ name: 'Nope', price: 1 });

    expect(res.status).toBe(403);
  });

  it('validates name and price', async () => {
    const res = await request(app)
      .post(`/api/restaurants/${restaurant._id}/menu`)
      .set(auth(owner.token))
      .send({ name: '', price: -5 });

    expect(res.status).toBe(400);
  });

  it('deletes the menu and reels when the restaurant is deleted', async () => {
    await Reel.create({ restaurantId: restaurant._id, title: 'Clip', videoUrl: '/x.mp4' });

    const res = await request(app).delete(`/api/restaurants/${restaurant._id}`).set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(await FoodItem.countDocuments({ restaurantId: restaurant._id })).toBe(0);
    expect(await Reel.countDocuments({ restaurantId: restaurant._id })).toBe(0);
  });
});

describe('distance and ETA', () => {
  // makeRestaurantWithMenu leaves the default location: Bengaluru city centre.
  const CITY_CENTRE = { lat: 12.9716, lng: 77.5946 };
  const FAR_SIDE = { lat: 13.0359, lng: 77.5970 }; // ~7 km north

  it('omits distance when the caller shares no location', async () => {
    const res = await request(app).get('/api/restaurants');

    expect(res.body[0].distanceKm).toBeUndefined();
    expect(res.body[0].etaMinutes).toBeUndefined();
  });

  it('quotes distance and a delivery estimate from the caller', async () => {
    const res = await request(app).get(
      `/api/restaurants?lat=${CITY_CENTRE.lat}&lng=${CITY_CENTRE.lng}`
    );

    expect(res.body).toHaveLength(1);
    expect(res.body[0].distanceKm).toBeGreaterThanOrEqual(0);
    expect(res.body[0].distanceKm).toBeLessThan(1);
    expect(res.body[0].etaMinutes).toBeGreaterThan(0);
  });

  it('reads further away from further away', async () => {
    const near = await request(app).get(
      `/api/restaurants?lat=${CITY_CENTRE.lat}&lng=${CITY_CENTRE.lng}`
    );
    const far = await request(app).get(`/api/restaurants?lat=${FAR_SIDE.lat}&lng=${FAR_SIDE.lng}`);

    expect(far.body[0].distanceKm).toBeGreaterThan(near.body[0].distanceKm);
    expect(far.body[0].etaMinutes).toBeGreaterThan(near.body[0].etaMinutes);
  });

  it('sorts nearest first', async () => {
    const owner2 = await makeUser({ email: 'far-owner@test.dev', role: 'restaurant' });
    await Restaurant.create({
      ownerUserId: owner2.user._id,
      name: 'Far Kitchen',
      address: 'Far away',
      location: { type: 'Point', coordinates: [FAR_SIDE.lng, FAR_SIDE.lat] },
    });

    const res = await request(app).get(
      `/api/restaurants?lat=${CITY_CENTRE.lat}&lng=${CITY_CENTRE.lng}&radius=50000`
    );

    expect(res.body.map((r) => r.name)).toEqual(['Test Kitchen', 'Far Kitchen']);
    expect(res.body[0].distanceKm).toBeLessThan(res.body[1].distanceKm);
  });

  it('excludes anything beyond the radius', async () => {
    const res = await request(app).get(
      `/api/restaurants?lat=${FAR_SIDE.lat}&lng=${FAR_SIDE.lng}&radius=1000`
    );

    expect(res.body).toHaveLength(0);
  });

  it('still applies the category filter while sorting by distance', async () => {
    const res = await request(app).get(
      `/api/restaurants?lat=${CITY_CENTRE.lat}&lng=${CITY_CENTRE.lng}&category=non-veg`
    );

    // The seeded test restaurant defaults to 'both', which counts as a match.
    expect(res.body).toHaveLength(1);
    expect(res.body[0].distanceKm).toEqual(expect.any(Number));
  });

  it('adds distance to the detail route only when asked', async () => {
    const plain = await request(app).get(`/api/restaurants/${restaurant._id}`);
    const located = await request(app).get(
      `/api/restaurants/${restaurant._id}?lat=${FAR_SIDE.lat}&lng=${FAR_SIDE.lng}`
    );

    expect(plain.body.distanceKm).toBeUndefined();
    expect(located.body.distanceKm).toBeGreaterThan(1);
    // The menu is still there alongside the estimate.
    expect(located.body.menu).toHaveLength(items.length);
  });
});

describe('kitchen transparency', () => {
  it('resolves a saved YouTube link into an embed for the client', async () => {
    await request(app)
      .put(`/api/restaurants/${restaurant._id}`)
      .set(auth(owner.token))
      .send({ isTransparentKitchen: true, kitchenStreamUrl: 'https://youtu.be/dQw4w9WgXcQ' });

    const res = await request(app).get(`/api/restaurants/${restaurant._id}`);

    expect(res.body.kitchenStream).toMatchObject({
      kind: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
    });
  });

  it('rejects a link it could never play', async () => {
    const res = await request(app)
      .put(`/api/restaurants/${restaurant._id}`)
      .set(auth(owner.token))
      .send({ isTransparentKitchen: true, kitchenStreamUrl: 'https://example.com/not-a-stream' });

    expect(res.status).toBe(400);
  });

  it('allows transparency with no stream link yet', async () => {
    const res = await request(app)
      .put(`/api/restaurants/${restaurant._id}`)
      .set(auth(owner.token))
      .send({ isTransparentKitchen: true, kitchenStreamUrl: '' });

    expect(res.status).toBe(200);
    const detail = await request(app).get(`/api/restaurants/${restaurant._id}`);
    expect(detail.body.kitchenStream).toBeNull();
  });

  it('reports no stream while transparency is switched off', async () => {
    await request(app)
      .put(`/api/restaurants/${restaurant._id}`)
      .set(auth(owner.token))
      .send({ isTransparentKitchen: false, kitchenStreamUrl: 'https://youtu.be/dQw4w9WgXcQ' });

    const res = await request(app).get(`/api/restaurants/${restaurant._id}`);
    expect(res.body.kitchenStream).toBeNull();
  });
});

describe('reviews', () => {
  /** Rates a delivered order, which is the only way a review can exist. */
  async function leaveReview({ rating, review, name = 'Sneha Kulkarni', email }) {
    const reviewer = await makeUser({ email, role: 'customer', name });

    const order = await Order.create({
      customerId: reviewer.user._id,
      restaurantId: restaurant._id,
      items: [{ foodId: items[0]._id, name: items[0].name, price: items[0].price, qty: 1 }],
      subtotal: items[0].price,
      deliveryFee: 30,
      total: items[0].price + 30,
      status: 'Delivered',
      deliveryAddress: '12 Test Street',
    });

    return request(app)
      .post(`/api/orders/${order._id}/rate`)
      .set(auth(reviewer.token))
      .send({ rating, ...(review === undefined ? {} : { review }) });
  }

  it('is empty before anyone rates', async () => {
    const res = await request(app).get(`/api/restaurants/${restaurant._id}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, average: 0, reviews: [] });
  });

  it('returns the review with a star breakdown and average', async () => {
    await leaveReview({ rating: 5, review: 'Excellent butter chicken', email: 'a@test.dev' });
    await leaveReview({ rating: 4, review: 'Good, slightly cold', email: 'b@test.dev' });

    const res = await request(app).get(`/api/restaurants/${restaurant._id}/reviews`);

    expect(res.body.total).toBe(2);
    expect(res.body.average).toBe(4.5);
    expect(res.body.counts).toMatchObject({ 5: 1, 4: 1, 3: 0 });
    expect(res.body.reviews.map((r) => r.review)).toEqual(
      expect.arrayContaining(['Excellent butter chicken', 'Good, slightly cold'])
    );
  });

  it('publishes only a first name and last initial', async () => {
    await leaveReview({ rating: 5, review: 'Lovely', name: 'Sneha Kulkarni', email: 'sneha@test.dev' });

    const res = await request(app).get(`/api/restaurants/${restaurant._id}/reviews`);

    expect(res.body.reviews[0].author).toBe('Sneha K.');
    // The full surname must not leak anywhere in the payload.
    expect(JSON.stringify(res.body)).not.toContain('Kulkarni');
    expect(JSON.stringify(res.body)).not.toContain('sneha@test.dev');
  });

  it('counts a star-only rating but returns no review text', async () => {
    await leaveReview({ rating: 3, email: 'c@test.dev' });

    const res = await request(app).get(`/api/restaurants/${restaurant._id}/reviews`);

    expect(res.body.total).toBe(1);
    expect(res.body.reviews[0].review).toBe('');
  });

  it('names the dishes the review is about', async () => {
    await leaveReview({ rating: 5, review: 'Great', email: 'd@test.dev' });

    const res = await request(app).get(`/api/restaurants/${restaurant._id}/reviews`);
    expect(res.body.reviews[0].dishes).toEqual([items[0].name]);
  });

  it('rejects a review longer than 500 characters', async () => {
    const res = await leaveReview({ rating: 5, review: 'x'.repeat(501), email: 'e@test.dev' });
    expect(res.status).toBe(400);
  });

  it('ignores ratings left for other restaurants', async () => {
    const stranger2 = await makeUser({ email: 'other-owner@test.dev', role: 'restaurant' });
    const elsewhere = await makeRestaurantWithMenu(stranger2.user._id);
    await leaveReview({ rating: 5, review: 'Here', email: 'f@test.dev' });

    const res = await request(app).get(`/api/restaurants/${elsewhere.restaurant._id}/reviews`);
    expect(res.body.total).toBe(0);
  });

  it('404s for a restaurant that does not exist', async () => {
    const res = await request(app).get('/api/restaurants/000000000000000000000000/reviews');
    expect(res.status).toBe(404);
  });
});

describe('one restaurant per owner', () => {
  it('refuses a second profile', async () => {
    const res = await request(app)
      .post('/api/restaurants')
      .set(auth(owner.token))
      .send({ name: 'Second Kitchen', address: '2 Test Road' });

    expect(res.status).toBe(409);
  });

  it('returns null from /mine when the owner has none yet', async () => {
    const res = await request(app).get('/api/restaurants/mine').set(auth(stranger.token));

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe('reels', () => {
  it('requires a video source', async () => {
    const res = await request(app).post('/api/reels').set(auth(owner.token)).field('title', 'No video');
    expect(res.status).toBe(400);
  });

  it('publishes a reel from a URL and lists it publicly', async () => {
    const created = await request(app)
      .post('/api/reels')
      .set(auth(owner.token))
      .field('title', 'Making dal')
      .field('videoUrl', '/seed-media/reels/butter-chicken.mp4');

    const list = await request(app).get('/api/reels');

    expect(created.status).toBe(201);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].restaurantId.name).toBe('Test Kitchen');
  });

  it('does not let another restaurant delete it', async () => {
    const reel = await Reel.create({ restaurantId: restaurant._id, title: 'Clip', videoUrl: '/x.mp4' });
    const res = await request(app).delete(`/api/reels/${reel._id}`).set(auth(stranger.token));

    expect(res.status).toBe(403);
  });
});

describe('admin', () => {
  it('refuses non-admin callers', async () => {
    const res = await request(app).get('/api/admin/stats').set(auth(customer.token));
    expect(res.status).toBe(403);
  });

  it('reports platform counts to an admin', async () => {
    const admin = await makeUser({ email: 'admin@test.dev', role: 'admin' });
    const res = await request(app).get('/api/admin/stats').set(auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ restaurants: 1, orders: 0 });
    expect(res.body.usersByRole.restaurant).toBe(2);
  });

  it('suspends a user and blocks their next login', async () => {
    const admin = await makeUser({ email: 'admin@test.dev', role: 'admin' });

    await request(app)
      .put(`/api/admin/users/${customer.user._id}/suspend`)
      .set(auth(admin.token))
      .send({ isSuspended: true });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@test.dev', password: 'Test@123' });

    expect(login.status).toBe(403);
  });

  it('will not suspend another admin', async () => {
    const admin = await makeUser({ email: 'admin@test.dev', role: 'admin' });
    const victim = await makeUser({ email: 'admin2@test.dev', role: 'admin' });

    const res = await request(app)
      .put(`/api/admin/users/${victim.user._id}/suspend`)
      .set(auth(admin.token))
      .send({ isSuspended: true });

    expect(res.status).toBe(403);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual(expect.any(String));
  });
});
