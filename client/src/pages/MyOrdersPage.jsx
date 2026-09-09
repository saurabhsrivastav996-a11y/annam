import { Link } from 'react-router-dom';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, EmptyState, PageLoader, rupees } from '../components/ui.jsx';

const ACTIVE = ['Placed', 'Accepted', 'Preparing', 'Ready', 'OutForDelivery'];

export default function MyOrdersPage() {
  const { user } = useAuth();
  const { data: orders, loading } = useFetch('/orders');

  if (loading) return <PageLoader label="Loading your orders…" />;

  const active = (orders || []).filter((o) => ACTIVE.includes(o.status));
  const past = (orders || []).filter((o) => !ACTIVE.includes(o.status));

  const Row = ({ order }) => (
    <li>
      <Link
        to={`/order/${order._id}`}
        className="flex items-center gap-4 p-4 transition hover:bg-stone-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-stone-900">{order.restaurantId?.name || 'Restaurant'}</p>
            <Badge status={order.status} />
          </div>
          <p className="mt-0.5 truncate text-sm text-stone-500">
            {order.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
          </p>
          <p className="mt-0.5 text-xs text-stone-400">
            #{order._id.slice(-6).toUpperCase()} · {new Date(order.createdAt).toLocaleString('en-IN')}
            {user?.role !== 'customer' && order.customerId?.name ? ` · ${order.customerId.name}` : ''}
          </p>
        </div>
        <p className="shrink-0 font-semibold text-stone-900">{rupees(order.total)}</p>
        <ChevronRight size={18} className="shrink-0 text-stone-400" />
      </Link>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-stone-900">
        {user?.role === 'restaurant' ? 'Kitchen orders' : user?.role === 'delivery' ? 'Deliveries' : 'My orders'}
      </h1>

      {!orders?.length ? (
        <div className="mt-8">
          <EmptyState
            icon={ClipboardList}
            title="No orders yet"
            hint="Once an order is placed it shows up here with live status."
            action={<Button as={Link} to="/">Browse restaurants</Button>}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {active.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">In progress</h2>
              <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                {active.map((o) => <Row key={o._id} order={o} />)}
              </ul>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">History</h2>
              <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                {past.map((o) => <Row key={o._id} order={o} />)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
