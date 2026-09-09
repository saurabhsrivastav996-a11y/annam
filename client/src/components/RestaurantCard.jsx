import { Link } from 'react-router-dom';
import { Video, Eye } from 'lucide-react';
import { Stars, VegDot } from './ui.jsx';
import FoodImage from './FoodImage.jsx';

export default function RestaurantCard({ restaurant, reelCount = 0 }) {
  const { _id, name, cuisineType, imageUrl, rating, ratingCount, isTransparentKitchen, category, isOpen } = restaurant;

  return (
    <Link
      to={`/restaurant/${_id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-0.5 hover:border-saffron-200 hover:shadow-lg"
    >
      <div className="relative h-40 overflow-hidden bg-stone-100">
        <FoodImage
          src={imageUrl}
          alt={name}
          fallback="🍽️"
          className="size-full"
          imgClassName="transition duration-300 group-hover:scale-105"
        />

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {isTransparentKitchen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-leaf-600/95 px-2 py-1 text-[11px] font-medium text-white">
              <Eye size={11} /> Live kitchen
            </span>
          )}
          {reelCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
              <Video size={11} /> {reelCount}
            </span>
          )}
        </div>

        {isOpen === false && (
          <div className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold text-stone-700">
            Currently closed
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight text-stone-900 group-hover:text-saffron-700">{name}</h3>
          {category !== 'both' && <VegDot category={category} />}
        </div>
        <p className="text-sm text-stone-500">{cuisineType}</p>
        <div className="mt-auto pt-2">
          {ratingCount > 0 ? (
            <Stars value={rating} count={ratingCount} />
          ) : (
            <span className="text-xs text-stone-400">No ratings yet</span>
          )}
        </div>
      </div>
    </Link>
  );
}
