import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Eye, MapPin, Phone, Plus, ShoppingCart, Video } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { mediaUrl } from '../services/api.js';
import ReelsRail from '../components/ReelsRail.jsx';
import MapView from '../components/MapView.jsx';
import KitchenStream from '../components/KitchenStream.jsx';
import Reviews from '../components/Reviews.jsx';
import { Button, PageLoader, Stars, VegDot, rupees, EmptyState } from '../components/ui.jsx';
import FoodImage from '../components/FoodImage.jsx';

export default function RestaurantPage() {
  const { id } = useParams();
  const { data: restaurant, loading, error } = useFetch(`/restaurants/${id}`);
  const { addItem, cart, count } = useCart();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState(null);

  if (loading) return <PageLoader label="Loading the menu…" />;
  if (error || !restaurant) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-stone-800">Restaurant not found</h1>
        <p className="mt-2 text-sm text-stone-600">{error || 'It may have been removed.'}</p>
        <Button as={Link} to="/" className="mt-4">Back to discover</Button>
      </div>
    );
  }

  const menu = (restaurant.menu || []).filter((m) => filter === 'all' || m.category === filter);
  const [lng, lat] = restaurant.location?.coordinates || [];

  const add = (food, force = false) => {
    const result = addItem(restaurant, food, 1, { force });
    if (result === 'conflict') return setPending(food);
    toast(`${food.name} added to cart`, 'success');
    setPending(null);
  };

  return (
    <>
      {/* Header */}
      <section className="relative h-56 bg-stone-800 sm:h-72">
        {restaurant.imageUrl && (
          <img src={mediaUrl(restaurant.imageUrl)} alt="" className="size-full object-cover opacity-70" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/20" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-5xl px-4 pb-5">
            <div className="flex flex-wrap gap-2">
              {restaurant.isTransparentKitchen && (
                <span className="inline-flex items-center gap-1 rounded-full bg-leaf-600 px-2.5 py-1 text-xs font-medium text-white">
                  <Eye size={12} /> Transparent kitchen
                </span>
              )}
              {restaurant.reels?.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                  <Video size={12} /> {restaurant.reels.length} reels
                </span>
              )}
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">{restaurant.name}</h1>
            <p className="mt-1 text-sm text-white/80">{restaurant.cuisineType}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
              {restaurant.ratingCount > 0 && (
                <span className="rounded-full bg-white px-2 py-0.5">
                  <Stars value={restaurant.rating} count={restaurant.ratingCount} />
                </span>
              )}
              <span className="inline-flex items-center gap-1"><MapPin size={13} /> {restaurant.address}</span>
              {restaurant.phone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {restaurant.phone}</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
        {restaurant.description && <p className="max-w-2xl text-stone-600">{restaurant.description}</p>}

        {restaurant.isTransparentKitchen && (
          <KitchenStream stream={restaurant.kitchenStream} restaurantName={restaurant.name} />
        )}

        {restaurant.reels?.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-xl font-bold text-stone-900">From this kitchen</h2>
            <ReelsRail reels={restaurant.reels.map((r) => ({ ...r, restaurantId: restaurant }))} />
          </section>
        )}

        {/* Menu */}
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-stone-900">Menu</h2>
            <div className="flex gap-1.5">
              {[
                { key: 'all', label: 'All' },
                { key: 'veg', label: 'Veg' },
                { key: 'non-veg', label: 'Non-Veg' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    filter === f.key ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {menu.length ? (
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {menu.map((food) => (
                <li key={food._id} className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <VegDot category={food.category} />
                      <h3 className="truncate font-medium text-stone-900">{food.name}</h3>
                    </div>
                    {food.description && <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">{food.description}</p>}
                    <p className="mt-1 font-semibold text-stone-800">{rupees(food.price)}</p>
                  </div>

                  <FoodImage src={food.imageUrl} alt={food.name} className="relative size-20 shrink-0 overflow-hidden rounded-xl" />

                  <Button
                    size="sm"
                    variant={food.isAvailable === false ? 'outline' : 'primary'}
                    disabled={food.isAvailable === false}
                    onClick={() => add(food)}
                  >
                    <Plus size={15} /> {food.isAvailable === false ? 'Sold out' : 'Add'}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing on the menu here yet" hint="Try a different filter." />
          )}
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-bold text-stone-900">
            Reviews {restaurant.ratingCount > 0 && (
              <span className="text-base font-normal text-stone-500">
                from people who ordered here
              </span>
            )}
          </h2>
          <Reviews restaurantId={restaurant._id} />
        </section>

        {lat != null && (
          <section>
            <h2 className="mb-3 font-display text-xl font-bold text-stone-900">Where to find it</h2>
            <MapView markers={[{ lat, lng, kind: 'restaurant', label: restaurant.name }]} height={280} />
          </section>
        )}
      </div>

      {/* Sticky cart bar */}
      {count > 0 && (
        <div className="sticky bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <p className="text-sm text-stone-600">
              <strong className="text-stone-900">{count}</strong> item{count > 1 ? 's' : ''} from {cart.restaurantName}
            </p>
            <Button as={Link} to="/cart" size="lg">
              <ShoppingCart size={16} /> View cart
            </Button>
          </div>
        </div>
      )}

      {/* Cross-restaurant confirmation */}
      {pending && (
        <div className="fixed inset-0 z-[800] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="font-semibold text-stone-900">Start a new cart?</h3>
            <p className="mt-2 text-sm text-stone-600">
              Your cart has items from <strong>{cart.restaurantName}</strong>. An order goes to one
              kitchen, so adding {pending.name} will clear the current cart.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>Keep cart</Button>
              <Button className="flex-1" onClick={() => add(pending, true)}>Start new</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
