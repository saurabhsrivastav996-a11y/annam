import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import Order from '../src/models/Order.js';

jest.setTimeout(60000);

let customer, owner, courier, other, restaurant, items;

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

beforeEach(async () => {
  customer = await makeUser({ email: 'customer@test.dev', role: 'customer' });
  owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
  courier = await makeUser({ email: 'courier@test.dev', role: 'delivery' });
  other = await makeUser({ email: 'other@test.dev', role: 'volunteer' });
  ({ restaurant, items } = await makeRestaurantWithMenu(owner.user._id));
});

const placeOrder = (body = {}) =>
  request(app)
    .post('/api/orders')
    .set(auth(customer.token))
    .send({
      restaurantId: restaurant._id.toString(),
      items: [{ foodId: items[0]._id.toString(), qty: 2 }],
      deliveryAddress: '12 Test Street',
      ...body,
    });

/** Walks an order to Ready, which is where a courier can claim it. */
async function orderReadyForPickup() {
  const { body: order } = await placeOrder();
  for (const status of ['Accepted', 'Preparing', 'Ready']) {
    await request(app).put(`/api/orders/${order._id}/status`).set(auth(owner.token)).send({ status });
  }
  return order;
}

describe('creating an order', () => {
  it('prices the order from the database', async () => {
    const res = await placeOrder();

    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBe(items[0].price * 2);
    expect(res.body.total).toBe(items[0].price * 2 + res.body.deliveryFee);
    expect(res.body.status).toBe('Placed');
  });

  it('ignores prices supplied by the client', async () => {
    const res = await placeOrder({ items: [{ foodId: items[0]._id.toString(), qty: 1, price: 1 }] });

    expect(res.body.subtotal).toBe(items[0].price);
  });

  it('rejects an item from another restaurant', async () => {
    const stranger = await makeUser({ email: 'stranger@test.dev', role: 'restaurant' });
    const outside = await makeRestaurantWithMenu(stranger.user._id);

    const res = await placeOrder({ items: [{ foodId: outside.items[0]._id.toString(), qty: 1 }] });
    expect(res.status).toBe(400);
  });

  it('requires an address and at least one item', async () => {
    const noItems = await placeOrder({ items: [] });
    const noAddress = await placeOrder({ deliveryAddress: '' });

    expect(noItems.status).toBe(400);
    expect(noAddress.status).toBe(400);
  });

  it('does not let a delivery partner place orders', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(auth(courier.token))
      .send({
        restaurantId: restaurant._id.toString(),
        items: [{ foodId: items[0]._id.toString(), qty: 1 }],
        deliveryAddress: '12 Test Street',
      });

    expect(res.status).toBe(403);
  });
});

describe('order status transitions', () => {
  it('rejects a skipped step', async () => {
    const { body: order } = await placeOrder();
    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(owner.token))
      .send({ status: 'Ready' });

    expect(res.status).toBe(400);
  });

  it('does not let the customer accept their own order', async () => {
    const { body: order } = await placeOrder();
    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(customer.token))
      .send({ status: 'Accepted' });

    expect(res.status).toBe(403);
  });

  it('does not let another restaurant move the order', async () => {
    const stranger = await makeUser({ email: 'stranger2@test.dev', role: 'restaurant' });
    await makeRestaurantWithMenu(stranger.user._id);
    const { body: order } = await placeOrder();

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(stranger.token))
      .send({ status: 'Accepted' });

    expect(res.status).toBe(403);
  });

  it('records each step in the status history', async () => {
    const order = await orderReadyForPickup();
    const saved = await Order.findById(order._id);

    expect(saved.statusHistory.map((h) => h.status)).toEqual([
      'Placed', 'Accepted', 'Preparing', 'Ready',
    ]);
  });
});

