import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingBag, ChefHat, Bike, HeartHandshake } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { errMsg } from '../services/api.js';
import { Button, Field, inputCls } from '../components/ui.jsx';

const ROLES = [
  { key: 'customer', label: 'Order food', icon: ShoppingBag, blurb: 'Browse reels and order' },
  { key: 'restaurant', label: 'Run a kitchen', icon: ChefHat, blurb: 'Sell and donate surplus' },
  { key: 'delivery', label: 'Deliver', icon: Bike, blurb: 'Pick up and drop off' },
  { key: 'volunteer', label: 'Volunteer', icon: HeartHandshake, blurb: 'Rescue surplus food' },
];

const LANDING = {
  restaurant: '/dashboard/restaurant',
  delivery: '/dashboard/delivery',
  volunteer: '/annadevta',
};

export default function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const initialRole = ROLES.some((r) => r.key === params.get('role')) ? params.get('role') : 'customer';
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: initialRole });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await register(form);
      toast('Account created. Welcome to Annam!', 'success');
      navigate(LANDING[user.role] || '/', { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Could not create your account'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-stone-900">Join Annam</h1>
      <p className="mt-1 text-sm text-stone-600">One account, whichever side of the meal you are on.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-stone-700">I want to…</legend>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map(({ key, label, icon: Icon, blurb }) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm({ ...form, role: key })}
                aria-pressed={form.role === key}
                className={`rounded-xl border p-3 text-left transition ${
                  form.role === key
                    ? 'border-saffron-400 bg-saffron-50 ring-2 ring-saffron-100'
                    : 'border-stone-300 bg-white hover:bg-stone-50'
                }`}
              >
                <Icon size={18} className={form.role === key ? 'text-saffron-600' : 'text-stone-500'} />
                <span className="mt-1.5 block text-sm font-medium text-stone-800">{label}</span>
                <span className="block text-xs text-stone-500">{blurb}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Full name">
          <input
            required
            minLength={2}
            autoComplete="name"
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            className={inputCls}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="Phone" hint="Used by couriers and volunteers to reach you.">
          <input
            className={inputCls}
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>

        <Field label="Password" hint="At least 6 characters.">
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={inputCls}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <Button type="submit" size="lg" busy={busy} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-4 text-sm text-stone-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-saffron-600 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
