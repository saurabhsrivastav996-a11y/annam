import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import Reel from '../src/models/Reel.js';
import ReelLike from '../src/models/ReelLike.js';
import { pageSize, cursorFilter, pageResult } from '../src/utils/paginate.js';

jest.setTimeout(60000);

let owner, viewer, restaurant;

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

beforeEach(async () => {
  owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
  viewer = await makeUser({ email: 'viewer@test.dev', role: 'customer' });
  ({ restaurant } = await makeRestaurantWithMenu(owner.user._id));
});

/** Reels are returned newest-first, so seed them in a known order. */
async function seedReels(count) {
  const made = [];
  for (let i = 0; i < count; i += 1) {
    made.push(
      await Reel.create({
        restaurantId: restaurant._id,
        title: `Reel ${i + 1}`,
        videoUrl: `/seed-media/reels/clip-${i}.mp4`,
      })
    );
  }
  return made;
}

describe('paginate helpers', () => {
  it('clamps the page size into a sane range', () => {
    expect(pageSize(undefined)).toBe(20);
    expect(pageSize('5')).toBe(5);
    expect(pageSize(0)).toBe(20);
    expect(pageSize(-3)).toBe(20);
    expect(pageSize('abc')).toBe(20);
    // A caller cannot ask for the whole table.
    expect(pageSize(100000)).toBe(100);
  });

  it('ignores a cursor that is not an object id', () => {
    expect(cursorFilter(undefined)).toEqual({});
    expect(cursorFilter('')).toEqual({});
    expect(cursorFilter('not-an-id')).toEqual({});
    expect(cursorFilter('64b7f2c8e1a2b3c4d5e6f7a8')).toEqual({
      _id: { $lt: '64b7f2c8e1a2b3c4d5e6f7a8' },
    });
  });

  it('uses the extra row to decide whether more pages exist', () => {
    const rows = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }];

    const full = pageResult(rows, 2);
    expect(full.items).toHaveLength(2);
    expect(full.hasMore).toBe(true);
    expect(full.nextCursor).toBe('b');

    const last = pageResult(rows.slice(0, 2), 2);
    expect(last.hasMore).toBe(false);
    expect(last.nextCursor).toBeNull();
  });

  it('handles an empty page', () => {
    expect(pageResult([], 10)).toEqual({ items: [], nextCursor: null, hasMore: false });
  });
});

describe('GET /api/reels pagination', () => {
  it('returns a page and a cursor to the next one', async () => {
    await seedReels(5);

    const first = await request(app).get('/api/reels?limit=2');

    expect(first.body.items).toHaveLength(2);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.nextCursor).toEqual(expect.any(String));
  });

  it('walks the whole collection without repeats or gaps', async () => {
    const made = await seedReels(7);

    const seen = [];
    let cursor = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const url = `/api/reels?limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const { body } = await request(app).get(url);
      seen.push(...body.items.map((r) => r.title));
      cursor = body.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(made.length);
    expect(new Set(seen).size).toBe(made.length);
    // Newest first.
    expect(seen[0]).toBe('Reel 7');
  });

  it('reports the last page honestly', async () => {
    await seedReels(2);
    const { body } = await request(app).get('/api/reels?limit=10');

    expect(body.items).toHaveLength(2);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });
});

describe('reel likes', () => {
  let reel;
  beforeEach(async () => {
    [reel] = await seedReels(1);
  });

  it('refuses an anonymous like', async () => {
    const res = await request(app).post(`/api/reels/${reel._id}/like`);

    expect(res.status).toBe(401);
    expect((await Reel.findById(reel._id)).likes).toBe(0);
  });

  it('counts one like per person, however many times they tap', async () => {
    await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));
    await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));
    const third = await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));

    // Odd number of taps: liked, unliked, liked again.
    expect(third.body).toEqual({ likes: 1, liked: true });
    expect(await ReelLike.countDocuments({ reelId: reel._id })).toBe(1);
  });

  it('unlikes on a second tap', async () => {
    const liked = await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));
    const unliked = await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));

    expect(liked.body).toEqual({ likes: 1, liked: true });
    expect(unliked.body).toEqual({ likes: 0, liked: false });
    expect(await ReelLike.countDocuments({ reelId: reel._id })).toBe(0);
  });

  it('counts different people separately', async () => {
    const second = await makeUser({ email: 'second@test.dev', role: 'customer' });

    await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));
    const res = await request(app).post(`/api/reels/${reel._id}/like`).set(auth(second.token));

    expect(res.body.likes).toBe(2);
  });

  it('never drops the count below zero', async () => {
    // Unlike something never liked.
    const res = await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));
    await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));

    expect(res.body.likes).toBeGreaterThanOrEqual(0);
    expect((await Reel.findById(reel._id)).likes).toBeGreaterThanOrEqual(0);
  });

  it('reports which reels the caller has liked', async () => {
    await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));

    const mine = await request(app).get('/api/reels/likes/mine').set(auth(viewer.token));
    expect(mine.body).toContain(String(reel._id));

    const theirs = await request(app).get('/api/reels/likes/mine').set(auth(owner.token));
    expect(theirs.body).toHaveLength(0);
  });

  it('clears likes when the reel is deleted', async () => {
    await request(app).post(`/api/reels/${reel._id}/like`).set(auth(viewer.token));
    await request(app).delete(`/api/reels/${reel._id}`).set(auth(owner.token));

    expect(await ReelLike.countDocuments({ reelId: reel._id })).toBe(0);
  });

  it('404s for a reel that does not exist', async () => {
    const res = await request(app)
      .post('/api/reels/000000000000000000000000/like')
      .set(auth(viewer.token));

    expect(res.status).toBe(404);
  });

  it('still lets anyone count a view', async () => {
    const res = await request(app).post(`/api/reels/${reel._id}/view`);

    expect(res.status).toBe(200);
    expect(res.body.views).toBe(1);
  });
});
