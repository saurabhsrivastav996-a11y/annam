import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Sparkles, UtensilsCrossed, Plus, Wand2 } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import FoodImage from '../components/FoodImage.jsx';
import { Button, EmptyState, PageLoader, Stars, VegDot, inputCls, rupees } from '../components/ui.jsx';

/** Turns the parsed filters back into something a human can check. */
function readBack(filters) {
  if (!filters) return [];
  const chips = [];
  if (filters.dietary) chips.push(filters.dietary === 'veg' ? 'Vegetarian' : 'Non-veg');
  if (filters.spicy === true) chips.push('Spicy');
  if (filters.spicy === false) chips.push('Mild');
  if (filters.maxPrice) chips.push(`Under ${rupees(filters.maxPrice)}`);
  if (filters.minPrice) chips.push(`Over ${rupees(filters.minPrice)}`);
  if (filters.cuisine) chips.push(filters.cuisine);
  return chips;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [draft, setDraft] = useState(q);

  const { data: config } = useFetch('/search/config');
  const { data, loading } = useFetch(q.length >= 2 ? `/search?q=${encodeURIComponent(q)}` : null, {
    skip: q.length < 2,
  });

  const { addItem } = useCart();
  const toast = useToast();
  const [pending, setPending] = useState(null);

  const add = (dish, force = false) => {
    const result = addItem(dish.restaurant, dish, 1, { force });
    if (result === 'conflict') return setPending(dish);
    toast(`${dish.name} added to cart`, 'success');
    setPending(null);
  };

  const chips = readBack(data?.filters);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-stone-900">Search</h1>
      <p className="mt-1 text-sm text-stone-600">
        {config?.hint || 'Search dishes by name, price or diet.'}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParams(draft.trim() ? { q: draft.trim() } : {});
        }}
        className="mt-5 flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              config?.naturalLanguage ? 'Something spicy under ₹300…' : 'Veg under 300, paneer, dosa…'
            }
            aria-label="Search dishes"
            className={`${inputCls} py-2.5 pl-10`}
          />
        </div>
        <Button type="submit" size="lg">Search</Button>
      </form>

      {/* What we understood — so a wrong read is obvious rather than mysterious. */}
      {q && chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-500">Looking for:</span>
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1 rounded-full bg-saffron-50 px-2.5 py-1 text-xs font-medium text-saffron-700 ring-1 ring-saffron-200"
            >
              <Sparkles size={11} /> {chip}
            </span>
          ))}
          {data?.parsedBy === 'claude' && (
            <span className="inline-flex items-center gap-1 text-xs text-stone-400">
              <Wand2 size={11} /> understood by Claude
            </span>
          )}
        </div>
      )}

      {!q ? (
        <div className="mt-8">
          <EmptyState
            icon={Search}
            title="What are you in the mood for?"
            hint={
              config?.naturalLanguage
                ? 'Try “something spicy under ₹300” or “light veg dinner”.'
                : 'Try “veg under 300” or “paneer”.'
            }
          />
        </div>
      ) : loading ? (
        <PageLoader label="Searching the menus…" />
      ) : !data?.dishes?.length ? (
        <div className="mt-8">
          <EmptyState
            icon={UtensilsCrossed}
            title={`Nothing matched “${q}”`}
            hint="Try fewer words, or raise the price limit."
            action={<Button as={Link} to="/">Browse restaurants</Button>}
          />
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-stone-500">
            {data.count} dish{data.count === 1 ? '' : 'es'} across{' '}
            {new Set(data.dishes.map((d) => d.restaurant?._id)).size} kitchens
          </p>

          <ul className="mt-3 divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {data.dishes.map((dish) => (
              <li key={dish._id} className="flex items-center gap-4 p-4">
                <FoodImage
                  src={dish.imageUrl}
                  alt={dish.name}
                  className="size-16 shrink-0 overflow-hidden rounded-xl"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <VegDot category={dish.category} />
                    <h3 className="truncate font-medium text-stone-900">{dish.name}</h3>
                  </div>
                  {dish.description && (
                    <p className="mt-0.5 line-clamp-1 text-sm text-stone-500">{dish.description}</p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                    <Link
                      to={`/restaurant/${dish.restaurant?._id}`}
                      className="font-medium text-saffron-600 hover:underline"
                    >
                      {dish.restaurant?.name}
                    </Link>
                    {dish.restaurant?.ratingCount > 0 && (
                      <Stars value={dish.restaurant.rating} count={dish.restaurant.ratingCount} />
                    )}
                  </p>
                </div>

                <p className="shrink-0 font-semibold text-stone-900">{rupees(dish.price)}</p>

                <Button size="sm" onClick={() => add(dish)}>
                  <Plus size={15} /> Add
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {pending && (
        <div className="fixed inset-0 z-[800] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="font-semibold text-stone-900">Start a new cart?</h3>
            <p className="mt-2 text-sm text-stone-600">
              An order goes to one kitchen, so adding {pending.name} will clear your current cart.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>Keep cart</Button>
              <Button className="flex-1" onClick={() => add(pending, true)}>Start new</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
