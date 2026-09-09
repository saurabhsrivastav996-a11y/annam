import { useState } from 'react';
import { Users, Store, ShoppingBag, HeartHandshake, Video, IndianRupee } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { useToast } from '../context/ToastContext.jsx';
import api, { errMsg } from '../services/api.js';
import { Badge, Button, PageLoader, rupees } from '../components/ui.jsx';

const ROLE_FILTERS = ['all', 'customer', 'restaurant', 'delivery', 'volunteer', 'admin'];

export default function AdminDashboard() {
  const toast = useToast();
  const [tab, setTab] = useState('Overview');
  const [role, setRole] = useState('all');
  const { data: stats, loading, reload: reloadStats } = useFetch('/admin/stats');
  const { data: users, reload: reloadUsers } = useFetch(`/admin/users?role=${role}`);
  const { data: orders } = useFetch('/admin/orders');
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader label="Loading platform metrics…" />;

  const toggleSuspend = async (u) => {
    setBusy(true);
    try {
      await api.put(`/admin/users/${u.id}/suspend`, { isSuspended: !u.isSuspended });
      toast(`${u.name} ${u.isSuspended ? 'reinstated' : 'suspended'}`, 'success');
      reloadUsers();
      reloadStats();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const CARDS = [
    { label: 'Users', value: stats?.users, icon: Users },
    { label: 'Restaurants', value: stats?.restaurants, icon: Store },
    { label: 'Orders', value: stats?.orders, icon: ShoppingBag },
    { label: 'Donations', value: stats?.donations, icon: HeartHandshake },
    { label: 'Reels', value: stats?.reels, icon: Video },
    { label: 'Revenue', value: rupees(stats?.revenue), icon: IndianRupee },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-stone-900">Admin</h1>
      <p className="mt-1 text-sm text-stone-600">Platform health, accounts and order flow.</p>

      <div className="mt-6 flex gap-1.5">
        {['Overview', 'Users', 'Orders'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {CARDS.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4">
                <Icon size={18} className="text-saffron-500" />
                <p className="mt-2 text-2xl font-bold text-stone-900">{value ?? 0}</p>
                <p className="text-sm text-stone-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Breakdown title="Users by role" data={stats?.usersByRole} />
            <Breakdown title="Orders by status" data={stats?.ordersByStatus} />
          </div>
        </div>
      )}

      {tab === 'Users' && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ROLE_FILTERS.map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`rounded-full px-3 py-1 text-sm capitalize transition ${
                  role === r ? 'bg-saffron-500 text-white' : 'border border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {(users || []).map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-stone-900">{u.name}</td>
                    <td className="px-4 py-3 text-stone-600">{u.email}</td>
                    <td className="px-4 py-3 capitalize text-stone-600">{u.role}</td>
                    <td className="px-4 py-3">
                      <Badge status={u.isSuspended ? 'Cancelled' : 'Delivered'}>
                        {u.isSuspended ? 'Suspended' : 'Active'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== 'admin' && (
                        <Button
                          size="sm"
                          variant={u.isSuspended ? 'outline' : 'danger'}
                          busy={busy}
                          onClick={() => toggleSuspend(u)}
                        >
                          {u.isSuspended ? 'Reinstate' : 'Suspend'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Orders' && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Restaurant</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {(orders || []).map((o) => (
                <tr key={o._id}>
                  <td className="px-4 py-3 font-mono text-xs text-stone-600">#{o._id.slice(-6).toUpperCase()}</td>
                  <td className="px-4 py-3 text-stone-700">{o.customerId?.name}</td>
                  <td className="px-4 py-3 text-stone-700">{o.restaurantId?.name}</td>
                  <td className="px-4 py-3 font-medium">{rupees(o.total)}</td>
                  <td className="px-4 py-3"><Badge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Breakdown({ title, data }) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([, v]) => v));

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
      {entries.length ? (
        <ul className="mt-3 space-y-2">
          {entries.map(([key, value]) => (
            <li key={key} className="text-sm">
              <div className="flex justify-between">
                <span className="capitalize text-stone-600">{String(key).replace(/([A-Z])/g, ' $1')}</span>
                <span className="font-medium text-stone-900">{value}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-saffron-400" style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-stone-500">No data yet.</p>
      )}
    </div>
  );
}
