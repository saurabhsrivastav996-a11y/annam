import { Link } from 'react-router-dom';
import { Star, Loader2 } from 'lucide-react';

export function Spinner({ className = '' }) {
  return <Loader2 className={`animate-spin ${className}`} aria-label="Loading" />;
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-stone-500">
      <Spinner className="size-7 text-saffron-500" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="shimmer h-40 w-full" />
      <div className="space-y-2 p-4">
        <div className="shimmer h-4 w-2/3 rounded" />
        <div className="shimmer h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      {Icon && <Icon className="size-10 text-stone-300" />}
      <div>
        <p className="font-medium text-stone-700">{title}</p>
        {hint && <p className="mt-1 text-sm text-stone-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

const VARIANTS = {
  primary: 'bg-saffron-500 text-white hover:bg-saffron-600 focus-visible:outline-saffron-500',
  leaf: 'bg-leaf-600 text-white hover:bg-leaf-700 focus-visible:outline-leaf-600',
  outline: 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 focus-visible:outline-stone-400',
  ghost: 'text-stone-600 hover:bg-stone-100 focus-visible:outline-stone-400',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:outline-red-400',
};

const SIZES = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base' };

export function Button({ as: Tag = 'button', variant = 'primary', size = 'md', busy, className = '', children, ...props }) {
  return (
    <Tag
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy && <Spinner className="size-4" />}
      {children}
    </Tag>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-stone-400 focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100';

export function Stars({ value = 0, count, size = 14 }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-stone-600">
      <Star size={size} className="fill-amber-400 text-amber-400" />
      <span className="font-medium">{Number(value).toFixed(1)}</span>
      {count != null && <span className="text-stone-400">({count})</span>}
    </span>
  );
}

const TONES = {
  Placed: 'bg-stone-100 text-stone-700',
  Accepted: 'bg-blue-100 text-blue-700',
  Preparing: 'bg-amber-100 text-amber-800',
  Ready: 'bg-violet-100 text-violet-700',
  OutForDelivery: 'bg-saffron-100 text-saffron-800',
  Delivered: 'bg-leaf-100 text-leaf-700',
  Cancelled: 'bg-red-100 text-red-700',
  Posted: 'bg-saffron-100 text-saffron-800',
  Collected: 'bg-blue-100 text-blue-700',
  Completed: 'bg-leaf-100 text-leaf-700',
};

export function Badge({ status, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONES[status] || 'bg-stone-100 text-stone-700'} ${className}`}
    >
      {children ?? String(status).replace(/([A-Z])/g, ' $1').trim()}
    </span>
  );
}

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export function VegDot({ category }) {
  const veg = category === 'veg';
  return (
    <span
      title={veg ? 'Vegetarian' : 'Non-vegetarian'}
      className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border ${veg ? 'border-leaf-600' : 'border-red-600'}`}
    >
      <span className={`size-1.5 rounded-full ${veg ? 'bg-leaf-600' : 'bg-red-600'}`} />
    </span>
  );
}

export function BackLink({ to, children }) {
  return (
    <Link to={to} className="text-sm text-stone-500 underline-offset-4 hover:text-saffron-600 hover:underline">
      {children}
    </Link>
  );
}
