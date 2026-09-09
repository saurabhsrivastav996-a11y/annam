import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import User from '../src/models/User.js';

jest.setTimeout(60000);

let owner, volunteer, restaurant;

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

beforeEach(async () => {
  owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
  volunteer = await makeUser({ email: 'volunteer@test.dev', role: 'volunteer', name: 'Priya' });
  ({ restaurant } = await makeRestaurantWithMenu(owner.user._id));
});

const postDonation = (body = {}) =>
  request(app)
    .post('/api/donations')
    .set(auth(owner.token))
    .send({ description: '10 veg meals', quantity: 10, foodType: 'veg', ...body });

describe('posting donations', () => {
  it('lets a restaurant post surplus food', async () => {
    const res = await postDonation();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'Posted', quantity: 10, volunteerId: null });
    // Falls back to the restaurant's own address and coordinates.
    expect(res.body.pickupAddress).toBe(restaurant.address);
  });

  it('does not let a volunteer post one', async () => {
    const res = await request(app)
      .post('/api/donations')
      .set(auth(volunteer.token))
      .send({ description: 'x', quantity: 1 });

    expect(res.status).toBe(403);
  });

  it('validates the payload', async () => {
    const res = await postDonation({ description: '', quantity: 0 });
    expect(res.status).toBe(400);
  });
});

describe('claiming a donation', () => {
  it('assigns it to the first volunteer and refuses the second', async () => {
    const { body: donation } = await postDonation();
    const second = await makeUser({ email: 'volunteer2@test.dev', role: 'volunteer' });

    const first = await request(app).put(`/api/donations/${donation._id}/accept`).set(auth(volunteer.token));
    const clash = await request(app).put(`/api/donations/${donation._id}/accept`).set(auth(second.token));

    expect(first.status).toBe(200);
    expect(first.body.status).toBe('Accepted');
    expect(clash.status).toBe(409);
  });

  it('rejects a status jump from Accepted straight to Completed', async () => {
    const { body: donation } = await postDonation();
    await request(app).put(`/api/donations/${donation._id}/accept`).set(auth(volunteer.token));

    const res = await request(app)
      .put(`/api/donations/${donation._id}/status`)
      .set(auth(volunteer.token))
      .send({ status: 'Completed' });

    expect(res.status).toBe(400);
  });

  it('credits the volunteer once the pickup is completed', async () => {
    const { body: donation } = await postDonation({ quantity: 12 });
    await request(app).put(`/api/donations/${donation._id}/accept`).set(auth(volunteer.token));
    await request(app)
      .put(`/api/donations/${donation._id}/status`)
      .set(auth(volunteer.token))
      .send({ status: 'Collected' });
    await request(app)
      .put(`/api/donations/${donation._id}/status`)
      .set(auth(volunteer.token))
      .send({ status: 'Completed' });

    const updated = await User.findById(volunteer.user._id);
    expect(updated.stats).toMatchObject({ donationsCollected: 1, mealsServed: 12 });
  });

  it('does not let a different volunteer advance someone else’s pickup', async () => {
    const { body: donation } = await postDonation();
    const second = await makeUser({ email: 'volunteer3@test.dev', role: 'volunteer' });
    await request(app).put(`/api/donations/${donation._id}/accept`).set(auth(volunteer.token));

    const res = await request(app)
      .put(`/api/donations/${donation._id}/status`)
      .set(auth(second.token))
      .send({ status: 'Collected' });

    expect(res.status).toBe(403);
  });
});

describe('removing a donation', () => {
  it('lets the owner remove an unclaimed donation', async () => {
    const { body: donation } = await postDonation();
    const res = await request(app).delete(`/api/donations/${donation._id}`).set(auth(owner.token));

    expect(res.status).toBe(200);
  });

  it('refuses once a volunteer has claimed it', async () => {
    const { body: donation } = await postDonation();
    await request(app).put(`/api/donations/${donation._id}/accept`).set(auth(volunteer.token));

    const res = await request(app).delete(`/api/donations/${donation._id}`).set(auth(owner.token));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/donations/stats', () => {
  it('counts only completed pickups as rescued meals', async () => {
    const { body: open } = await postDonation({ quantity: 5 });
    const { body: done } = await postDonation({ quantity: 7 });

    await request(app).put(`/api/donations/${done._id}/accept`).set(auth(volunteer.token));
    await request(app).put(`/api/donations/${done._id}/status`).set(auth(volunteer.token)).send({ status: 'Collected' });
    await request(app).put(`/api/donations/${done._id}/status`).set(auth(volunteer.token)).send({ status: 'Completed' });

    const res = await request(app).get('/api/donations/stats');

    expect(res.body).toMatchObject({ mealsRescued: 7, completedDonations: 1, openDonations: 1 });
    expect(open.status).toBe('Posted');
  });
});
