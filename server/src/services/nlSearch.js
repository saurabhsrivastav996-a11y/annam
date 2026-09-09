import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import FoodItem from '../models/FoodItem.js';
import Restaurant from '../models/Restaurant.js';
import { env } from '../config/env.js';
import { parseWithRules, mergeFilters, emptyFilters } from './queryParser.js';

/**
 * Natural-language dish search.
 *
 * The query is turned into structured filters, then those filters run against
 * the menu. Only the parsing step involves a model, and only when a key is
 * configured — everything else is an ordinary database query, so search works
 * the same either way, just with a lower ceiling on how odd the phrasing can be.
 */

export const claudeEnabled = Boolean(env.anthropic.apiKey);

const client = claudeEnabled ? new Anthropic({ apiKey: env.anthropic.apiKey }) : null;

/** What we want back from the model. */
const FiltersSchema = z.object({
  keywords: z.array(z.string()).describe('Dish or ingredient words to match, lowercase'),
  maxPrice: z.number().nullable().describe('Rupee ceiling, or null if none was given'),
  minPrice: z.number().nullable().describe('Rupee floor, or null if none was given'),
  dietary: z.enum(['veg', 'non-veg']).nullable().describe('Only if the query implies one'),
  spicy: z.boolean().nullable().describe('true for spicy, false for mild, null if unsaid'),
  cuisine: z.string().nullable().describe('Cuisine name if named, else null'),
});

const SYSTEM = `You turn a diner's request into search filters for an Indian food-delivery menu.

Extract only what the request actually says. If something is not stated, use null —
do not guess a price ceiling, a cuisine, or a diet that the diner did not ask for.

Keywords should be the words worth matching against dish names and descriptions:
ingredients and dish names, not filler like "something" or "I want".
Prices are in rupees.`;

/**
 * Parses a query into filters.
 *
 * Rules first, so there is always an answer; Claude then refines it when a key
 * is configured. A model failure is not a search failure — the rules result is
 * returned and the caller is none the wiser.
 */
export async function parseQuery(query, { signal } = {}) {
  const text = String(query || '').trim();
  if (!text) return { filters: emptyFilters(), parsedBy: 'none' };

  const rules = parseWithRules(text);
  if (!client) return { filters: rules, parsedBy: 'rules' };

  try {
    const response = await client.messages.parse(
      {
        model: 'claude-opus-5',
        max_tokens: 1024,
        // Pulling four fields out of one sentence does not need deep reasoning.
        output_config: { effort: 'low', format: zodOutputFormat(FiltersSchema) },
        system: SYSTEM,
        messages: [{ role: 'user', content: text }],
      },
      { signal, timeout: 8000 }
    );

    if (response.stop_reason === 'refusal') {
      console.warn('[nlSearch] model declined to parse the query');
      return { filters: rules, parsedBy: 'rules' };
    }

    const parsed = response.parsed_output;
    if (!parsed) return { filters: rules, parsedBy: 'rules' };

    return { filters: mergeFilters(rules, parsed), parsedBy: 'claude' };
  } catch (err) {
    // Rate limit, timeout, bad key — none of these should break search.
    console.error('[nlSearch] falling back to rules:', err.message);
    return { filters: rules, parsedBy: 'rules' };
  }
}

/** Escapes a user string for use inside a RegExp. */
const literal = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Runs the filters against the menu.
 *
 * Dishes are matched, then grouped by restaurant, because a diner searching
 * for "paneer under 300" wants to know where to order it from.
 */
export async function searchDishes(filters, { limit = 30 } = {}) {
  const query = { isAvailable: { $ne: false } };

  if (filters.dietary) query.category = filters.dietary;

  if (filters.maxPrice || filters.minPrice) {
    query.price = {};
    if (filters.maxPrice) query.price.$lte = filters.maxPrice;
    if (filters.minPrice) query.price.$gte = filters.minPrice;
  }

  // Spice is not a field on the menu, so treat it as extra words to match.
  const words = [...filters.keywords];
  if (filters.spicy === true) words.push('spicy', 'masala', 'chilli');

  if (words.length) {
    const patterns = words.map((w) => new RegExp(literal(w), 'i'));
    query.$or = [
      { name: { $in: patterns } },
      { description: { $in: patterns } },
    ];
  }

  let dishes = await FoodItem.find(query).limit(limit * 3).lean();

  // Restaurants supply the cuisine, so that filter is applied after the join.
  const restaurantIds = [...new Set(dishes.map((d) => String(d.restaurantId)))];
  const restaurants = await Restaurant.find({
    _id: { $in: restaurantIds },
    isApproved: true,
    ...(filters.cuisine ? { cuisineType: new RegExp(literal(filters.cuisine), 'i') } : {}),
  })
    .select('name cuisineType imageUrl rating ratingCount location isOpen')
    .lean();

  const byId = new Map(restaurants.map((r) => [String(r._id), r]));
  dishes = dishes.filter((d) => byId.has(String(d.restaurantId)));

  // Rank by how many of the asked-for words a dish actually matches.
  const scored = dishes
    .map((dish) => {
      const haystack = `${dish.name} ${dish.description || ''}`.toLowerCase();
      const hits = words.filter((w) => haystack.includes(w.toLowerCase())).length;
      return { ...dish, restaurant: byId.get(String(dish.restaurantId)), matchedWords: hits };
    })
    .sort((a, b) => b.matchedWords - a.matchedWords || a.price - b.price)
    .slice(0, limit);

  return scored;
}

/** Parses and searches in one step. */
export async function naturalSearch(query, options = {}) {
  const { filters, parsedBy } = await parseQuery(query, options);
  const dishes = await searchDishes(filters, options);
  return { filters, parsedBy, dishes };
}
