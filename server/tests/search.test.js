import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser } from './helpers.js';
import Restaurant from '../src/models/Restaurant.js';
import FoodItem from '../src/models/FoodItem.js';
import { parseWithRules, mergeFilters, emptyFilters } from '../src/services/queryParser.js';
import { searchDishes } from '../src/services/nlSearch.js';

jest.setTimeout(60000);

describe('parseWithRules', () => {
  it('reads a price ceiling however it is phrased', () => {
    for (const q of [
      'pasta under 300',
      'pasta under ₹300',
      'pasta below rs 300',
      'pasta less than 300',
      'pasta up to 300',
      'pasta within ₹300',
      'pasta max 300',
    ]) {
      expect(parseWithRules(q).maxPrice).toBe(300);
    }
  });

  it('reads a price floor', () => {
    expect(parseWithRules('something over 200').minPrice).toBe(200);
    expect(parseWithRules('at least ₹150').minPrice).toBe(150);
  });

  it('treats a bare price as a ceiling', () => {
    // Nobody asks for food costing *at least* ₹250 without saying so.
    expect(parseWithRules('biryani ₹250').maxPrice).toBe(250);
    expect(parseWithRules('biryani ₹250').minPrice).toBeNull();
  });

  it('spots a vegetarian request', () => {
    expect(parseWithRules('veg thali').dietary).toBe('veg');
    expect(parseWithRules('something vegetarian').dietary).toBe('veg');
  });

  it('lets a named meat override a veg word', () => {
    // "veg or chicken" includes meat, so it is not a vegetarian request.
    expect(parseWithRules('veg or chicken biryani').dietary).toBe('non-veg');
    expect(parseWithRules('chicken curry').dietary).toBe('non-veg');
  });

  it('reads spice level in both directions', () => {
    expect(parseWithRules('something spicy').spicy).toBe(true);
    expect(parseWithRules('mild curry').spicy).toBe(false);
    expect(parseWithRules('not spicy please').spicy).toBe(false);
    expect(parseWithRules('a dosa').spicy).toBeNull();
  });

  it('names a cuisine when one is implied', () => {
    expect(parseWithRules('dosa and sambar').cuisine).toBe('south indian');
    expect(parseWithRules('tandoori chicken').cuisine).toBe('north indian');
    expect(parseWithRules('a healthy salad').cuisine).toBe('Healthy');
  });

  it('keeps the words worth matching and drops the filler', () => {
    const { keywords, spicy, maxPrice } = parseWithRules(
      'I want something spicy with paneer under 300'
    );

    expect(keywords).toContain('paneer');
    expect(keywords).not.toContain('want');
    expect(keywords).not.toContain('something');
    expect(keywords).not.toContain('under');
    expect(keywords).not.toContain('300');
    // "spicy" became a filter, so it is not also a required dish word.
    expect(keywords).not.toContain('spicy');
    expect(spicy).toBe(true);
    expect(maxPrice).toBe(300);
  });

  it('does not also demand a filter word appear in the dish name', () => {
    // "healthy food" means the Healthy cuisine, not a dish literally called healthy.
    const healthy = parseWithRules('healthy food');
    expect(healthy.cuisine).toBe('Healthy');
    expect(healthy.keywords).not.toContain('healthy');

    const veg = parseWithRules('veg thali');
    expect(veg.dietary).toBe('veg');
    expect(veg.keywords).not.toContain('veg');
    // The part that is actually a dish name survives.
    expect(veg.keywords).toContain('thali');

    const spicy = parseWithRules('spicy paneer');
    expect(spicy.keywords).not.toContain('spicy');
    expect(spicy.keywords).toContain('paneer');
  });

  it('returns empty filters for an empty query', () => {
    expect(parseWithRules('')).toEqual(emptyFilters());
    expect(parseWithRules(null)).toEqual(emptyFilters());
  });
});

describe('mergeFilters', () => {
  const base = { ...emptyFilters(), keywords: ['paneer'], maxPrice: 300 };

  it('lets the model fill in what the rules missed', () => {
    const merged = mergeFilters(base, { dietary: 'veg', spicy: true, keywords: ['tikka'] });

    expect(merged.dietary).toBe('veg');
    expect(merged.spicy).toBe(true);
    expect(merged.keywords).toEqual(expect.arrayContaining(['paneer', 'tikka']));
    expect(merged.maxPrice).toBe(300);
  });

  it('ignores nonsense rather than trusting it', () => {
    const merged = mergeFilters(base, {
      maxPrice: 'free',
      dietary: 'pescatarian',
      spicy: 'very',
      keywords: 'not-an-array',
    });

    expect(merged).toEqual(base);
  });

  it('survives a null or missing model answer', () => {
    expect(mergeFilters(base, null)).toEqual(base);
    expect(mergeFilters(base, undefined)).toEqual(base);
  });
});

