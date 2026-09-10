import {
  scoreDonation,
  rankDonations,
  volunteerCapacity,
  WEIGHTS,
} from '../src/services/matching.js';

const NOW = new Date('2026-01-15T12:00:00Z');
const HERE = { lat: 17.3850, lng: 78.4867 };

const minutesFromNow = (m) => new Date(NOW.getTime() + m * 60000);

/** A donation at a given distance, roughly, by nudging longitude. */
function donationAt({ km = 1, minutesLeft = 300, quantity = 10, postedMinutesAgo = 10 } = {}) {
  // ~0.0092 degrees of longitude is about 1 km at this latitude.
  const lng = HERE.lng + (km / 1.3) * 0.0092;
  return {
    quantity,
    pickupLocation: { type: 'Point', coordinates: [lng, HERE.lat] },
    pickupBefore: minutesFromNow(minutesLeft),
    postedAt: new Date(NOW.getTime() - postedMinutesAgo * 60000),
  };
}

const score = (donation, capacity = 15) =>
  scoreDonation({ donation, volunteerPosition: HERE, capacity, now: NOW });

describe('weights', () => {
  it('sum to one, so a score is always 0–1', () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe('volunteerCapacity', () => {
  it('uses what a volunteer has actually carried', () => {
    expect(volunteerCapacity({ stats: { donationsCollected: 4, mealsServed: 80 } })).toBe(20);
  });

  it('assumes a normal run for someone with no history', () => {
    expect(volunteerCapacity({ stats: { donationsCollected: 0, mealsServed: 0 } })).toBe(15);
    expect(volunteerCapacity(undefined)).toBe(15);
  });

  it('never suggests an absurdly small capacity', () => {
    expect(volunteerCapacity({ stats: { donationsCollected: 10, mealsServed: 3 } })).toBe(5);
  });
});

describe('urgency beats convenience', () => {
  it('ranks food expiring soon above a closer one with hours left', () => {
    const nearAndRelaxed = donationAt({ km: 0.5, minutesLeft: 600 });
    const furtherButExpiring = donationAt({ km: 5, minutesLeft: 60 });

    expect(score(furtherButExpiring).score).toBeGreaterThan(score(nearAndRelaxed).score);
  });

  it('scores an already-expired pickup at zero urgency and marks it unfeasible', () => {
    const expired = score(donationAt({ minutesLeft: -30 }));

    expect(expired.factors.urgency).toBe(0);
    expect(expired.feasible).toBe(false);
  });

  it('refuses a pickup that cannot be reached before the deadline', () => {
    // 20 km away at ~18 km/h is over an hour of travel; only 15 minutes left.
    const impossible = score(donationAt({ km: 20, minutesLeft: 15 }));

    expect(impossible.feasible).toBe(false);
  });

  it('accepts a tight but reachable pickup', () => {
    const tight = score(donationAt({ km: 1, minutesLeft: 45 }));

    expect(tight.feasible).toBe(true);
    expect(tight.factors.urgency).toBe(1);
  });
});

describe('proximity', () => {
  it('prefers nearer when everything else matches', () => {
    const near = score(donationAt({ km: 1 }));
    const far = score(donationAt({ km: 12 }));

    expect(near.factors.proximity).toBeGreaterThan(far.factors.proximity);
    expect(near.score).toBeGreaterThan(far.score);
  });

  it('scores an unknown location neutrally rather than best or worst', () => {
    const noLocation = scoreDonation({
      donation: { quantity: 10, pickupBefore: minutesFromNow(300), postedAt: NOW },
      volunteerPosition: null,
      capacity: 15,
      now: NOW,
    });

    expect(noLocation.factors.proximity).toBe(0.5);
    expect(noLocation.distanceKm).toBeNull();
  });
});

describe('size fit', () => {
  it('scores a run within the volunteer’s usual load best', () => {
    expect(score(donationAt({ quantity: 10 }), 15).factors.sizeFit).toBe(1);
  });

  it('marks down a load far larger than they have ever carried', () => {
    const huge = score(donationAt({ quantity: 200 }), 10).factors.sizeFit;
    const normal = score(donationAt({ quantity: 8 }), 10).factors.sizeFit;

    expect(huge).toBeLessThan(normal);
    expect(huge).toBeLessThan(0.3);
  });
});

describe('freshness', () => {
  it('lifts a posting that has been waiting, so nothing sits ignored', () => {
    const fresh = score(donationAt({ postedMinutesAgo: 1 })).factors.freshness;
    const waiting = score(donationAt({ postedMinutesAgo: 240 })).factors.freshness;

    expect(waiting).toBeGreaterThan(fresh);
    expect(waiting).toBe(1);
  });
});

describe('explanations', () => {
  it('says why something is near the top', () => {
    const { reasons } = score(donationAt({ km: 1, minutesLeft: 60, quantity: 10 }), 15);

    expect(reasons).toEqual(expect.arrayContaining(['Expiring soon', 'Very close to you']));
  });

  it('says nothing special about an unremarkable pickup', () => {
    const { reasons } = score(donationAt({ km: 8, minutesLeft: 600, quantity: 90 }), 10);
    expect(reasons).toHaveLength(0);
  });
});

describe('rankDonations', () => {
  it('returns best first and keeps every donation', () => {
    const donations = [
      donationAt({ km: 10, minutesLeft: 700 }),
      donationAt({ km: 1, minutesLeft: 60 }),
      donationAt({ km: 4, minutesLeft: 300 }),
    ];

    const ranked = rankDonations({
      donations,
      volunteerPosition: HERE,
      capacity: 15,
      now: NOW,
    });

    expect(ranked).toHaveLength(3);
    expect(ranked[0].donation).toBe(donations[1]);
    // Monotonically decreasing.
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
  });

  it('handles an empty list', () => {
    expect(rankDonations({ donations: [], volunteerPosition: HERE, capacity: 15 })).toEqual([]);
  });

  it('still ranks when the volunteer has not shared a location', () => {
    const ranked = rankDonations({
      donations: [donationAt({ minutesLeft: 600 }), donationAt({ minutesLeft: 60 })],
      volunteerPosition: null,
      capacity: 15,
      now: NOW,
    });

    // Urgency still decides the order.
    expect(ranked[0].minutesLeft).toBe(60);
  });
});
