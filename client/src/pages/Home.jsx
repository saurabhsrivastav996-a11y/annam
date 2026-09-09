import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, HeartHandshake, Eye, UtensilsCrossed, Navigation } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { useGeolocation } from '../hooks/useGeolocation.js';
import RestaurantCard from '../components/RestaurantCard.jsx';
import ReelsRail from '../components/ReelsRail.jsx';
import { Button, CardSkeleton, EmptyState } from '../components/ui.jsx';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'veg', label: 'Pure Veg' },
  { key: 'non-veg', label: 'Non-Veg' },
];

export default function Home() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const { position, status: geoStatus, request: askForLocation } = useGeolocation();

  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (category !== 'all') params.set('category', category);
    if (position) {
      // With coordinates the server sorts by proximity and quotes distances.
      params.set('lat', position.lat);
      params.set('lng', position.lng);
      params.set('radius', 50000);
    }
    const qs = params.toString();
    return `/restaurants${qs ? `?${qs}` : ''}`;
  }, [query, category, position]);

  const { data: restaurants, loading } = useFetch(path);
  const { data: reels } = useFetch('/reels?limit=12');
  const { data: stats } = useFetch('/donations/stats');

  const reelCounts = useMemo(() => {
    const map = {};
    (reels || []).forEach((r) => {
      const id = r.restaurantId?._id;
      if (id) map[id] = (map[id] || 0) + 1;
    });
    return map;
  }, [reels]);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-stone-200 bg-gradient-to-b from-saffron-50 to-stone-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-saffron-700 ring-1 ring-saffron-200">
            <Sparkles size={13} /> Watch it cook before you order
          </p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold leading-tight text-stone-900 sm:text-5xl">
            Scroll into flavour.
          </h1>
          <p className="mt-3 max-w-xl text-stone-600">
            Annam turns food discovery into a feed. See dishes being made, peek into the kitchens
            behind them, and let surplus food find people instead of bins.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search.trim());
            }}
            className="mt-6 flex max-w-lg gap-2"
          >
            <div className="relative flex-1">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search restaurants or cuisines…"
                aria-label="Search restaurants"
                className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100"
              />
            </div>
            <Button type="submit" size="lg">Search</Button>
          </form>

          {stats && (
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <span className="text-stone-600">
                <strong className="text-lg font-semibold text-leaf-700">{stats.mealsRescued}</strong> meals rescued
              </span>
              <span className="text-stone-600">
                <strong className="text-lg font-semibold text-saffron-600">{stats.openDonations}</strong> donations awaiting pickup
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
        {/* Reels */}
        {reels?.length > 0 && (
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-stone-900">Food Reels</h2>
                <p className="text-sm text-stone-500">Tap a reel to watch full screen, then order from that kitchen.</p>
              </div>
              <Link to="/reels" className="shrink-0 text-sm font-medium text-saffron-600 hover:underline">
                See all
              </Link>
            </div>
            <ReelsRail reels={reels} />
          </section>
        )}

        {/* Annadevta strip */}
        <section className="overflow-hidden rounded-2xl border border-leaf-200 bg-leaf-50">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-leaf-600 text-white">
                <HeartHandshake size={24} />
              </span>
              <div>
                <h2 className="font-display text-xl font-bold text-leaf-900">Annadevta</h2>
                <p className="mt-1 max-w-xl text-sm text-leaf-800">
                  Restaurants post the food they would otherwise throw away. Volunteers nearby pick it
                  up and get it to people who need it.
                </p>
              </div>
            </div>
            <Button as={Link} to="/annadevta" variant="leaf" size="lg" className="shrink-0">
              Open Annadevta
            </Button>
          </div>
        </section>

        {/* Restaurants */}
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-stone-900">
                {query ? `Results for “${query}”` : position ? 'Nearest to you' : 'Restaurants'}
              </h2>
              {position ? (
                <p className="mt-0.5 text-xs text-stone-500">
                  Sorted by distance. Times are estimates, not a routed ETA.
                </p>
              ) : (
                <button
                  onClick={askForLocation}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-saffron-600 hover:underline"
                >
                  <Navigation size={12} />
                  {geoStatus === 'denied'
                    ? 'Location blocked — allow it to see distances'
                    : geoStatus === 'locating'
                      ? 'Finding you…'
                      : 'Use my location to show distance and delivery time'}
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    category === c.key
                      ? 'bg-stone-900 text-white'
                      : 'border border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : restaurants?.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {restaurants.map((r) => (
                <RestaurantCard key={r._id} restaurant={r} reelCount={reelCounts[r._id] || 0} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={UtensilsCrossed}
              title="No restaurants matched"
              hint="Try a different search term or clear the category filter."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setQuery('');
                    setCategory('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </section>

        {/* Value props */}
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Sparkles, title: 'Discover by video', body: 'Short cooking reels replace flat menu photos, so you know what you are getting.' },
            { icon: Eye, title: 'See the kitchen', body: 'Participating restaurants stream their kitchen, so hygiene is something you check, not hope for.' },
            { icon: HeartHandshake, title: 'Nothing wasted', body: 'Surplus food is posted for volunteers instead of being binned at closing time.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-stone-200 bg-white p-5">
              <Icon className="size-6 text-saffron-500" />
              <h3 className="mt-3 font-semibold text-stone-900">{title}</h3>
              <p className="mt-1 text-sm text-stone-600">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
