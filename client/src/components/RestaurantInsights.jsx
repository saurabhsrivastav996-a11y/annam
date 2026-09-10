import { useState } from 'react';
import { IndianRupee, PackageCheck, Receipt, Undo2, Star, Clock } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { EmptyState, PageLoader, Stars, rupees } from './ui.jsx';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/** "2026-09-10" → "10 Sep", in the reader's own words rather than ISO. */
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "14" → "2 pm". Nobody staffs a kitchen by 24-hour clock. */
function hourLabel(hour) {
  if (hour === 0) return '12 am';
  if (hour === 12) return '12 pm';
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

function StatCard({ icon: Icon, label, value, hint, tone = 'saffron' }) {
  const tones = {
    saffron: 'text-saffron-500',
    leaf: 'text-leaf-600',
    stone: 'text-stone-400',
  };
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <Icon size={18} className={tones[tone]} />
      <p className="mt-2 text-2xl font-bold text-stone-900">{value}</p>
      <p className="text-sm text-stone-500">{label}</p>
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}

/**
 * Daily revenue as bars.
 *
 * Every day in the window gets a column, including the ones with no orders —
 * the API pads them deliberately. A quiet Tuesday should read as a gap in
 * trade, not vanish and let the chart draw straight over it.
 */
function RevenueChart({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.revenue));
  const busiest = daily.reduce((best, d) => (d.revenue > best.revenue ? d : best), daily[0]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-800">Revenue by day</h3>
        {busiest?.revenue > 0 && (
          <p className="text-xs text-stone-500">
            Best day {shortDate(busiest.date)} · {rupees(busiest.revenue)}
          </p>
        )}
      </div>

      <div className="mt-4 flex h-40 items-end gap-[2px]" data-chart="revenue">
        {daily.map((d) => (
          <div
            key={d.date}
            className="flex h-full flex-1 items-end rounded-sm bg-stone-50"
            title={`${shortDate(d.date)} — ${rupees(d.revenue)} from ${d.orders} order${d.orders === 1 ? '' : 's'}`}
          >
            <div
              className="w-full rounded-sm bg-saffron-400 transition-colors hover:bg-saffron-500"
              style={{ height: `${(d.revenue / max) * 100}%` }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between text-xs text-stone-400">
        <span>{shortDate(daily[0].date)}</span>
        <span>{shortDate(daily.at(-1).date)}</span>
      </div>
    </div>
  );
}

function TopDishes({ dishes }) {
  const max = Math.max(1, ...dishes.map((d) => d.qty));

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-stone-800">Best sellers</h3>
      {dishes.length ? (
        <ul className="mt-3 space-y-2.5">
          {dishes.map((d) => (
            <li key={d.name} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-stone-700">{d.name}</span>
                <span className="shrink-0 text-stone-500">
                  <span className="font-medium text-stone-900">{d.qty}</span> sold ·{' '}
                  {rupees(d.revenue)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-leaf-500"
                  style={{ width: `${(d.qty / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-stone-500">Nothing delivered yet in this window.</p>
      )}
    </div>
  );
}

/** When orders actually arrive, which is a staffing question. */
function BusiestHours({ byHour }) {
  const max = Math.max(1, ...byHour.map((h) => h.orders));
  const peak = byHour.reduce((best, h) => (h.orders > best.orders ? h : best), byHour[0]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-800">When orders come in</h3>
        {peak.orders > 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-stone-500">
            <Clock size={11} /> Busiest at {hourLabel(peak.hour)}
          </p>
        )}
      </div>

      <div className="mt-4 flex h-24 items-end gap-[2px]">
        {byHour.map((h) => (
          <div
            key={h.hour}
            className="flex h-full flex-1 items-end rounded-sm bg-stone-50"
            title={`${hourLabel(h.hour)} — ${h.orders} order${h.orders === 1 ? '' : 's'}`}
          >
            <div
              className="w-full rounded-sm bg-saffron-300"
              style={{ height: `${(h.orders / max) * 100}%` }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between text-xs text-stone-400">
        <span>12 am</span>
        <span>12 pm</span>
        <span>11 pm</span>
      </div>
    </div>
  );
}

function RatingBreakdown({ ratings }) {
  const max = Math.max(1, ...Object.values(ratings.distribution));

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-800">Ratings</h3>
        <span className="text-xs text-stone-500">
          {ratings.lifetimeCount > 0 ? (
            <>
              All time <Stars value={ratings.lifetime} count={ratings.lifetimeCount} />
            </>
          ) : (
            'No ratings yet'
          )}
        </span>
      </div>

      {ratings.inWindowCount > 0 ? (
        <>
          <p className="mt-3 text-sm text-stone-600">
            <span className="text-xl font-bold text-stone-900">{ratings.inWindow}</span> average
            across {ratings.inWindowCount} rated order
            {ratings.inWindowCount === 1 ? '' : 's'} in this window
          </p>
          <ul className="mt-3 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => (
              <li key={star} className="flex items-center gap-2 text-sm">
                <span className="flex w-8 shrink-0 items-center gap-0.5 text-stone-500">
                  {star} <Star size={11} className="fill-amber-400 text-amber-400" />
                </span>
                <div className="h-1.5 flex-1 rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${(ratings.distribution[star] / max) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-stone-500">
                  {ratings.distribution[star]}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-stone-500">
          Nobody rated an order in this window.
        </p>
      )}
    </div>
  );
}

export default function RestaurantInsights() {
  const [days, setDays] = useState(30);
  const { data, loading } = useFetch(`/restaurants/mine/analytics?days=${days}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          Your own trade. Revenue counts the food only — the ₹30 delivery fee is not yours.
        </p>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-full px-3 py-1 text-sm transition ${
                days === r.days
                  ? 'bg-saffron-500 text-white'
                  : 'border border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <PageLoader label="Counting up the last few weeks…" />
      ) : data.totals.orders === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No orders in this window"
          hint="Once orders start arriving, revenue, best sellers and your busiest hours show up here."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={IndianRupee}
              label="Revenue"
              value={rupees(data.totals.revenue)}
              hint="Delivered orders only"
            />
            <StatCard
              icon={PackageCheck}
              label="Orders delivered"
              value={data.totals.delivered}
              hint={`${data.totals.orders} placed in total`}
              tone="leaf"
            />
            <StatCard
              icon={Receipt}
              label="Average order"
              value={rupees(data.totals.averageOrder)}
              hint="Across delivered orders"
            />
            <StatCard
              icon={Undo2}
              label="Cancelled"
              value={`${data.totals.cancellationRate}%`}
              hint={`${data.totals.cancelled} of ${data.totals.orders} orders`}
              tone="stone"
            />
          </div>

          <RevenueChart daily={data.daily} />

          <div className="grid gap-4 lg:grid-cols-2">
            <TopDishes dishes={data.topDishes} />
            <BusiestHours byHour={data.byHour} />
          </div>

          <RatingBreakdown ratings={data.ratings} />
        </>
      )}
    </div>
  );
}
