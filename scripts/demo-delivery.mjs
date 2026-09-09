/**
 * Drives one order through its whole lifecycle and streams courier GPS,
 * so you can watch the customer's tracking page update live without needing
 * three browsers signed in as three different people.
 *
 *   node scripts/demo-delivery.mjs <orderId>
 *
 * Place an order as customer@annam.dev first, then pass the id from the
 * tracking page URL (/order/<id>).
 */
import { io } from 'socket.io-client';

const BASE = process.env.ANNAM_API || 'http://localhost:5000/api';
const WS = BASE.replace(/\/api$/, '');
const PASSWORD = 'Test@123';
const ORDER_ID = process.argv[2];

if (!ORDER_ID) {
  console.error('Usage: node scripts/demo-delivery.mjs <orderId>');
  process.exit(1);
}

// A short route through Indiranagar, Bengaluru — restaurant to customer.
const ROUTE = [
  [12.9784, 77.6408], [12.9776, 77.6392], [12.9768, 77.6374],
  [12.9757, 77.6352], [12.9745, 77.6325], [12.9733, 77.6295],
  [12.9724, 77.6272], [12.9719, 77.6260],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const login = async (email) => {
  const { status, data } = await req('POST', '/auth/login', { body: { email, password: PASSWORD } });
  if (status !== 200) throw new Error(`Login failed for ${email}: ${data?.error}`);
  return data;
};

async function advance(label, fn) {
  const { status, data } = await fn();
  if (status >= 400) throw new Error(`${label} failed (${status}): ${data?.error}`);
  console.log(`✓ ${label}`);
  await sleep(2500);
}

const [restaurant, delivery, customer] = await Promise.all([
  login('restaurant@annam.dev'),
  login('delivery@annam.dev'),
  login('customer@annam.dev'),
]);

await advance('Restaurant accepted the order', () =>
  req('PUT', `/orders/${ORDER_ID}/status`, { token: restaurant.token, body: { status: 'Accepted' } }));
await advance('Kitchen started cooking', () =>
  req('PUT', `/orders/${ORDER_ID}/status`, { token: restaurant.token, body: { status: 'Preparing' } }));
await advance('Order marked ready', () =>
  req('PUT', `/orders/${ORDER_ID}/status`, { token: restaurant.token, body: { status: 'Ready' } }));
await advance('Courier claimed the delivery', () =>
  req('PUT', `/orders/${ORDER_ID}/accept`, { token: delivery.token }));

const { data: otpRes } = await req('GET', `/orders/${ORDER_ID}/otp`, { token: customer.token });
console.log(`  pickup OTP: ${otpRes.otp}`);

await advance('Picked up — out for delivery', () =>
  req('PUT', `/orders/${ORDER_ID}/status`, {
    token: delivery.token,
    body: { status: 'OutForDelivery', otp: otpRes.otp },
  }));

const socket = io(WS, { auth: { token: delivery.token }, transports: ['websocket'] });
await new Promise((resolve, reject) => {
  socket.on('connect', resolve);
  socket.on('connect_error', reject);
});
console.log('✓ Courier socket connected — streaming GPS');

for (const [lat, lng] of ROUTE) {
  socket.emit('locationUpdate', { orderId: ORDER_ID, lat, lng });
  console.log(`  → ${lat}, ${lng}`);
  await sleep(2000);
}

await advance('Delivered', () =>
  req('PUT', `/orders/${ORDER_ID}/status`, { token: delivery.token, body: { status: 'Delivered' } }));

socket.disconnect();
console.log('\nDone. The customer tracking page should now show "Delivered" and a rating prompt.');
process.exit(0);
