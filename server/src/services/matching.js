import { roadDistanceKm, travelMinutes } from '../utils/geo.js';

/**
 * Ranking surplus-food pickups for a volunteer.
 *
 * A plain distance sort gets food wasted: the nearest donation might have six
 * hours left while one a little further away expires in forty minutes. This
 * scores each pickup on the things that actually decide whether the food gets
 * eaten, and returns *why* alongside the number so the interface can explain
 * itself rather than presenting a mystery ordering.
 *
 * Deliberately a transparent scoring function rather than a learned model.
 * There is no historical matching data to train on, the weights below are
 * arguable in the open, and a volunteer can be told why something is at the
 * top. A model would be less honest and no better.
 */

/** How much each factor moves the final score. They sum to 1. */
export const WEIGHTS = {
  urgency: 0.4, // food about to be binned matters most
  proximity: 0.35, // but nobody crosses the city for it
  sizeFit: 0.15, // match the load to what this volunteer usually carries
  freshness: 0.1, // nudge older postings up so nothing sits ignored
};

/** Beyond this, a pickup is treated as effectively out of range. */
const MAX_USEFUL_KM = 15;

/** A volunteer with no history is assumed to manage a normal-sized run. */
const ASSUMED_CAPACITY = 15;

/** Linear falloff from 1 at zero to 0 at `max`. */
const decay = (value, max) => Math.max(0, Math.min(1, 1 - value / max));

/**
 * Urgency from the pickup deadline.
 *
 * Peaks in the last couple of hours — that is when food is genuinely about to
 * be thrown away. It falls off again for anything unreachable in time, since
 * ranking a pickup nobody can make helps no one.
 */
function urgencyScore({ minutesLeft, minutesToTravel }) {
  if (minutesLeft === null) return 0.5; // no deadline given
  if (minutesLeft <= 0) return 0; // already expired

  // Not enough time to get there, with a little slack for collection.
  if (minutesToTravel !== null && minutesLeft < minutesToTravel + 10) return 0;

  if (minutesLeft <= 120) return 1;
  if (minutesLeft <= 360) return 0.7;
  if (minutesLeft <= 720) return 0.4;
  return 0.2;
}

/** How well this donation's size suits what the volunteer usually handles. */
function sizeFitScore(quantity, capacity) {
  if (!quantity) return 0.5;
  const ratio = quantity / (capacity || ASSUMED_CAPACITY);

  // Comfortably within reach.
  if (ratio <= 1) return 1;
  // Stretching, but plausible.
  if (ratio <= 2) return 0.7;
  if (ratio <= 4) return 0.4;
  // Far larger than anything they have collected before.
  return 0.15;
}

/** Older postings drift upward so nothing sits at the bottom forever. */
function freshnessScore(minutesSincePosted) {
  if (minutesSincePosted === null) return 0.5;
  if (minutesSincePosted >= 180) return 1;
  return 0.4 + (minutesSincePosted / 180) * 0.6;
}

/** A volunteer's typical load, from what they have actually collected. */
export function volunteerCapacity(volunteer) {
  const runs = volunteer?.stats?.donationsCollected || 0;
  const meals = volunteer?.stats?.mealsServed || 0;
  if (runs < 1 || meals < 1) return ASSUMED_CAPACITY;
  return Math.max(5, Math.round(meals / runs));
}

/**
 * Scores one donation for one volunteer.
 * Returns { score, distanceKm, minutesLeft, factors, reasons, feasible }.
 * `score` is 0–1; `reasons` are short phrases for the interface.
 */
export function scoreDonation({ donation, volunteerPosition, capacity, now = new Date() }) {
  const pickup = donation.pickupLocation?.coordinates
    ? { lat: donation.pickupLocation.coordinates[1], lng: donation.pickupLocation.coordinates[0] }
    : null;

  const distanceKm = volunteerPosition && pickup ? roadDistanceKm(volunteerPosition, pickup) : null;
  const minutesToTravel = distanceKm === null ? null : travelMinutes(distanceKm);

  const minutesLeft = donation.pickupBefore
    ? Math.round((new Date(donation.pickupBefore) - now) / 60000)
    : null;
  const minutesSincePosted = donation.postedAt
    ? Math.round((now - new Date(donation.postedAt)) / 60000)
    : null;

  const factors = {
    urgency: urgencyScore({ minutesLeft, minutesToTravel }),
    // Unknown distance scores neutrally rather than best or worst.
    proximity: distanceKm === null ? 0.5 : decay(distanceKm, MAX_USEFUL_KM),
    sizeFit: sizeFitScore(donation.quantity, capacity),
    freshness: freshnessScore(minutesSincePosted),
  };

  const score = Object.entries(WEIGHTS).reduce(
    (total, [key, weight]) => total + factors[key] * weight,
    0
  );

  const reasons = [];
  if (minutesLeft !== null && minutesLeft > 0 && minutesLeft <= 120) reasons.push('Expiring soon');
  if (distanceKm !== null && distanceKm <= 3) reasons.push('Very close to you');
  if (factors.sizeFit === 1 && donation.quantity) reasons.push('Matches your usual run');
  if (minutesSincePosted !== null && minutesSincePosted >= 180) reasons.push('Waiting a while');

  return {
    score: Number(score.toFixed(4)),
    distanceKm,
    minutesLeft,
    minutesToTravel,
    factors,
    reasons,
    // Expired, or unreachable before the deadline.
    feasible: factors.urgency > 0,
  };
}

/** Ranks a list of donations for one volunteer, best first. */
export function rankDonations({ donations, volunteerPosition, capacity, now = new Date() }) {
  return donations
    .map((donation) => ({ donation, ...scoreDonation({ donation, volunteerPosition, capacity, now }) }))
    .sort((a, b) => b.score - a.score);
}
