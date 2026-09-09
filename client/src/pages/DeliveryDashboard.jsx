import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, MapPin, Navigation, Phone, Radio, Package, Clock } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getSocket } from '../services/socket.js';
import { formatDistance, formatDuration } from '../hooks/useGeolocation.js';
import api, { errMsg } from '../services/api.js';
import MapView from '../components/MapView.jsx';
import { Badge, Button, EmptyState, Field, PageLoader, inputCls, rupees } from '../components/ui.jsx';

// Fallback path used when the browser denies geolocation, so the demo still
// shows a courier moving on the customer's map.
const SIM_ROUTE = [
  [12.9784, 77.6408], [12.9770, 77.6380], [12.9756, 77.6350],
  [12.9742, 77.6320], [12.9730, 77.6290], [12.9719, 77.6260],
];

export default function DeliveryDashboard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { data: orderPage, loading, reload } = useFetch('/orders');
  const orders = orderPage?.items;
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [otp, setOtp] = useState('');
  const timers = useRef({});

  // Stop any location broadcast when leaving the page.
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((stop) => stop?.());
  }, []);

  if (loading) return <PageLoader label="Loading deliveries…" />;

  const available = (orders || []).filter((o) => !o.deliveryId && o.status === 'Ready');
  const mine = (orders || []).filter((o) => o.deliveryId && !['Delivered', 'Cancelled'].includes(o.status));
  const done = (orders || []).filter((o) => o.status === 'Delivered');
  const earnings = done.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);

  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      if (message) toast(message, 'success');
      reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleAvailability = () =>
    run(async () => {
      const { data } = await api.put('/orders/availability', { isAvailable: !user.isAvailable });
      setUser({ ...user, isAvailable: data.isAvailable });
    });

  /** Streams GPS (or a simulated route) to everyone watching this order. */
  const startSharing = (orderId) => {
    const socket = getSocket();
    setSharing(orderId);

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        ({ coords }) => socket.emit('locationUpdate', { orderId, lat: coords.latitude, lng: coords.longitude }),
        () => {
          toast('Location denied — sending a simulated route instead', 'info');
          startSimulated(orderId, socket);
        },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      timers.current[orderId] = () => navigator.geolocation.clearWatch(watchId);
    } else {
      startSimulated(orderId, socket);
    }
    toast('Sharing your location with the customer', 'success');
  };

  const startSimulated = (orderId, socket) => {
    let i = 0;
    const interval = setInterval(() => {
      const [lat, lng] = SIM_ROUTE[i % SIM_ROUTE.length];
      socket.emit('locationUpdate', { orderId, lat, lng });
      i += 1;
    }, 3000);
    timers.current[orderId] = () => clearInterval(interval);
  };

  const stopSharing = (orderId) => {
    timers.current[orderId]?.();
    delete timers.current[orderId];
    setSharing(null);
  };

  const OrderCard = ({ order, claimable }) => {
    const [rLng, rLat] = order.restaurantId?.location?.coordinates || [];
    const [dLng, dLat] = order.deliveryLocation?.coordinates || [];
    const markers = [
      rLat != null && { lat: rLat, lng: rLng, kind: 'restaurant', label: order.restaurantId?.name },
      dLat != null && { lat: dLat, lng: dLng, kind: 'home', label: 'Drop-off' },
    ].filter(Boolean);

    return (
      <li className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-stone-900">#{order._id.slice(-6).toUpperCase()}</p>
            <p className="text-sm text-stone-500">{order.restaurantId?.name}</p>
          </div>
          <Badge status={order.status} />
        </div>

        <div className="mt-3 space-y-1.5 text-sm text-stone-600">
          <p className="flex items-start gap-1.5">
            <MapPin size={14} className="mt-0.5 shrink-0 text-saffron-500" />
            <span><strong className="text-stone-800">Pick up:</strong> {order.restaurantId?.address}</span>
          </p>
          <p className="flex items-start gap-1.5">
            <Navigation size={14} className="mt-0.5 shrink-0 text-leaf-600" />
            <span><strong className="text-stone-800">Drop off:</strong> {order.deliveryAddress}</span>
          </p>
          {order.customerId?.phone && !claimable && (
            <p className="flex items-center gap-1.5">
              <Phone size={14} className="shrink-0 text-stone-400" />
              <a href={`tel:${order.customerId.phone}`} className="hover:underline">
                {order.customerId.name} · {order.customerId.phone}
              </a>
            </p>
          )}
        </div>

        {!claimable && markers.length > 0 && <MapView markers={markers} route height={180} className="mt-3" />}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
            <span>
              Payout <strong className="text-stone-900">{rupees(order.deliveryFee)}</strong>
            </span>
            {order.legKm?.drop != null && (
              <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                <MapPin size={12} /> {formatDistance(order.legKm.drop)} run
              </span>
            )}
            {order.dropMinutes != null && (
              <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                <Clock size={12} /> ~{formatDuration(order.dropMinutes)}
              </span>
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            {claimable && (
              <Button size="sm" busy={busy} onClick={() => run(() => api.put(`/orders/${order._id}/accept`), 'Order claimed')}>
                Claim delivery
              </Button>
            )}

            {!claimable && order.status === 'Ready' && (
              <div className="flex items-end gap-2">
                <Field label="Pickup OTP">
                  <input
                    className={`${inputCls} w-28`}
                    inputMode="numeric"
                    maxLength={4}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="4 digits"
                  />
                </Field>
                <Button
                  size="sm"
                  busy={busy}
                  onClick={() =>
                    run(async () => {
                      await api.put(`/orders/${order._id}/status`, { status: 'OutForDelivery', otp });
                      setOtp('');
                      startSharing(order._id);
                    }, 'Picked up — on the way')
                  }
                >
                  Confirm pickup
                </Button>
              </div>
            )}

            {!claimable && order.status === 'OutForDelivery' && (
              <>
                {sharing === order._id ? (
                  <Button size="sm" variant="outline" onClick={() => stopSharing(order._id)}>
                    <Radio size={14} className="animate-pulse text-red-500" /> Stop sharing
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => startSharing(order._id)}>
                    <Radio size={14} /> Share location
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="leaf"
                  busy={busy}
                  onClick={() =>
                    run(async () => {
                      await api.put(`/orders/${order._id}/status`, { status: 'Delivered' });
                      stopSharing(order._id);
                    }, 'Delivered — nice work')
                  }
                >
                  Mark delivered
                </Button>
              </>
            )}

            <Button as={Link} to={`/order/${order._id}`} size="sm" variant="ghost">Details</Button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">Deliveries</h1>
          <p className="mt-1 text-sm text-stone-600">
            {done.length} completed · {rupees(earnings)} earned
          </p>
        </div>
        <Button variant={user.isAvailable ? 'leaf' : 'outline'} busy={busy} onClick={toggleAvailability}>
          <Bike size={16} /> {user.isAvailable ? 'Online' : 'Go online'}
        </Button>
      </div>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Your active deliveries</h2>
          {mine.length ? (
            <ul className="grid gap-3">{mine.map((o) => <OrderCard key={o._id} order={o} />)}</ul>
          ) : (
            <EmptyState icon={Bike} title="No active delivery" hint="Claim one from the list below." />
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Available to claim</h2>
          {available.length ? (
            <ul className="grid gap-3">{available.map((o) => <OrderCard key={o._id} order={o} claimable />)}</ul>
          ) : (
            <EmptyState icon={Package} title="Nothing ready right now" hint="Orders appear here once a kitchen marks them ready." />
          )}
        </section>

        {done.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Completed</h2>
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {done.map((o) => (
                <li key={o._id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span className="text-stone-600">
                    #{o._id.slice(-6).toUpperCase()} · {o.restaurantId?.name}
                  </span>
                  <span className="font-medium text-leaf-700">+{rupees(o.deliveryFee)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
