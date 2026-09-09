import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import Payment from '../src/models/Payment.js';
import Order from '../src/models/Order.js';

jest.setTimeout(60000);

// Matches the key set in tests/env.js, so signatures here are the ones the
// server will compute. These are fake values, not real credentials.
const KEY_SECRET = 'test_key_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';

const sign = (orderId, paymentId) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

let customer, owner, other, restaurant, items;

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

beforeEach(async () => {
  customer = await makeUser({ email: 'customer@test.dev', role: 'customer' });
  owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
  other = await makeUser({ email: 'other@test.dev', role: 'customer' });
  ({ restaurant, items } = await makeRestaurantWithMenu(owner.user._id));
});

/**
 * Creates the payment intent directly. Opening a real Razorpay order needs the
 * live API, so these tests start from the state that call would leave behind
 * and exercise everything after it — which is where the security lives.
 */
async function pendingPayment(overrides = {}) {
  const priced = [{ foodId: items[0]._id, name: items[0].name, price: items[0].price, qty: 2 }];
  const subtotal = items[0].price * 2;

  return Payment.create({
    customerId: customer.user._id,
    restaurantId: restaurant._id,
    items: priced,
    subtotal,
    deliveryFee: 30,
    amount: subtotal + 30,
    deliveryAddress: '12 Test Street',
    razorpayOrderId: `order_${crypto.randomBytes(6).toString('hex')}`,
    ...overrides,
  });
}

describe('GET /api/payments/config', () => {
  it('reports online payment as available with keys present', async () => {
    const res = await request(app).get('/api/payments/config');

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.keyId).toBe('rzp_test_fake_key_id');
  });

  it('never exposes the key secret', async () => {
    const res = await request(app).get('/api/payments/config');
    expect(JSON.stringify(res.body)).not.toContain(KEY_SECRET);
  });
});

