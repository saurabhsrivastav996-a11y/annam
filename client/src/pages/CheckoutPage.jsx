import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CreditCard, Wallet, ShieldCheck, Zap, CalendarClock } from 'lucide-react';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useFetch } from '../hooks/useApi.js';
import { loadRazorpay } from '../services/razorpay.js';
import api, { errMsg } from '../services/api.js';
import { Button, inputCls, rupees } from '../components/ui.jsx';
import AddressPicker from '../components/AddressPicker.jsx';

/** Flattens the stored address object into a single editable line. */
function defaultAddress(user) {
  const a = user?.address;
  if (!a) return '';
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');
}

/** A Date as the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in local time. */
function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CheckoutPage() {
  const { cart, subtotal, deliveryFee, total, count, clear } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // Tells us whether this deployment has Razorpay keys configured.
  const { data: payConfig } = useFetch('/payments/config');
  const onlineEnabled = Boolean(payConfig?.enabled);

  const [address, setAddress] = useState(defaultAddress(user));
  // Set once the address resolves, or the customer moves the pin. Left null
  // when we genuinely do not know, rather than defaulted to a city centre.
  const [position, setPosition] = useState(null);
  const [payment, setPayment] = useState('cod');
  // 'now', or 'later' with a chosen slot. The server decides whether the kitchen
  // can actually make that slot, and names the earliest it can if not.
  const [when, setWhen] = useState('now');
  const [slot, setSlot] = useState('');
  // Picker bounds, read from the clock when the customer opts in rather than
  // during render, so rendering stays pure. The server is the real check anyway.
  const [bounds, setBounds] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Emptying the cart on success would otherwise trip the guard below and
  // bounce the customer to an empty cart instead of their new order.
  const [placed, setPlaced] = useState(false);

  if (!count && !placed) return <Navigate to="/cart" replace />;

  const basket = {
    restaurantId: cart.restaurantId,
    items: cart.items.map(({ foodId, qty }) => ({ foodId, qty })),
    deliveryAddress: address,
    // Only sent once confirmed on the map; otherwise the server geocodes.
    ...(position ? { lat: position.lat, lng: position.lng } : {}),
    ...(when === 'later' && slot ? { scheduledFor: new Date(slot).toISOString() } : {}),
  };

  const done = (order, message) => {
    setPlaced(true);
    navigate(`/order/${order._id}`, { replace: true });
    clear();
    toast(message, 'success');
  };

  /** Cash on delivery and the simulated card both just create the order. */
  const placeDirectOrder = async () => {
    const { data } = await api.post('/orders', { ...basket, paymentMethod: payment });
    done(
      data,
      data.status === 'Scheduled'
        ? 'Order scheduled. The kitchen will start it in time for your slot.'
        : 'Order placed! Track it live.'
    );
  };

  /**
   * Online payment. The server prices the basket and opens a Razorpay order;
   * the real Annam order is only created after the signature verifies, so an
   * abandoned payment never reaches the kitchen.
   */
  const payOnline = async () => {
    const Razorpay = await loadRazorpay();
    const { data: checkout } = await api.post('/payments/checkout', basket);

    await new Promise((resolve) => {
      const rzp = new Razorpay({
        key: checkout.keyId,
        amount: checkout.amountInPaise,
        currency: checkout.currency,
        name: 'Annam',
        description: `Order from ${checkout.restaurantName}`,
        order_id: checkout.razorpayOrderId,
        prefill: { name: user.name, email: user.email, contact: user.phone || '' },
        theme: { color: '#f06106' },
        handler: async (response) => {
          try {
            const { data } = await api.post('/payments/verify', response);
            done(data.order, 'Payment received — your order is in!');
          } catch (err) {
            setError(errMsg(err, 'We could not confirm that payment'));
          } finally {
            resolve();
          }
        },
        modal: {
          ondismiss: () => {
            api
              .post('/payments/abandon', {
                razorpay_order_id: checkout.razorpayOrderId,
                reason: 'Closed the payment window',
              })
              .catch(() => {});
            setError('Payment cancelled. Your cart is still here.');
            resolve();
          },
        },
      });

      rzp.on('payment.failed', ({ error: rzpError }) => {
        setError(rzpError?.description || 'The payment failed. Try another method.');
      });

      rzp.open();
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (when === 'later' && !slot) {
      setError('Pick a delivery time, or choose as soon as possible.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (payment === 'razorpay') await payOnline();
      else await placeDirectOrder();
    } catch (err) {
      setError(errMsg(err, 'Could not place your order'));
    } finally {
      setBusy(false);
    }
  };

  const methods = [
    { key: 'cod', label: 'Cash on delivery', icon: Wallet, note: 'Pay the courier' },
    onlineEnabled
      ? { key: 'razorpay', label: 'Pay online', icon: CreditCard, note: 'UPI, card, netbanking' }
      : { key: 'mock-card', label: 'Card (demo)', icon: CreditCard, note: 'Simulated, no gateway' },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-stone-900">Checkout</h1>
      <p className="mt-1 text-sm text-stone-600">Ordering from {cart.restaurantName}</p>

      <form onSubmit={submit} className="mt-6 grid gap-6 sm:grid-cols-[1fr_16rem]">
        <div className="space-y-5">
          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <AddressPicker
            address={address}
            onAddressChange={setAddress}
            position={position}
            onPositionChange={setPosition}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700">When</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { key: 'now', label: 'As soon as possible', icon: Zap, note: 'Cooked and sent now' },
                { key: 'later', label: 'Schedule for later', icon: CalendarClock, note: 'Up to 7 days ahead' },
              ].map(({ key, label, icon: Icon, note }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setWhen(key);
                    if (key === 'later') {
                      const now = Date.now();
                      setBounds({
                        min: toLocalInput(new Date(now + 45 * 60 * 1000)),
                        max: toLocalInput(new Date(now + 7 * 24 * 60 * 60 * 1000)),
                      });
                    }
                  }}
                  aria-pressed={when === key}
                  disabled={key === 'later' && payment === 'razorpay'}
                  className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    when === key
                      ? 'border-saffron-400 bg-saffron-50 ring-2 ring-saffron-100'
                      : 'border-stone-300 bg-white hover:bg-stone-50'
                  }`}
                >
                  <Icon size={18} className={when === key ? 'text-saffron-600' : 'text-stone-500'} />
                  <span className="mt-1.5 block text-sm font-medium text-stone-800">{label}</span>
                  <span className="block text-xs text-stone-500">{note}</span>
                </button>
              ))}
            </div>

            {when === 'later' && (
              <label className="mt-3 block">
                <span className="mb-1 block text-sm text-stone-600">Deliver around</span>
                <input
                  type="datetime-local"
                  aria-label="Delivery time"
                  value={slot}
                  min={bounds?.min}
                  max={bounds?.max}
                  onChange={(e) => setSlot(e.target.value)}
                  className={inputCls}
                />
                <span className="mt-1 block text-xs text-stone-500">
                  The kitchen starts in time for the ride to you. If the slot is too soon for the distance,
                  you will be told the earliest it can make.
                </span>
              </label>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700">Payment</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.map(({ key, label, icon: Icon, note }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setPayment(key);
                    // Scheduling goes through cash or the demo card for now.
                    if (key === 'razorpay') setWhen('now');
                  }}
                  aria-pressed={payment === key}
                  className={`rounded-xl border p-3 text-left transition ${
                    payment === key
                      ? 'border-saffron-400 bg-saffron-50 ring-2 ring-saffron-100'
                      : 'border-stone-300 bg-white hover:bg-stone-50'
                  }`}
                >
                  <Icon size={18} className={payment === key ? 'text-saffron-600' : 'text-stone-500'} />
                  <span className="mt-1.5 block text-sm font-medium text-stone-800">{label}</span>
                  <span className="block text-xs text-stone-500">{note}</span>
                </button>
              ))}
            </div>

            {onlineEnabled ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-500">
                <ShieldCheck size={14} className="mt-px shrink-0 text-leaf-600" />
                Card and UPI details are entered on Razorpay&apos;s own secure window — Annam never
                sees them. Your order is created once Razorpay confirms the payment.
              </p>
            ) : (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-500">
                <ShieldCheck size={14} className="mt-px shrink-0 text-leaf-600" />
                This is a demo: no real money is taken. The demo card settles instantly, and cash on
                delivery is paid to the courier.
              </p>
            )}
          </fieldset>
        </div>

        <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-800">Order summary</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {cart.items.map((i) => (
              <li key={i.foodId} className="flex justify-between gap-2">
                <span className="min-w-0 truncate text-stone-600">{i.qty} × {i.name}</span>
                <span className="shrink-0 font-medium">{rupees(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-stone-200 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-stone-600">Subtotal</dt><dd>{rupees(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-600">Delivery</dt><dd>{rupees(deliveryFee)}</dd></div>
            <div className="flex justify-between border-t border-stone-200 pt-1.5 text-base font-bold">
              <dt>Total</dt><dd>{rupees(total)}</dd>
            </div>
          </dl>

          <Button type="submit" size="lg" busy={busy} className="mt-4 w-full">
            {payment === 'razorpay' ? `Pay ${rupees(total)}` : when === 'later' ? 'Schedule order' : 'Place order'}
          </Button>
        </aside>
      </form>
    </div>
  );
}
