import Order from '../models/Order.js';

/**
 * Back-fills weeks of trading history.
 *
 * Without it the analytics tab on a fresh clone shows one bar at the right
 * edge and 29 empty columns, which demonstrates nothing. The rest of the seed
 * exists to make a page look alive on first load; this does the same job for
 * the parts of the app that are about trends rather than a single record.
 *
 * These orders are deliberately left unrated. `listReviews` shows every rated
 * order, so giving these a score would fill each restaurant's review list with
 * blank entries and drag its average around. The seeded reviews are the ones
 * with words attached, and they stay the only ones.
 */

const DAYS = 45;

// A working day, weighted the way a kitchen actually fills up: quiet mornings,
// a lunch rush, a bigger dinner rush, a thin late-night tail.
const HOUR_WEIGHTS = [
  [11, 1], [12, 4], [13, 5], [14, 3], [15, 1], [16, 1], [17, 2],
  [18, 3], [19, 6], [20, 7], [21, 5], [22, 2], [23, 1],
];
const HOUR_POOL = HOUR_WEIGHTS.flatMap(([hour, weight]) => Array(weight).fill(hour));

// Hyderabad. Matters because "busiest hour" is a question about the kitchen's
// own clock, and the analytics endpoint groups in this zone.
const TZ_OFFSET_MINUTES = 330;

/**
 * A small deterministic PRNG.
 *
 * Seeded so `npm run seed` produces the same chart every time. Demo data that
 * reshuffles on every run makes screenshots and bug reports unreproducible.
 */
function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local-midnight-anchored timestamp `daysAgo` back, at `hour` IST. */
function timestampFor(daysAgo, hour, minute) {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayStart = utcMidnight - daysAgo * 86400000;
  // Subtract the offset because we are naming a local hour in UTC terms.
  return new Date(dayStart + (hour * 60 + minute - TZ_OFFSET_MINUTES) * 60000);
}

/**
 * Writes `count` historical orders per restaurant across the last DAYS days.
 *
 * Returns how many were written. Menus are passed in rather than re-queried so
 * the caller keeps control of what a restaurant is allowed to have sold.
 */
export async function seedHistory({ restaurants, menusByRestaurantId, customerIds, deliveryId }) {
  const rand = mulberry32(20260910);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const docs = [];

  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo -= 1) {
    for (const restaurant of restaurants) {
      const menu = menusByRestaurantId.get(restaurant._id.toString()) || [];
      if (!menu.length) continue;

      // Weekends are busier; the exact shape matters less than not being flat.
      const weekday = timestampFor(daysAgo, 12, 0).getUTCDay();
      const busy = weekday === 0 || weekday === 6 ? 2 : 0;
      const count = Math.floor(rand() * 4) + busy;

      for (let n = 0; n < count; n += 1) {
        const dishes = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(menu));
        // Two lines for the same dish would be wrong; collapse into quantities.
        const byId = new Map();
        for (const dish of dishes) {
          const key = dish._id.toString();
          const existing = byId.get(key);
          if (existing) existing.qty += 1;
          else byId.set(key, { foodId: dish._id, name: dish.name, price: dish.price, qty: 1 });
        }
        const items = [...byId.values()];
        const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);

        // A handful of cancellations, because a dashboard reading 0% forever
        // is not a dashboard anyone learns to read.
        const cancelled = rand() < 0.07;
        const at = timestampFor(daysAgo, pick(HOUR_POOL), Math.floor(rand() * 60));

        docs.push({
          customerId: pick(customerIds),
          restaurantId: restaurant._id,
          deliveryId: cancelled ? null : deliveryId,
          items,
          subtotal,
          deliveryFee: 30,
          total: subtotal + 30,
          status: cancelled ? 'Cancelled' : 'Delivered',
          paymentStatus: cancelled ? 'refunded' : 'paid',
          paymentMethod: 'cod',
          deliveryAddress: 'Kondapur, Hyderabad',
          ...(cancelled ? { cancellationReason: 'Customer changed their mind' } : {}),
          statusHistory: [{ status: cancelled ? 'Cancelled' : 'Delivered', at }],
          createdAt: at,
          updatedAt: at,
        });
      }
    }
  }

  if (!docs.length) return 0;

  // Straight to the driver. Mongoose stamps createdAt itself on insert and
  // treats it as immutable afterwards, so a backdated history cannot be
  // written through the model at all.
  await Order.collection.insertMany(docs);
  return docs.length;
}
