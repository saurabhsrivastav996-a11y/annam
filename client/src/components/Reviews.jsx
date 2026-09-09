import { Star, MessageSquare } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { EmptyState, Spinner } from './ui.jsx';
import ReportButton from './ReportButton.jsx';

/** Relative time for recent reviews, falling back to a date for older ones. */
function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function StarRow({ value, size = 14 }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}
        />
      ))}
    </span>
  );
}

export default function Reviews({ restaurantId }) {
  const { data, loading } = useFetch(`/restaurants/${restaurantId}/reviews`);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Spinner className="size-4" /> Loading reviews…
      </div>
    );
  }

  if (!data?.total) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No reviews yet"
        hint="Ratings appear here once customers review a delivered order."
      />
    );
  }

  const withText = data.reviews.filter((r) => r.review);

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      {/* Summary */}
      <div className="h-fit rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-4xl font-bold leading-none text-stone-900">{data.average.toFixed(1)}</p>
        <div className="mt-2">
          <StarRow value={Math.round(data.average)} size={16} />
        </div>
        <p className="mt-1 text-sm text-stone-500">
          {data.total} rating{data.total === 1 ? '' : 's'}
        </p>

        <ul className="mt-4 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = data.counts[star] || 0;
            const pct = data.total ? (count / data.total) * 100 : 0;
            return (
              <li key={star} className="flex items-center gap-2 text-xs text-stone-600">
                <span className="w-3 tabular-nums">{star}</span>
                <Star size={11} className="fill-amber-400 text-amber-400" />
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-5 text-right tabular-nums text-stone-400">{count}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Individual reviews */}
      <div>
        {withText.length ? (
          <ul className="space-y-3">
            {withText.map((r) => (
              <li key={r.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-leaf-100 text-sm font-semibold text-leaf-700">
                    {r.author.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-medium text-stone-900">{r.author}</span>
                  <StarRow value={r.rating} />
                  <span className="text-xs text-stone-400">{timeAgo(r.createdAt)}</span>
                </div>

                <p className="mt-2 text-sm text-stone-700">{r.review}</p>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {r.dishes.length > 0 ? (
                    <p className="text-xs text-stone-500">Ordered: {r.dishes.join(', ')}</p>
                  ) : (
                    <span />
                  )}
                  <ReportButton targetType="review" targetId={r.id} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-6 text-center text-sm text-stone-500">
            {data.total} customer{data.total === 1 ? ' has' : 's have'} rated this kitchen, but nobody
            has written a review yet.
          </p>
        )}
      </div>
    </div>
  );
}
