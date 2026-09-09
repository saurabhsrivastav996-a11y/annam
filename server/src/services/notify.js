import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import { sendMail } from '../config/mailer.js';
import * as templates from '../emails/templates.js';
import { etaMinutes as computeEta, pointToCoord } from '../utils/geo.js';

/**
 * Email notifications.
 *
 * Every function here is fire-and-forget: nothing an inbox does should be able
 * to fail an order, so callers do not await these and errors never propagate.
 * Each also honours the recipient's own switch — an account with email
 * notifications off gets nothing.
 */

/** Runs work in the background, logging rather than throwing. */
function background(label, work) {
  Promise.resolve()
    .then(work)
    .catch((err) => console.error(`[notify] ${label} failed:`, err.message));
}

/** Recipient address, or null when they cannot or should not be emailed. */
async function recipient(userId) {
  if (!userId) return null;
  const user = await User.findById(userId).select('name email notifications').lean();
  if (!user?.email) return null;
  if (user.notifications?.email === false) return null;
  return user;
}

export function notifyWelcome(user) {
  background('welcome', async () => {
    if (user.notifications?.email === false) return;
    await sendMail({ to: user.email, ...templates.welcome(user) });
  });
}

/** Confirmation to the customer, and the ticket to the kitchen. */
export function notifyOrderPlaced(order) {
  background('order-placed', async () => {
    const restaurant = await Restaurant.findById(order.restaurantId)
      .select('name ownerUserId')
      .lean();
    if (!restaurant) return;

    const [customer, owner] = await Promise.all([
      recipient(order.customerId),
      recipient(restaurant.ownerUserId),
    ]);

    if (customer) {
      await sendMail({
        to: customer.email,
        ...templates.orderPlaced({ order, restaurantName: restaurant.name }),
      });
    }
    if (owner) {
      const buyer = await User.findById(order.customerId).select('name').lean();
      await sendMail({
        to: owner.email,
        ...templates.newOrderForRestaurant({ order, customerName: buyer?.name || 'A customer' }),
      });
    }
  });
}

export function notifyOutForDelivery(order, { otp } = {}) {
  background('out-for-delivery', async () => {
    const customer = await recipient(order.customerId);
    if (!customer) return;

    const [restaurant, courier] = await Promise.all([
      // location is needed for the estimate; the caller's order document is
      // not populated, so fetch it here rather than quoting "shortly".
      Restaurant.findById(order.restaurantId).select('name location').lean(),
      order.deliveryId ? User.findById(order.deliveryId).select('name').lean() : null,
    ]);

    const eta = computeEta({
      from: pointToCoord(restaurant?.location),
      to: pointToCoord(order.deliveryLocation),
      status: 'OutForDelivery',
    });

    await sendMail({
      to: customer.email,
      ...templates.outForDelivery({
        order,
        restaurantName: restaurant?.name || 'the kitchen',
        courierName: courier?.name,
        otp,
        etaMinutes: eta,
      }),
    });
  });
}

export function notifyDelivered(order) {
  background('delivered', async () => {
    const customer = await recipient(order.customerId);
    if (!customer) return;

    const restaurant = await Restaurant.findById(order.restaurantId).select('name').lean();
    await sendMail({
      to: customer.email,
      ...templates.delivered({ order, restaurantName: restaurant?.name || 'the kitchen' }),
    });
  });
}

export function notifyDonationClaimed(donation, volunteer) {
  background('donation-claimed', async () => {
    const restaurant = await Restaurant.findById(donation.restaurantId)
      .select('ownerUserId')
      .lean();
    const owner = await recipient(restaurant?.ownerUserId);
    if (!owner) return;

    await sendMail({
      to: owner.email,
      ...templates.donationClaimed({
        donation,
        volunteerName: volunteer.name,
        volunteerPhone: volunteer.phone,
      }),
    });
  });
}
