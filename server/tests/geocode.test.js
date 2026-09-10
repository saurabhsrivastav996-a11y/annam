import { jest } from '@jest/globals';
import { geocode, reverseGeocode, _resetCache } from '../src/services/geocode.js';

jest.setTimeout(60000);

/** Stands in for Nominatim, so no test touches the network. */
function fakeFetch(payload, { ok = true } = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, headers: options?.headers });
    return { ok, json: async () => payload };
  };
  impl.calls = calls;
  return impl;
}

const HIT = [{ lat: '17.4126', lon: '78.4392', display_name: 'Road No. 12, Banjara Hills, Hyderabad' }];

beforeEach(_resetCache);

describe('geocode', () => {
  it('turns an address into coordinates', async () => {
    const result = await geocode('100ft Road Indiranagar', { fetchImpl: fakeFetch(HIT) });

    expect(result).toEqual({
      lat: 17.4126,
      lng: 78.4392,
      displayName: 'Road No. 12, Banjara Hills, Hyderabad',
    });
  });

  it('identifies the app, as Nominatim requires', async () => {
    const impl = fakeFetch(HIT);
    await geocode('somewhere real', { fetchImpl: impl });

    expect(impl.calls[0].headers['User-Agent']).toMatch(/^Annam\//);
  });

  it('caches, so the same address is looked up once', async () => {
    const impl = fakeFetch(HIT);

    await geocode('100ft Road Indiranagar', { fetchImpl: impl });
    await geocode('  100FT road   indiranagar ', { fetchImpl: impl });

    // Different spacing and case, one network call.
    expect(impl.calls).toHaveLength(1);
  });

  it('returns null when nothing matches', async () => {
    expect(await geocode('qqqqzzzz nowhere', { fetchImpl: fakeFetch([]) })).toBeNull();
  });

  it('returns null when the service errors, rather than throwing', async () => {
    const failing = async () => {
      throw new Error('network down');
    };
    await expect(geocode('anywhere at all', { fetchImpl: failing })).resolves.toBeNull();
  });

  it('returns null on a non-200 response', async () => {
    expect(await geocode('rate limited', { fetchImpl: fakeFetch([], { ok: false }) })).toBeNull();
  });

  it('does not call out for a too-short query', async () => {
    const impl = fakeFetch(HIT);

    expect(await geocode('a', { fetchImpl: impl })).toBeNull();
    expect(await geocode('', { fetchImpl: impl })).toBeNull();
    expect(impl.calls).toHaveLength(0);
  });

  it('ignores a hit with unusable coordinates', async () => {
    const junk = [{ lat: 'not-a-number', lon: '78.4', display_name: 'x' }];
    expect(await geocode('broken payload', { fetchImpl: fakeFetch(junk) })).toBeNull();
  });

  it('biases results to a country by default', async () => {
    const impl = fakeFetch(HIT);
    await geocode('MG Road', { fetchImpl: impl });

    expect(impl.calls[0].url).toContain('countrycodes=in');
  });

  it('keeps requests at least a second apart', async () => {
    const impl = fakeFetch(HIT);
    const started = Date.now();

    await Promise.all([
      geocode('first address here', { fetchImpl: impl }),
      geocode('second address here', { fetchImpl: impl }),
    ]);

    expect(impl.calls).toHaveLength(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
  });

  it('a failed lookup does not wedge the queue', async () => {
    const failing = async () => {
      throw new Error('boom');
    };
    await geocode('this one fails', { fetchImpl: failing });

    const result = await geocode('this one works', { fetchImpl: fakeFetch(HIT) });
    expect(result?.lat).toBe(17.4126);
  });
});

describe('reverseGeocode', () => {
  const PLACE = { display_name: '12 Kondapur Main Rd, Hyderabad' };

  it('turns coordinates into an address', async () => {
    const result = await reverseGeocode(17.4126, 78.4392, { fetchImpl: fakeFetch(PLACE) });

    expect(result).toEqual({
      lat: 17.4126,
      lng: 78.4392,
      displayName: '12 Kondapur Main Rd, Hyderabad',
    });
  });

  it('rejects impossible coordinates without calling out', async () => {
    const impl = fakeFetch(PLACE);

    expect(await reverseGeocode('abc', 77, { fetchImpl: impl })).toBeNull();
    expect(await reverseGeocode(undefined, undefined, { fetchImpl: impl })).toBeNull();
    expect(impl.calls).toHaveLength(0);
  });

  it('returns null when the point has no address', async () => {
    expect(await reverseGeocode(0, 0, { fetchImpl: fakeFetch({}) })).toBeNull();
  });
});
