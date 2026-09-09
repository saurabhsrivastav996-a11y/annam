import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, Phone, Star, KeyRound, Radio } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getSocket } from '../services/socket.js';
import api, { errMsg } from '../services/api.js';
import MapView from '../components/MapView.jsx';
import { Badge, Button, PageLoader, rupees } from '../components/ui.jsx';

const STEPS = ['Placed', 'Accepted', 'Preparing', 'Ready', 'OutForDelivery', 'Delivered'];
const LABELS = {
  Placed: 'Order placed',
  Accepted: 'Restaurant accepted',
  Preparing: 'Being cooked',
  Ready: 'Ready for pickup',
  OutForDelivery: 'On the way',
  Delivered: 'Delivered',
};

export default function OrderTrackingPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data: order, setData: setOrder, loading, error, reload } = useFetch(`/orders/${id}`);

  const [courierPos, setCourierPos] = useState(null);
  const [otp, setOtp] = useState(null);
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);

  const isCustomer = order && user && order.customerId?._id === user.id;

  // Live status + courier position for this order.
  useEffect(() => {
    if (!id) return;
    const socket = getSocket();

    const onStatus = ({ orderId, status }) => {
      if (orderId !== id) return;
      setOrder((prev) => (prev ? { ...prev, status } : prev));
      toast(`Order update: ${LABELS[status] || status}`, 'info');
    };
    const onLocation = ({ orderId, lat, lng }) => {
      if (orderId === id) setCourierPos({ lat, lng });
    };
    const onAssigned = ({ orderId }) => orderId === id && reload();

    const join = () => socket.emit('joinOrderRoom', id);
    join();
    socket.on('connect', join);
    socket.on('order:status', onStatus);
    socket.on('newLocation', onLocation);
    socket.on('order:assigned', onAssigned);

    return () => {
      socket.emit('leaveOrderRoom', id);
      socket.off('connect', join);
      socket.off('order:status', onStatus);
      socket.off('newLocation', onLocation);
      socket.off('order:assigned', onAssigned);
    };
  }, [id, setOrder, reload, toast]);

  // The customer needs the pickup OTP once the food is ready. Reading the status
  // into a variable keeps the dependency list honest.
  const orderStatus = order?.status;
  useEffect(() => {
    if (!isCustomer) return;
    if (!['Ready', 'OutForDelivery'].includes(orderStatus)) return;
    api.get(`/orders/${id}/otp`).then(({ data }) => setOtp(data.otp)).catch(() => {});
  }, [isCustomer, orderStatus, id]);

  if (loading) return <PageLoader label="Fetching your order…" />;
  if (error || !order) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-stone-800">Order not available</h1>
        <p className="mt-2 text-sm text-stone-600">{error}</p>
        <Button as={Link} to="/orders" className="mt-4">My orders</Button>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(order.status);
  const cancelled = order.status === 'Cancelled';

  const [rLng, rLat] = order.restaurantId?.location?.coordinates || [];
  const [dLng, dLat] = order.deliveryLocation?.coordinates || [];
  const markers = [
    rLat != null && { lat: rLat, lng: rLng, kind: 'restaurant', label: order.restaurantId?.name },
    courierPos && { lat: courierPos.lat, lng: courierPos.lng, kind: 'courier', label: 'Your courier' },
    dLat != null && { lat: dLat, lng: dLng, kind: 'home', label: 'Delivery address' },
  ].filter(Boolean);

  const submitRating = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/orders/${id}/rate`, { rating });
      setOrder(data);
      toast('Thanks for rating!', 'success');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">
            {cancelled ? 'Order cancelled' : LABELS[order.status]}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Order #{order._id.slice(-6).toUpperCase()} · {order.restaurantId?.name}
          </p>
        </div>
        <Badge status={order.status} />
      </div>

      {/* Progress */}
      {!cancelled && (
        <ol className="mt-8 grid grid-cols-3 gap-y-6 sm:grid-cols-6">
          {STEPS.map((step, i) => {
            const done = i <= stepIndex;
            const current = i === stepIndex;
            return (
              <li key={step} className="flex flex-col items-center gap-2 text-center">
                <span
                  className={`grid size-9 place-items-center rounded-full border-2 transition ${
                    done ? 'border-leaf-600 bg-leaf-600 text-white' : 'border-stone-300 bg-white text-stone-400'
                  } ${current ? 'ring-4 ring-leaf-100' : ''}`}
                >
                  {done ? <Check size={16} /> : <span className="text-xs">{i + 1}</span>}
                </span>
                <span className={`text-[11px] leading-tight ${done ? 'font-medium text-stone-800' : 'text-stone-400'}`}>
                  {LABELS[step]}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Pickup OTP */}
      {isCustomer && otp && order.status !== 'Delivered' && (
        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-saffron-200 bg-saffron-50 p-4">
          <KeyRound className="size-5 shrink-0 text-saffron-600" />
          <div>
            <p className="text-sm font-medium text-saffron-900">Pickup code: <span className="font-mono text-lg tracking-widest">{otp}</span></p>
            <p className="text-xs text-saffron-800">Share this with your delivery partner at handover.</p>
          </div>
        </div>
      )}

      {/* Map */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-stone-900">
          Live tracking
          {order.status === 'OutForDelivery' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
              <Radio size={11} className="animate-pulse" /> live
            </span>
          )}
        </h2>
        <MapView markers={markers} route height={340} />
        {order.status === 'OutForDelivery' && !courierPos && (
          <p className="mt-2 text-sm text-stone-500">
            Waiting for the courier&apos;s first location ping…
          </p>
        )}
      </section>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {/* Items */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-800">Items</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.items.map((i) => (
              <li key={i.foodId} className="flex justify-between gap-2">
                <span className="text-stone-600">{i.qty} × {i.name}</span>
                <span className="font-medium">{rupees(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-stone-200 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-stone-600">Subtotal</dt><dd>{rupees(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-600">Delivery</dt><dd>{rupees(order.deliveryFee)}</dd></div>
            <div className="flex justify-between border-t border-stone-200 pt-1.5 font-bold">
              <dt>Total</dt><dd>{rupees(order.total)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-stone-500">
            {order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Card (demo)'} · {order.paymentStatus}
          </p>
        </section>

        {/* Delivery details */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-800">Delivery</h2>
          <p className="mt-2 text-sm text-stone-600">{order.deliveryAddress}</p>

          {order.deliveryId ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-stone-50 p-3">
              <span className="grid size-9 place-items-center rounded-full bg-saffron-100 text-sm font-semibold text-saffron-700">
                {order.deliveryId.name?.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-900">{order.deliveryId.name}</p>
                <p className="text-xs text-stone-500">Your delivery partner</p>
              </div>
              {order.deliveryId.phone && (
                <a
                  href={`tel:${order.deliveryId.phone}`}
                  className="ml-auto rounded-lg border border-stone-300 p-2 text-stone-600 hover:bg-white"
                  aria-label="Call delivery partner"
                >
                  <Phone size={15} />
                </a>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">No delivery partner assigned yet.</p>
          )}
        </section>
      </div>

      {/* Rating */}
      {isCustomer && order.status === 'Delivered' && (
        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-800">
            {order.rating ? 'You rated this order' : 'How was it?'}
          </h2>
          <div className="mt-3 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                disabled={Boolean(order.rating)}
                onClick={() => setRating(n)}
                aria-label={`${n} stars`}
                className="disabled:cursor-default"
              >
                <Star
                  size={26}
                  className={
                    n <= (order.rating || rating)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-stone-300 hover:text-amber-300'
                  }
                />
              </button>
            ))}
          </div>
          {!order.rating && (
            <Button className="mt-3" busy={busy} disabled={!rating} onClick={submitRating}>
              Submit rating
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
