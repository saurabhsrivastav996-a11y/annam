import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, makeRestaurantWithMenu, auth } from './helpers.js';
import { sentInTests } from '../src/config/mailer.js';
import * as templates from '../src/emails/templates.js';

jest.setTimeout(60000);

const ORDER = {
  _id: '6aa1a57a888ecb556ef08900',
  items: [{ name: 'Butter Chicken', price: 320, qty: 2 }],
  subtotal: 640,
  deliveryFee: 30,
  total: 670,
  deliveryAddress: '12 Indiranagar 100ft Rd',
};

/** Lets a fire-and-forget notification finish before assertions run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 150));

describe('escapeHtml', () => {
  it('neutralises markup in user-supplied text', () => {
    expect(templates.escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(templates.escapeHtml(`Ram & "Sons" it's`)).toBe('Ram &amp; &quot;Sons&quot; it&#39;s');
  });

  it('renders null and undefined as empty rather than the word', () => {
    expect(templates.escapeHtml(null)).toBe('');
    expect(templates.escapeHtml(undefined)).toBe('');
  });
});

describe('templates', () => {
  it('welcome greets by name and tailors the message to the role', () => {
    const mail = templates.welcome({ name: 'Priya', role: 'volunteer' });

    expect(mail.subject).toBe('Welcome to Annam');
    expect(mail.html).toContain('Priya');
    expect(mail.html).toContain('Annadevta');
    expect(mail.text).toContain('Priya');
  });

  it('orderPlaced lists the items and totals', () => {
    const mail = templates.orderPlaced({ order: ORDER, restaurantName: 'Spice Bites' });

    expect(mail.subject).toContain('Spice Bites');
    expect(mail.subject).toContain('F08900');
    expect(mail.html).toContain('Butter Chicken');
    expect(mail.html).toContain('₹670');
    expect(mail.html).toContain(`/order/${ORDER._id}`);
  });

  it('outForDelivery carries the pickup code and the estimate', () => {
    const mail = templates.outForDelivery({
      order: ORDER,
      restaurantName: 'Spice Bites',
      courierName: 'Ravi Kumar',
      otp: '4821',
      etaMinutes: 12,
    });

    expect(mail.html).toContain('4821');
    expect(mail.html).toContain('Ravi Kumar');
    expect(mail.html).toContain('about 12 minutes');
    expect(mail.text).toContain('4821');
  });

  it('outForDelivery degrades gracefully without an estimate', () => {
    const mail = templates.outForDelivery({
      order: ORDER,
      restaurantName: 'Spice Bites',
      otp: '4821',
      etaMinutes: null,
    });

    expect(mail.html).toContain('shortly');
    expect(mail.html).not.toContain('null');
  });

  it('escapes a restaurant name containing markup', () => {
    const mail = templates.orderPlaced({
      order: ORDER,
      restaurantName: '<img src=x onerror=alert(1)>',
    });

    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img');
  });

  it('every template offers a way to turn emails off', () => {
    const all = [
      templates.welcome({ name: 'A', role: 'customer' }),
      templates.orderPlaced({ order: ORDER, restaurantName: 'X' }),
      templates.newOrderForRestaurant({ order: ORDER, customerName: 'A' }),
      templates.outForDelivery({ order: ORDER, restaurantName: 'X', otp: '1111' }),
      templates.delivered({ order: ORDER, restaurantName: 'X' }),
      templates.donationClaimed({
        donation: { description: '10 meals', quantity: 10, units: 'meals' },
        volunteerName: 'Priya',
      }),
    ];

    for (const mail of all) {
      expect(mail.subject).toEqual(expect.any(String));
      expect(mail.subject.length).toBeGreaterThan(0);
      expect(mail.html).toContain('/profile');
      expect(mail.text).toEqual(expect.any(String));
    }
  });
});

describe('delivery of notifications', () => {
  beforeAll(startDb);
  afterAll(stopDb);
  afterEach(async () => {
    await clearDb();
    sentInTests.length = 0;
  });

  it('emails a welcome on registration', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Nikhil Rao', email: 'nikhil@test.dev', password: 'secret123' });
    await flush();

    const welcome = sentInTests.find((m) => m.to === 'nikhil@test.dev');
    expect(welcome?.subject).toBe('Welcome to Annam');
  });

  it('emails both the customer and the kitchen when an order is placed', async () => {
    const customer = await makeUser({ email: 'buyer@test.dev', role: 'customer' });
    const owner = await makeUser({ email: 'kitchen@test.dev', role: 'restaurant' });
    const { restaurant, items } = await makeRestaurantWithMenu(owner.user._id);
    sentInTests.length = 0;

    await request(app)
      .post('/api/orders')
      .set(auth(customer.token))
      .send({
        restaurantId: restaurant._id.toString(),
        items: [{ foodId: items[0]._id.toString(), qty: 1 }],
        deliveryAddress: '12 Test Street',
      });
    await flush();

    expect(sentInTests.find((m) => m.to === 'buyer@test.dev')?.subject).toContain('Order confirmed');
    expect(sentInTests.find((m) => m.to === 'kitchen@test.dev')?.subject).toContain('New order');
  });

  it('sends nothing to an account that has turned email off', async () => {
    const customer = await makeUser({ email: 'quiet@test.dev', role: 'customer' });
    const owner = await makeUser({ email: 'kitchen2@test.dev', role: 'restaurant' });
    const { restaurant, items } = await makeRestaurantWithMenu(owner.user._id);

    await request(app)
      .put('/api/users/profile')
      .set(auth(customer.token))
      .send({ notifications: { email: false } });
    sentInTests.length = 0;

    await request(app)
      .post('/api/orders')
      .set(auth(customer.token))
      .send({
        restaurantId: restaurant._id.toString(),
        items: [{ foodId: items[0]._id.toString(), qty: 1 }],
        deliveryAddress: '12 Test Street',
      });
    await flush();

    expect(sentInTests.find((m) => m.to === 'quiet@test.dev')).toBeUndefined();
    // The kitchen has not opted out, so it still hears about the order.
    expect(sentInTests.find((m) => m.to === 'kitchen2@test.dev')).toBeDefined();
  });

  it('the preference survives a round trip through the profile API', async () => {
    const customer = await makeUser({ email: 'pref@test.dev', role: 'customer' });

    const off = await request(app)
      .put('/api/users/profile')
      .set(auth(customer.token))
      .send({ notifications: { email: false } });
    expect(off.body.notifications.email).toBe(false);

    const on = await request(app)
      .put('/api/users/profile')
      .set(auth(customer.token))
      .send({ notifications: { email: true } });
    expect(on.body.notifications.email).toBe(true);
  });

  it('defaults a new account to receiving email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Default On', email: 'default@test.dev', password: 'secret123' });

    expect(res.body.user.notifications.email).toBe(true);
  });
});
