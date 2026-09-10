import {
  haversineKm,
  roadDistanceKm,
  travelMinutes,
  etaMinutes,
  pointToCoord,
  formatDistance,
  AVG_SPEED_KMH,
  PREP_MINUTES,
} from '../src/utils/geo.js';

// Two real Hyderabad landmarks, ~6.5 km apart in a straight line.
const BANJARA_HILLS = { lat: 17.4126, lng: 78.4392 };
const MADHAPUR = { lat: 17.4485, lng: 78.3908 };

describe('haversineKm', () => {
  it('measures a known city hop', () => {
    const km = haversineKm(BANJARA_HILLS, MADHAPUR);
    expect(km).toBeGreaterThan(6.3);
    expect(km).toBeLessThan(6.7);
  });

  it('is zero for the same point and symmetric between two', () => {
    expect(haversineKm(BANJARA_HILLS, BANJARA_HILLS)).toBeCloseTo(0, 6);
    expect(haversineKm(BANJARA_HILLS, MADHAPUR)).toBeCloseTo(haversineKm(MADHAPUR, BANJARA_HILLS), 9);
  });

  it('returns null rather than NaN for unusable input', () => {
    expect(haversineKm(null, MADHAPUR)).toBeNull();
    expect(haversineKm({ lat: 'x', lng: 1 }, MADHAPUR)).toBeNull();
    expect(haversineKm({ lat: 91, lng: 0 }, MADHAPUR)).toBeNull();
    expect(haversineKm({ lat: 12, lng: 200 }, MADHAPUR)).toBeNull();
    expect(haversineKm({}, {})).toBeNull();
  });
});

describe('roadDistanceKm', () => {
  it('reads longer than the straight line, because roads bend', () => {
    const straight = haversineKm(BANJARA_HILLS, MADHAPUR);
    const road = roadDistanceKm(BANJARA_HILLS, MADHAPUR);

    expect(road).toBeGreaterThan(straight);
    expect(road).toBeCloseTo(straight * 1.3, 1);
  });

  it('propagates null instead of guessing', () => {
    expect(roadDistanceKm(null, MADHAPUR)).toBeNull();
  });
});

describe('travelMinutes', () => {
  it('matches the assumed average speed', () => {
    // An hour at the average speed should read as about an hour.
    expect(travelMinutes(AVG_SPEED_KMH)).toBe(60);
  });

  it('never promises zero minutes for a nearby address', () => {
    expect(travelMinutes(0)).toBe(1);
    expect(travelMinutes(0.05)).toBe(1);
  });

  it('returns null for unusable input', () => {
    expect(travelMinutes(null)).toBeNull();
    expect(travelMinutes(Number.NaN)).toBeNull();
  });
});

describe('etaMinutes', () => {
  it('includes kitchen time while the order is still being cooked', () => {
    const placed = etaMinutes({ from: BANJARA_HILLS, to: MADHAPUR, status: 'Placed' });
    const outForDelivery = etaMinutes({ from: BANJARA_HILLS, to: MADHAPUR, status: 'OutForDelivery' });

    expect(placed - outForDelivery).toBe(PREP_MINUTES.Placed);
  });

  it('shrinks as the order moves through the kitchen', () => {
    const stages = ['Placed', 'Accepted', 'Preparing', 'Ready', 'OutForDelivery'].map((status) =>
      etaMinutes({ from: BANJARA_HILLS, to: MADHAPUR, status })
    );

    const sorted = [...stages].sort((a, b) => b - a);
    expect(stages).toEqual(sorted);
  });

  it('returns null when either end is unknown', () => {
    expect(etaMinutes({ from: null, to: MADHAPUR })).toBeNull();
  });

  it('treats an unknown status as no remaining prep time', () => {
    const unknown = etaMinutes({ from: BANJARA_HILLS, to: MADHAPUR, status: 'Wat' });
    const travelOnly = etaMinutes({ from: BANJARA_HILLS, to: MADHAPUR, status: 'OutForDelivery' });

    expect(unknown).toBe(travelOnly);
  });
});

describe('pointToCoord', () => {
  it('flips GeoJSON [lng, lat] into { lat, lng }', () => {
    expect(pointToCoord({ type: 'Point', coordinates: [78.4392, 17.4126] })).toEqual({
      lat: 17.4126,
      lng: 78.4392,
    });
  });

  it('rejects malformed points', () => {
    expect(pointToCoord(null)).toBeNull();
    expect(pointToCoord({ coordinates: [] })).toBeNull();
    expect(pointToCoord({ coordinates: [999, 999] })).toBeNull();
  });
});

describe('formatDistance', () => {
  it('uses metres below a kilometre and km above', () => {
    expect(formatDistance(0.4)).toBe('400 m');
    expect(formatDistance(2.44)).toBe('2.4 km');
  });

  it('says "Nearby" rather than "0 m" for something on the doorstep', () => {
    expect(formatDistance(0)).toBe('Nearby');
    expect(formatDistance(0.02)).toBe('Nearby');
  });

  it('returns null for unknown distances', () => {
    expect(formatDistance(null)).toBeNull();
  });
});
