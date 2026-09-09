import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CreditCard, Wallet } from 'lucide-react';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errMsg } from '../services/api.js';
import { Button, Field, inputCls, rupees } from '../components/ui.jsx';

/** Flattens the stored address object into a single editable line. */
function defaultAddress(user) {
  const a = user?.address;
  if (!a) return '';
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');
}

export default function CheckoutPage() {
  const { cart, subtotal, deliveryFee, total, count, clear } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [address, setAddress] = useState(defaultAddress(user));
  const [payment, setPayment] = useState('cod');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!count) return <Navigate to="/cart" replace />;

  const placeOrder = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/orders', {
        restaurantId: cart.restaurantId,
        items: cart.items.map(({ foodId, qty }) => ({ foodId, qty })),
        deliveryAddress: address,
        paymentMethod: payment,
        // Demo delivery point in Bengaluru; a production build would geocode the address.
        lat: 12.9719,
        lng: 77.6408,
      });
      clear();
      toast('Order placed! Track it live.', 'success');
      navigate(`/order/${data._id}`, { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Could not place your order'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-stone-900">Checkout</h1>
      <p className="mt-1 text-sm text-stone-600">Ordering from {cart.restaurantName}</p>

      <form onSubmit={placeOrder} className="mt-6 grid gap-6 sm:grid-cols-[1fr_16rem]">
        <div className="space-y-5">
          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Field label="Delivery address" hint="Include a landmark so the courier finds you quickly.">
            <textarea
              required
              rows={3}
              className={inputCls}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Flat, street, area, city, PIN"
            />
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700">Payment</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { key: 'cod', label: 'Cash on delivery', icon: Wallet, note: 'Pay the courier' },
                { key: 'mock-card', label: 'Card (demo)', icon: CreditCard, note: 'Simulated, no gateway' },
              ].map(({ key, label, icon: Icon, note }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPayment(key)}
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
            <p className="mt-2 text-xs text-stone-500">
              Card payments are simulated in this build — no real gateway is called and no card details
              are collected.
            </p>
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
            Place order
          </Button>
        </aside>
      </form>
    </div>
  );
}
