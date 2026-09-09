import { useState } from 'react';
import { HeartHandshake, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errMsg } from '../services/api.js';
import { Button, Field, inputCls } from '../components/ui.jsx';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone || '',
    address: {
      street: user.address?.street || '',
      city: user.address?.city || '',
      state: user.address?.state || '',
      zip: user.address?.zip || '',
    },
    notifications: { email: user.notifications?.email !== false },
  });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put('/users/profile', form);
      setUser(data);
      toast('Profile updated', 'success');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/users/password', passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      toast('Password changed', 'success');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-leaf-100 text-xl font-semibold text-leaf-700">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">{user.name}</h1>
          <p className="text-sm capitalize text-stone-600">{user.role} · {user.email}</p>
        </div>
      </div>

      {user.role === 'volunteer' && user.stats && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-leaf-200 bg-leaf-50 p-4">
          <HeartHandshake className="size-6 shrink-0 text-leaf-600" />
          <p className="text-sm text-leaf-900">
            You have completed <strong>{user.stats.donationsCollected}</strong> pickups and helped serve{' '}
            <strong>{user.stats.mealsServed}</strong> meals.
          </p>
        </div>
      )}

      <form onSubmit={saveProfile} className="mt-8 space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-800">Your details</h2>

        <Field label="Full name">
          <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>

        <Field label="Street">
          <input
            className={inputCls}
            value={form.address.street}
            onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          {['city', 'state', 'zip'].map((key) => (
            <Field key={key} label={key === 'zip' ? 'PIN code' : key[0].toUpperCase() + key.slice(1)}>
              <input
                className={inputCls}
                value={form.address[key]}
                onChange={(e) => setForm({ ...form, address: { ...form.address, [key]: e.target.value } })}
              />
            </Field>
          ))}
        </div>

        <fieldset className="border-t border-stone-200 pt-4">
          <legend className="sr-only">Notifications</legend>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.notifications.email}
              onChange={(e) => setForm({ ...form, notifications: { email: e.target.checked } })}
              className="mt-0.5 size-4 accent-saffron-500"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
                <Mail size={14} /> Email me about my orders
              </span>
              <span className="mt-0.5 block text-xs text-stone-500">
                Order confirmations, when food leaves the kitchen, and when it arrives.
                {user.role === 'restaurant' && ' Plus new orders and claimed donations.'}
              </span>
            </span>
          </label>
        </fieldset>

        <Button type="submit" busy={busy}>Save profile</Button>
      </form>

      <form onSubmit={changePassword} className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-800">Change password</h2>
        <Field label="Current password">
          <input
            type="password"
            required
            autoComplete="current-password"
            className={inputCls}
            value={passwords.currentPassword}
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
          />
        </Field>
        <Field label="New password" hint="At least 6 characters.">
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={inputCls}
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
          />
        </Field>
        <Button type="submit" variant="outline" busy={busy}>Update password</Button>
      </form>
    </div>
  );
}
