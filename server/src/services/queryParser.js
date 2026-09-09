/**
 * Turns "something spicy under ₹300" into filters the database understands.
 *
 * Two implementations behind one function. The rules parser handles the
 * shapes people actually type — a price cap, veg or not, a spice level, a
 * cuisine — and needs nothing but the string. Claude handles the rest, and is
 * used only when an API key is configured.
 *
 * The rules parser is not a stub: without a key, search still understands most
 * real queries. That matters more than the ceiling, because a deployment
 * without a key is the common case.
 */

const PRICE_CAP = /(?:under|below|less than|cheaper than|up ?to|max(?:imum)?|within)\s*(?:₹|rs\.?|inr)?\s*(\d{2,5})/i;
const PRICE_FLOOR = /(?:over|above|more than|at least|min(?:imum)?)\s*(?:₹|rs\.?|inr)?\s*(\d{2,5})/i;
// A bare "₹300" with nothing else usually means "around this much".
const BARE_PRICE = /(?:₹|rs\.?|inr)\s*(\d{2,5})/i;

const VEG_WORDS = /\b(veg|vegetarian|veggie|no meat|meatless|plant[- ]based|vegan)\b/i;
const NON_VEG_WORDS = /\b(non[- ]?veg|chicken|mutton|lamb|fish|prawn|seafood|egg|meat|kebab|biryani with chicken)\b/i;

const SPICY_WORDS = /\b(spicy|spiced|hot|fiery|masala|chilli|chili|tangy)\b/i;
const MILD_WORDS = /\b(mild|not spicy|less spicy|no spice|bland|light)\b/i;

const CUISINES = {
  'north indian': /\b(north indian|punjabi|mughlai|tandoori)\b/i,
  'south indian': /\b(south indian|dosa|idli|sambar|udupi|kerala|mangalorean|coastal)\b/i,
  Healthy: /\b(healthy|salad|millet|quinoa|low[- ]cal|diet|clean)\b/i,
  Chinese: /\b(chinese|noodles|hakka|manchurian)\b/i,
  Italian: /\b(italian|pizza|pasta)\b/i,
};

// Words that carry no signal once the structured bits are pulled out.
const STOPWORDS = new Set([
  'i', 'want', 'something', 'some', 'a', 'an', 'the', 'for', 'me', 'to', 'eat',
  'food', 'dish', 'dishes', 'order', 'get', 'find', 'show', 'give', 'please',
  'under', 'below', 'over', 'above', 'less', 'more', 'than', 'up', 'upto',
  'max', 'maximum', 'min', 'minimum', 'within', 'cheap', 'cheaper', 'rs', 'inr',
  'with', 'and', 'or', 'but', 'is', 'are', 'looking', 'craving', 'feel', 'like',
  'hungry', 'today', 'tonight', 'now', 'nearby', 'near',
]);

/** The empty filter set, so every caller sees the same shape. */
export const emptyFilters = () => ({
  keywords: [],
  maxPrice: null,
  minPrice: null,
  dietary: null,
  spicy: null,
  cuisine: null,
});

/**
 * Pattern-based parse. No network, no key, fully deterministic.
 * Handles a price cap, veg/non-veg, spice level and cuisine.
 */
export function parseWithRules(query) {
  const text = String(query || '').trim();
  const filters = emptyFilters();
  if (!text) return filters;

  const cap = text.match(PRICE_CAP);
  const floor = text.match(PRICE_FLOOR);
  if (cap) filters.maxPrice = Number(cap[1]);
  if (floor) filters.minPrice = Number(floor[1]);

  // "₹300" on its own reads as a ceiling — nobody asks for food costing at least ₹300.
  if (!cap && !floor) {
    const bare = text.match(BARE_PRICE);
    if (bare) filters.maxPrice = Number(bare[1]);
  }

  // Non-veg wins: "veg biryani or chicken" is a request that includes meat.
  if (NON_VEG_WORDS.test(text)) filters.dietary = 'non-veg';
  else if (VEG_WORDS.test(text)) filters.dietary = 'veg';

  if (MILD_WORDS.test(text)) filters.spicy = false;
  else if (SPICY_WORDS.test(text)) filters.spicy = true;

  for (const [name, pattern] of Object.entries(CUISINES)) {
    if (pattern.test(text)) {
      filters.cuisine = name;
      break;
    }
  }

  // A word already turned into a filter must not also be required in the dish
  // name. "healthy food" means the Healthy cuisine, not a dish called healthy.
  const consumed = new Set();
  for (const pattern of [VEG_WORDS, NON_VEG_WORDS, MILD_WORDS, SPICY_WORDS, ...Object.values(CUISINES)]) {
    const hit = text.match(pattern);
    if (hit) hit[0].toLowerCase().split(/\s+/).forEach((w) => consumed.add(w));
  }
  if (filters.cuisine) filters.cuisine.toLowerCase().split(/\s+/).forEach((w) => consumed.add(w));

  filters.keywords = text
    .toLowerCase()
    .replace(/[₹,.!?]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w) && !consumed.has(w)
    );

  return filters;
}

/** Merges a model's answer over the rules result, ignoring anything malformed. */
export function mergeFilters(base, extra) {
  const merged = { ...base };
  if (!extra) return merged;

  if (Number.isFinite(extra.maxPrice) && extra.maxPrice > 0) merged.maxPrice = extra.maxPrice;
  if (Number.isFinite(extra.minPrice) && extra.minPrice > 0) merged.minPrice = extra.minPrice;
  if (['veg', 'non-veg'].includes(extra.dietary)) merged.dietary = extra.dietary;
  if (typeof extra.spicy === 'boolean') merged.spicy = extra.spicy;
  if (typeof extra.cuisine === 'string' && extra.cuisine.trim()) merged.cuisine = extra.cuisine.trim();

  if (Array.isArray(extra.keywords) && extra.keywords.length) {
    const words = extra.keywords
      .filter((k) => typeof k === 'string' && k.trim())
      .map((k) => k.trim().toLowerCase());
    merged.keywords = [...new Set([...words, ...merged.keywords])];
  }

  return merged;
}