describe('pickup and delivery', () => {
  it('lets one courier claim a ready order and refuses a second', async () => {
    const order = await orderReadyForPickup();
    const second = await makeUser({ email: 'courier2@test.dev', role: 'delivery' });

    const first = await request(app).put(`/api/orders/${order._id}/accept`).set(auth(courier.token));
    const clash = await request(app).put(`/api/orders/${order._id}/accept`).set(auth(second.token));

    expect(first.status).toBe(200);
    expect(clash.status).toBe(409);
  });

  it('requires the correct pickup OTP', async () => {
    const order = await orderReadyForPickup();
    await request(app).put(`/api/orders/${order._id}/accept`).set(auth(courier.token));

    const { body: otpBody } = await request(app).get(`/api/orders/${order._id}/otp`).set(auth(customer.token));

    const wrong = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(courier.token))
      .send({ status: 'OutForDelivery', otp: '0000' });
    const right = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(courier.token))
      .send({ status: 'OutForDelivery', otp: otpBody.otp });

    expect(otpBody.otp).toMatch(/^\d{4}$/);
    expect(wrong.status).toBe(400);
    expect(right.status).toBe(200);
  });

  it('does not leak the OTP to unrelated users', async () => {
    const order = await orderReadyForPickup();
    const res = await request(app).get(`/api/orders/${order._id}/otp`).set(auth(other.token));

    expect(res.status).toBe(403);
  });

  it('marks payment paid on delivery', async () => {
    const order = await orderReadyForPickup();
    await request(app).put(`/api/orders/${order._id}/accept`).set(auth(courier.token));
    const { body: otpBody } = await request(app).get(`/api/orders/${order._id}/otp`).set(auth(customer.token));
    await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(courier.token))
      .send({ status: 'OutForDelivery', otp: otpBody.otp });

    const res = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(courier.token))
      .send({ status: 'Delivered' });

    expect(res.body.status).toBe('Delivered');
    expect(res.body.paymentStatus).toBe('paid');
  });
});

describe('rating a delivered order', () => {
  /** Walks a fresh order all the way to Delivered. */
  async function deliveredOrder() {
    const order = await orderReadyForPickup();
    await request(app).put(`/api/orders/${order._id}/accept`).set(auth(courier.token));
    const { body: otpBody } = await request(app).get(`/api/orders/${order._id}/otp`).set(auth(customer.token));
    await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(courier.token))
      .send({ status: 'OutForDelivery', otp: otpBody.otp });
    await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(auth(courier.token))
      .send({ status: 'Delivered' });
    return order;
  }

  it('stores the review and returns a populated order', async () => {
    const order = await deliveredOrder();

    const res = await request(app)
      .post(`/api/orders/${order._id}/rate`)
      .set(auth(customer.token))
      .send({ rating: 4, review: '  Hot and on time.  ' });

    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(4);
    // Trimmed on the way in.
    expect(res.body.review).toBe('Hot and on time.');
    // Populated, so the page that just submitted keeps its restaurant name.
    expect(res.body.restaurantId.name).toEqual(expect.any(String));
  });

  it('accepts a rating with no review text', async () => {
    const order = await deliveredOrder();

    const res = await request(app)
      .post(`/api/orders/${order._id}/rate`)
      .set(auth(customer.token))
      .send({ rating: 5 });

    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(5);
  });

  it('refuses a review over 500 characters', async () => {
    const order = await deliveredOrder();

    const res = await request(app)
      .post(`/api/orders/${order._id}/rate`)
      .set(auth(customer.token))
      .send({ rating: 5, review: 'x'.repeat(501) });

    expect(res.status).toBe(400);
  });

  it('refuses to rate an order that is not delivered', async () => {
    const { body: order } = await placeOrder();

    const res = await request(app)
      .post(`/api/orders/${order._id}/rate`)
      .set(auth(customer.token))
      .send({ rating: 5 });

    expect(res.status).toBe(400);
  });
});

describe('reading orders', () => {
  it('hides an order from unrelated users', async () => {
    const { body: order } = await placeOrder();
    const res = await request(app).get(`/api/orders/${order._id}`).set(auth(other.token));

    expect(res.status).toBe(403);
  });

  it('scopes the list to the caller', async () => {
    await placeOrder();

    const asCustomer = await request(app).get('/api/orders').set(auth(customer.token));
    const asOther = await request(app).get('/api/orders').set(auth(other.token));

    expect(asCustomer.body).toHaveLength(1);
    expect(asOther.body).toHaveLength(0);
  });
});
