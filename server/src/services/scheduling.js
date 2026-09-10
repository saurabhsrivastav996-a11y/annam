import Order from '../models/Order.js';
import { ApiError } from '../utils/ApiError.js';
import { PREP_MINUTES, roadDistanceKm, travelMinutes, pointToCoord } from '../utils/geo.js';
import { formatSlot } from '../utils/time.js';
import { emitToOrder, emitToUser } from '../sockets/emitters.js';
import { notifyOrderReleased } from './notify.js';
import { refundOrder } from './refund.js';

/**
 * Orders placed for later.
 *
 * A scheduled order waits as `Scheduled` until it is time for the kitchen to
 * start, then moves to `Placed` exactly as if the customer had ordered at that
 * moment. The start time is worked back from the slot the customer chose — the
 * kitchen's prep, the ride, and a buffer — so it differs between a flat next
 * door and one across the city. A single fixed "book at least 45 minutes
 * ahead" rule would release a far-away order immediately and still deliver it
 * late.
 */

const MINUTE = 60_000;

/** How far ahead an order may be booked. */
export const MAX_AHEAD_DAYS = 7;

/** Slack on top of prep and the ride, for pickup and the handover. */
export const RELEASE_BUFFER_MINUTES = 10;

/** The ride assumed when the delivery address could not be placed on a map. */
export const UNKNOWN_TRAVEL_MINUTES = 30;

export const CLOSED_AT_RELEASE_REASON = 'The restaurant was closed at the scheduled time';

/** Minutes the kitchen needs before the slot: prep, the ride, and a buffer. */
export function leadMinutesFor({ restaurantLocation, deliveryLocation }) {
  const km = roadDistanceKm(pointToCoord(restaurantLocation), pointToCoord(deliveryLocation));
  const ride = travelMinutes(km) ?? UNKNOWN_TRAVEL_MINUTES;
  return PREP_MINUTES.Placed + ride + RELEASE_BUFFER_MINUTES;
}

/**
 * Validates a requested slot and works out when the kitchen must start.
 * Returns null for an order wanted now. Throws a 400 the customer can act on.
 */
export function planSchedule({ scheduledFor, restaurantLocation, deliveryLocation, now = new Date() }) {
  if (scheduledFor === undefined || scheduledFor === null || scheduledFor === '') return null;

  const slot = new Date(scheduledFor);
  if (Number.isNaN(slot.getTime())) {
    throw new ApiError(400, 'scheduledFor must be a valid date and time');
  }

  if (slot.getTime() - now.getTime() > MAX_AHEAD_DAYS * 24 * 60 * MINUTE) {
    throw new ApiError(400, `Orders can be scheduled up to ${MAX_AHEAD_DAYS} days ahead`);
  }

  const lead = leadMinutesFor({ restaurantLocation, deliveryLocation });
  const earliest = new Date(now.getTime() + lead * MINUTE);
  if (slot < earliest) {
    // Accepting it would release the order at once and still arrive late, so
    // say what is actually possible instead of quietly missing the slot.
    throw new ApiError(400, `The earliest this kitchen can deliver there is ${formatSlot(earliest)}`);
  }

  return { scheduledFor: slot, releaseAt: new Date(slot.getTime() - lead * MINUTE) };
}

/**
 * Hands due scheduled orders to their kitchens.
 *
 * Each order is claimed with a conditional update on `status: 'Scheduled'`, so
 * if this runs twice at once — two server instances, or a slow run overlapping
 * the next — an order is released exactly once. A kitchen that has closed since
 * the order was booked cannot take it, so the order is cancelled and refunded
 * rather than left waiting for someone who is not there.
 */
export async function releaseDueOrders({ now = new Date(), limit = 50 } = {}) {
  const due = await Order.find({ status: 'Scheduled', releaseAt: { $lte: now } })
    .sort({ releaseAt: 1 })
    .limit(limit)
    .populate('restaurantId', 'isOpen ownerUserId');

  const summary = { released: 0, cancelled: 0 };

  for (const candidate of due) {
    const restaurant = candidate.restaurantId;
    const open = Boolean(restaurant?.isOpen);
    const next = open ? 'Placed' : 'Cancelled';

    const order = await Order.findOneAndUpdate(
      { _id: candidate._id, status: 'Scheduled' },
      {
        $set: { status: next, ...(open ? {} : { cancellationReason: CLOSED_AT_RELEASE_REASON }) },
        $push: { statusHistory: { status: next, at: now } },
      },
      { new: true }
    );
    if (!order) continue; // another run claimed it first

    if (open) {
      emitToUser(restaurant.ownerUserId.toString(), 'order:new', { orderId: order._id });
      notifyOrderReleased(order);
      summary.released += 1;
    } else {
      order.paymentStatus = await refundOrder(order);
      await order.save();
      summary.cancelled += 1;
    }

    emitToOrder(order._id.toString(), 'order:status', { orderId: order._id, status: next });
  }

  return summary;
}