describe('searchDishes', () => {
  beforeAll(startDb);
  afterAll(stopDb);
  afterEach(clearDb);

  beforeEach(async () => {
    const owner = await makeUser({ email: 'owner@test.dev', role: 'restaurant' });
    const north = await Restaurant.create({
      ownerUserId: owner.user._id,
      name: 'Spice House',
      address: '1 Test Road',
      cuisineType: 'North Indian',
    });
    const healthy = await Restaurant.create({
      ownerUserId: owner.user._id,
      name: 'Green Bowl',
      address: '2 Test Road',
      cuisineType: 'Healthy',
    });

    await FoodItem.insertMany([
      { restaurantId: north._id, name: 'Paneer Tikka Masala', description: 'Smoky spicy gravy', price: 280, category: 'veg' },
      { restaurantId: north._id, name: 'Chicken Biryani', description: 'Spiced rice', price: 340, category: 'non-veg' },
      { restaurantId: north._id, name: 'Plain Naan', description: 'Soft bread', price: 40, category: 'veg' },
      { restaurantId: healthy._id, name: 'Quinoa Salad', description: 'Light and fresh', price: 240, category: 'veg' },
      { restaurantId: healthy._id, name: 'Sold Out Bowl', description: 'Millet', price: 200, category: 'veg', isAvailable: false },
    ]);
  });

  it('respects a price ceiling', async () => {
    const found = await searchDishes({ ...emptyFilters(), maxPrice: 250 });
    const prices = found.map((d) => d.price);

    expect(prices.length).toBeGreaterThan(0);
    expect(Math.max(...prices)).toBeLessThanOrEqual(250);
  });

  it('respects a dietary filter', async () => {
    const found = await searchDishes({ ...emptyFilters(), dietary: 'veg' });
    expect(found.every((d) => d.category === 'veg')).toBe(true);
  });

  it('matches keywords against name and description', async () => {
    const found = await searchDishes({ ...emptyFilters(), keywords: ['paneer'] });
    expect(found[0].name).toBe('Paneer Tikka Masala');
  });

  it('treats a spicy request as extra words to match', async () => {
    const found = await searchDishes({ ...emptyFilters(), spicy: true, keywords: [] });
    expect(found.map((d) => d.name)).toEqual(expect.arrayContaining(['Paneer Tikka Masala']));
  });

  it('filters by the restaurant’s cuisine', async () => {
    const found = await searchDishes({ ...emptyFilters(), cuisine: 'Healthy' });

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((d) => d.restaurant.cuisineType === 'Healthy')).toBe(true);
  });

  it('never returns an unavailable dish', async () => {
    const found = await searchDishes({ ...emptyFilters(), keywords: ['bowl'] });
    expect(found.map((d) => d.name)).not.toContain('Sold Out Bowl');
  });

  it('attaches the restaurant, since that is where you order from', async () => {
    const [first] = await searchDishes({ ...emptyFilters(), keywords: ['paneer'] });

    expect(first.restaurant.name).toBe('Spice House');
    expect(first.restaurant.cuisineType).toBe('North Indian');
  });

  it('combines filters the way a real query does', async () => {
    // "spicy veg under 300"
    const found = await searchDishes({
      ...emptyFilters(),
      dietary: 'veg',
      maxPrice: 300,
      spicy: true,
      keywords: [],
    });

    expect(found.map((d) => d.name)).toContain('Paneer Tikka Masala');
    expect(found.map((d) => d.name)).not.toContain('Chicken Biryani');
  });
});

describe('GET /api/search', () => {
  beforeAll(startDb);
  afterAll(stopDb);
  afterEach(clearDb);

  beforeEach(async () => {
    const owner = await makeUser({ email: 'owner2@test.dev', role: 'restaurant' });
    const r = await Restaurant.create({
      ownerUserId: owner.user._id,
      name: 'Spice House',
      address: '1 Test Road',
      cuisineType: 'North Indian',
    });
    await FoodItem.create({
      restaurantId: r._id,
      name: 'Paneer Tikka Masala',
      description: 'Smoky spicy gravy',
      price: 280,
      category: 'veg',
    });
  });

  it('answers a natural-language query without any API key', async () => {
    const res = await request(app).get('/api/search').query({ q: 'something spicy under 300' });

    expect(res.status).toBe(200);
    expect(res.body.filters.maxPrice).toBe(300);
    expect(res.body.filters.spicy).toBe(true);
    // No key in the test environment, so the rules parser handled it.
    expect(res.body.parsedBy).toBe('rules');
    expect(res.body.dishes.length).toBeGreaterThan(0);
  });

  it('is open to anyone, signed in or not', async () => {
    const res = await request(app).get('/api/search').query({ q: 'paneer' });
    expect(res.status).toBe(200);
  });

  it('rejects a query too short to mean anything', async () => {
    const res = await request(app).get('/api/search').query({ q: 'a' });
    expect(res.status).toBe(400);
  });

  it('reports whether natural-language parsing is available', async () => {
    const res = await request(app).get('/api/search/config');

    expect(res.status).toBe(200);
    expect(typeof res.body.naturalLanguage).toBe('boolean');
    expect(res.body.hint).toEqual(expect.any(String));
  });

  it('returns an empty list rather than an error when nothing matches', async () => {
    const res = await request(app).get('/api/search').query({ q: 'sushi under 100' });

    expect(res.status).toBe(200);
    expect(res.body.dishes).toEqual([]);
  });
});
