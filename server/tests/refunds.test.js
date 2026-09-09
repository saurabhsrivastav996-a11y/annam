import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import Order from '../src/models/Order.js';
import Payment from '../src/models/Payment.js';

jest.setTimeout(60000);

const WEBHOOK_SECRET = 'test_webhook_secret';

let customer, owner, restaurant, items;

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

beforeEach(async () => {
  customer = await makeUser({ email: 'customer@test.dev', role: 'customer' });
  owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
  ({ restaurant, items } = await makeRestaurantWithMenu(owner.user._id));
});

/** A placed order, optionally already paid by a given method. */
async function placeOrder({ paymentMethod = 'cod', paymentStatus = 'pending' } = {}) {
  const res = await request(app)
    .post('/api/orders')
    .set(auth(customer.token))
    .send({
      restaurantId: restaurant._id.toString(),
      items: [{ foodId: items[0]._id.toString(), qty: 1 }],
      deliveryAddress: '12 Test Street',
      paymentMethod,
    });

  await Order.updateOne({ _id: res.body._id }, { paymentMethod, paymentStatus });
  return res.body._id;
}

const cancel = (orderId, reason = 'Kitchen closed early') =>
  request(app)
    .put(`/api/orders/${orderId}/status`)
    .set(auth(owner.token))
    .send({ status: 'Cancelled', reason });

describe('cancelling a cash order', () => {
  it('refunds nothing, because nothing was taken', async () => {
    const orderId = await placeOrder({ paymentMethod: 'cod', paymentStatus: 'pending' });

    const res = await cancel(orderId);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Cancelled');
    expect(res.body.paymentStatus).toBe('pending');
  });

  it('records the reason the customer will see', async () => {
    const orderId = await placeOrder();
    const res = await cancel(orderId, 'Ran out of paneer');

    expect(res.body.cancellationReason).toBe('Ran out of paneer');
  });
});

describe('cancelling a paid order', () => {
  it('refunds a simulated card payment immediately', async () => {
    const orderId = await placeOrder({ paymentMethod: 'mock-card', paymentStatus: 'paid' });

    const res = await cancel(orderId);

    expect(res.body.paymentStatus).toBe('refunded');
  });

  it('records a failure rather than losing the cancellation', async () => {
    // A razorpay order with no captured payment on file: the refund cannot be
    // issued, but the order must still end up cancelled.
    const orderId = await placeOrder({ paymentMethod: 'razorpay', paymentStatus: 'paid' });

    const res = await cancel(orderId);

    expect(res.body.status).toBe('Cancelled');
    expect(res.body.paymentStatus).toBe('refund_failed');
  });

  it('leaves a delivered order alone — it cannot be cancelled at all', async () => {
    const orderId = await placeOrder({ paymentMethod: 'mock-card', paymentStatus: 'paid' });
    await Order.updateOne({ _id: orderId }, { status: 'Delivered' });

    const res = await cancel(orderId);

    expect(res.status).toBe(400);
  });
});

describe('refund webhooks', () => {
  const send = (raw, signature) =>
    request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature ?? '')
      .send(raw);

  const sign = (raw) => crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

  /** A cancelled razorpay order whose refund is in flight. */
  async function refundingOrder() {
    const orderId = await placeOrder({ paymentMethod: 'razorpay', paymentStatus: 'refunding' });
    await Payment.create({
      customerId: customer.user._id,
      restaurantId: restaurant._id,
      items: [],
      amount: 100,
      deliveryAddress: '12 Test Street',
      razorpayOrderId: `order_${crypto.randomBytes(5).toString('hex')}`,
      razorpayPaymentId: 'pay_x',
      orderId,
      status: 'refunding',
      refundId: 'rfnd_test_1',
    });
    return orderId;
  }

  it('settles the order when the refund processes', async () => {
    const orderId = await refundingOrder();
    const raw = JSON.stringify({
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_test_1' } } },
    });

    const res = await send(raw, sign(raw));

    expect(res.status).toBe(200);
    expect((await Order.findById(orderId)).paymentStatus).toBe('refunded');
    expect((await Payment.findOne({ refundId: 'rfnd_test_1' })).status).toBe('refunded');
  });

  it('flags the order when the refund fails', async () => {
    const orderId = await refundingOrder();
    const raw = JSON.stringify({
      event: 'refund.failed',
      payload: { refund: { entity: { id: 'rfnd_test_1' } } },
    });

    await send(raw, sign(raw));

    expect((await Order.findById(orderId)).paymentStatus).toBe('refund_failed');
  });

  it('ignores an unsigned refund event', async () => {
    const orderId = await refundingOrder();
    const raw = JSON.stringify({
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_test_1' } } },
    });

    const res = await send(raw, 'bad-signature');

    expect(res.status).toBe(400);
    expect((await Order.findById(orderId)).paymentStatus).toBe('refunding');
  });

  it('shrugs at a refund it has never heard of', async () => {
    const raw = JSON.stringify({
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_unknown' } } },
    });

    const res = await send(raw, sign(raw));
    expect(res.status).toBe(200);
  });
});
