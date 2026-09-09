import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { errMsg } from '../services/api.js';
import { Button, Field, inputCls } from '../components/ui.jsx';

// The seeded accounts, so the demo can be driven without reading the README.
const DEMO = [
  { role: 'Customer', email: 'customer@annam.dev' },
  { role: 'Restaurant', email: 'restaurant@annam.dev' },
  { role: 'Delivery', email: 'delivery@annam.dev' },
  { role: 'Volunteer', email: 'volunteer@annam.dev' },
  { role: 'Admin', email: 'admin@annam.dev' },
];

const LANDING = {
  restaurant: '/dashboard/restaurant',
  delivery: '/dashboard/delivery',
  volunteer: '/annadevta',
  admin: '/dashboard/admin',
};

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('expired') ? 'Your session expired. Please log in again.' : '');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(form.email, form.password);
      toast(`Welcome back, ${user.name.split(' ')[0]}`, 'success');
      navigate(location.state?.from || LANDING[user.role] || '/', { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Could not sign you in'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 lg:grid-cols-[1fr_20rem]">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-3xl font-bold text-stone-900">Welcome back</h1>
        <p className="mt-1 text-sm text-stone-600">Sign in to order, cook, deliver or rescue food.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

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

          <Field label="Password">
            <input
              type="password"
              required
              autoComplete="current-password"
              className={inputCls}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>

          <Button type="submit" size="lg" busy={busy} className="w-full">
            Log in
          </Button>
        </form>

        <p className="mt-4 text-sm text-stone-600">
          New here?{' '}
          <Link to="/register" className="font-medium text-saffron-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>

      <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-800">Demo accounts</h2>
        <p className="mt-1 text-xs text-stone-500">
          Password for all: <code className="rounded bg-stone-100 px-1 py-0.5">Test@123</code>
        </p>
        <ul className="mt-3 space-y-1.5">
          {DEMO.map((d) => (
            <li key={d.email}>
              <button
                type="button"
                onClick={() => setForm({ email: d.email, password: 'Test@123' })}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm transition hover:border-saffron-300 hover:bg-saffron-50"
              >
                <span className="font-medium text-stone-800">{d.role}</span>
                <span className="block truncate text-xs text-stone-500">{d.email}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