describe('POST /api/payments/verify', () => {
  it('creates a paid order for a correctly signed payment', async () => {
    const payment = await pendingPayment();
    const paymentId = 'pay_test_123';

    const res = await request(app)
      .post('/api/payments/verify')
      .set(auth(customer.token))
      .send({
        razorpay_order_id: payment.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: sign(payment.razorpayOrderId, paymentId),
      });

    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      status: 'Placed',
      total: payment.amount,
    });

    const saved = await Payment.findById(payment._id);
    expect(saved.status).toBe('paid');
    expect(saved.orderId).not.toBeNull();
  });

  it('refuses a forged signature and creates no order', async () => {
    const payment = await pendingPayment();

    const res = await request(app)
      .post('/api/payments/verify')
      .set(auth(customer.token))
      .send({
        razorpay_order_id: payment.razorpayOrderId,
        razorpay_payment_id: 'pay_test_123',
        razorpay_signature: 'a'.repeat(64),
      });

    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);

    const saved = await Payment.findById(payment._id);
    expect(saved.status).toBe('failed');
  });

  it('refuses a signature computed for a different payment id', async () => {
    const payment = await pendingPayment();

    const res = await request(app)
      .post('/api/payments/verify')
      .set(auth(customer.token))
      .send({
        razorpay_order_id: payment.razorpayOrderId,
        razorpay_payment_id: 'pay_attacker',
        razorpay_signature: sign(payment.razorpayOrderId, 'pay_genuine'),
      });

    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('does not let another account claim someone else’s payment', async () => {
    const payment = await pendingPayment();
    const paymentId = 'pay_test_123';

    const res = await request(app)
      .post('/api/payments/verify')
      .set(auth(other.token))
      .send({
        razorpay_order_id: payment.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: sign(payment.razorpayOrderId, paymentId),
      });

    expect(res.status).toBe(403);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('is idempotent — a replayed callback does not place a second order', async () => {
    const payment = await pendingPayment();
    const paymentId = 'pay_test_123';
    const body = {
      razorpay_order_id: payment.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sign(payment.razorpayOrderId, paymentId),
    };

    const first = await request(app).post('/api/payments/verify').set(auth(customer.token)).send(body);
    const second = await request(app).post('/api/payments/verify').set(auth(customer.token)).send(body);

    expect(first.body.order._id).toBe(second.body.order._id);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('404s for an unknown razorpay order', async () => {
    const res = await request(app)
      .post('/api/payments/verify')
      .set(auth(customer.token))
      .send({
        razorpay_order_id: 'order_does_not_exist',
        razorpay_payment_id: 'pay_x',
        razorpay_signature: sign('order_does_not_exist', 'pay_x'),
      });

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/payments/verify').send({
      razorpay_order_id: 'order_x',
      razorpay_payment_id: 'pay_x',
      razorpay_signature: 'x',
    });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/payments/checkout', () => {
  it('rejects a basket with no items', async () => {
    const res = await request(app)
      .post('/api/payments/checkout')
      .set(auth(customer.token))
      .send({ restaurantId: restaurant._id.toString(), items: [], deliveryAddress: 'x' });

    expect(res.status).toBe(400);
  });

  it('is closed to restaurant accounts', async () => {
    const res = await request(app)
      .post('/api/payments/checkout')
      .set(auth(owner.token))
      .send({
        restaurantId: restaurant._id.toString(),
        items: [{ foodId: items[0]._id.toString(), qty: 1 }],
        deliveryAddress: '12 Test Street',
      });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/payments/abandon', () => {
  it('marks an unpaid attempt failed', async () => {
    const payment = await pendingPayment();

    const res = await request(app)
      .post('/api/payments/abandon')
      .set(auth(customer.token))
      .send({ razorpay_order_id: payment.razorpayOrderId, reason: 'Closed the payment window' });

    expect(res.body.status).toBe('failed');
  });

  it('cannot walk back a payment that already succeeded', async () => {
    const payment = await pendingPayment({ status: 'paid' });

    const res = await request(app)
      .post('/api/payments/abandon')
      .set(auth(customer.token))
      .send({ razorpay_order_id: payment.razorpayOrderId });

    expect(res.body.status).toBe('paid');
  });
});

describe('POST /api/payments/webhook', () => {
  // Send the exact JSON text. Handing supertest a Buffer makes it serialise the
  // Buffer itself, which is not the payload Razorpay would sign.
  const send = (raw, signature) =>
    request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature ?? '')
      .send(raw);

  const webhookSign = (raw) =>
    crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

  it('fulfils an order on payment.captured', async () => {
    const payment = await pendingPayment();
    const event = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_hook_1', order_id: payment.razorpayOrderId } } },
    };

    const raw = JSON.stringify(event);
    const res = await send(raw, webhookSign(raw));

    expect(res.status).toBe(200);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Payment.findById(payment._id)).status).toBe('paid');
  });

  it('rejects an unsigned or wrongly signed event', async () => {
    const payment = await pendingPayment();
    const event = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_hook_2', order_id: payment.razorpayOrderId } } },
    };

    const raw = JSON.stringify(event);
    const unsigned = await send(raw, '');
    const wrong = await send(raw, 'b'.repeat(64));

    expect(unsigned.status).toBe(400);
    expect(wrong.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('records a failure on payment.failed without creating an order', async () => {
    const payment = await pendingPayment();
    const event = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: { id: 'pay_hook_3', order_id: payment.razorpayOrderId, error_description: 'Card declined' },
        },
      },
    };

    const raw = JSON.stringify(event);
    await send(raw, webhookSign(raw));

    const saved = await Payment.findById(payment._id);
    expect(saved.status).toBe('failed');
    expect(saved.failureReason).toBe('Card declined');
    expect(await Order.countDocuments()).toBe(0);
  });

  it('does not double-order when the webhook follows the browser callback', async () => {
    const payment = await pendingPayment();
    const paymentId = 'pay_both_paths';

    await request(app)
      .post('/api/payments/verify')
      .set(auth(customer.token))
      .send({
        razorpay_order_id: payment.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: sign(payment.razorpayOrderId, paymentId),
      });

    const event = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: payment.razorpayOrderId } } },
    };
    const raw = JSON.stringify(event);
    await send(raw, webhookSign(raw));

    expect(await Order.countDocuments()).toBe(1);
  });
});
