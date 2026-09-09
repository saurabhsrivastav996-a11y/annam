import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import FoodItem from '../src/models/FoodItem.js';
import Reel from '../src/models/Reel.js';

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
