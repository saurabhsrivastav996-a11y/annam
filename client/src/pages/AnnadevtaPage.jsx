import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeartHandshake, MapPin, Clock, Package, Utensils, Navigation, Sparkles, TimerReset } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getSocket } from '../services/socket.js';
import { useGeolocation, formatDistance, formatDuration } from '../hooks/useGeolocation.js';
import api, { errMsg } from '../services/api.js';
import MapView from '../components/MapView.jsx';
import { Badge, Button, EmptyState, PageLoader } from '../components/ui.jsx';

const TABS = [
  { key: 'best', label: 'Best for you' },
  { key: 'Posted', label: 'All available' },
  { key: 'mine', label: 'My pickups' },
];

/** "in 45 min" / "in 2 h 10 min", or a warning once it is past. */
function timeLeft(minutes) {
  if (minutes == null) return null;
  if (minutes <= 0) return 'Expired';
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

export default function AnnadevtaPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isVolunteer = user?.role === 'volunteer';

  const [tab, setTab] = useState(isVolunteer ? 'best' : 'Posted');
  // Volunteers pick a run by how far it is, so ask where they are.
  const { position } = useGeolocation({ ask: isVolunteer });
  const near = position ? `&lat=${position.lat}&lng=${position.lng}&radius=50000` : '';
  const path =
    tab === 'mine'
      ? '/donations?mine=true'
      : tab === 'best'
        ? `/donations/recommended?limit=10${near}`
        : `/donations?status=Posted${near}`;
  const { data: donationPage, loading, reload } = useFetch(path);
  const donations = donationPage?.items;
  const { data: stats, reload: reloadStats } = useFetch('/donations/stats');
  const [busyId, setBusyId] = useState(null);

  // New donations appear without a refresh.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => {
      reload();
      reloadStats();
    };
    socket.on('donation:new', refresh);
    socket.on('donation:taken', refresh);
    return () => {
      socket.off('donation:new', refresh);
      socket.off('donation:taken', refresh);
    };
  }, [reload, reloadStats]);

  const act = async (id, fn, message) => {
    setBusyId(id);
    try {
      await fn();
      toast(message, 'success');
      reload();
      reloadStats();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const accept = (id) => act(id, () => api.put(`/donations/${id}/accept`), 'Pickup accepted — thank you!');
  const setStatus = (id, status) =>
    act(id, () => api.put(`/donations/${id}/status`, { status }), `Marked as ${status.toLowerCase()}`);

  const mapMarkers = (donations || [])
    .map((d) => {
      const [lng, lat] = d.pickupLocation?.coordinates || [];
      return lat != null ? { lat, lng, kind: 'donation', label: d.restaurantId?.name } : null;
    })
    .filter(Boolean);

  return (
    <>
      <section className="border-b border-leaf-200 bg-leaf-50">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <span className="grid size-12 place-items-center rounded-xl bg-leaf-600 text-white">
            <HeartHandshake size={24} />
          </span>
          <h1 className="mt-4 font-display text-4xl font-bold text-leaf-900">Annadevta</h1>
          <p className="mt-2 max-w-2xl text-leaf-800">
            Good food gets thrown away at closing time while people nearby go hungry. Restaurants post
            their surplus here; volunteers claim a pickup and take it where it is needed.
          </p>

          {stats && (
            <div className="mt-6 grid max-w-lg grid-cols-3 gap-4">
              {[
                { label: 'Meals rescued', value: stats.mealsRescued },
                { label: 'Pickups completed', value: stats.completedDonations },
                { label: 'Awaiting pickup', value: stats.openDonations },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-white p-3">
                  <p className="text-2xl font-bold text-leaf-700">{s.value}</p>
                  <p className="text-xs text-leaf-800">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {!user && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Button as={Link} to="/register?role=volunteer" variant="leaf">Volunteer with Annadevta</Button>
              <Button as={Link} to="/register?role=restaurant" variant="outline">List your restaurant</Button>
            </div>
          )}
          {user && !isVolunteer && user.role !== 'admin' && (
            <p className="mt-6 rounded-xl bg-white/70 px-4 py-3 text-sm text-leaf-900">
              You are signed in as <strong>{user.role}</strong>.{' '}
              {user.role === 'restaurant'
                ? 'Post surplus food from your kitchen dashboard.'
                : 'Volunteer accounts can claim these pickups.'}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {isVolunteer && (
          <div className="mb-5 flex gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  tab === t.key ? 'bg-leaf-600 text-white' : 'border border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'best' && !loading && donations?.length > 0 && (
          <p className="mb-3 text-xs text-stone-500">
            Ranked by how soon the food expires, how far it is, and the size of run you usually take.
            {donationPage?.unreachable > 0 &&
              ` ${donationPage.unreachable} more can't be reached before their deadline.`}
          </p>
        )}

        {loading ? (
          <PageLoader label="Finding donations…" />
        ) : !donations?.length ? (
          <EmptyState
            icon={Package}
            title={
              tab === 'mine'
                ? 'No pickups yet'
                : tab === 'best'
                  ? 'Nothing you can reach in time'
                  : 'No surplus food posted right now'
            }
            hint={
              tab === 'mine'
                ? 'Accept a pickup from the “Best for you” tab.'
                : tab === 'best'
                  ? 'Check “All available” to see everything, including pickups further away.'
                  : 'Restaurants usually post surplus near closing time. Check back later.'
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <ul className="space-y-3">
              {donations.map((d) => (
                <li key={d._id} className="rounded-2xl border border-stone-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-stone-900">{d.restaurantId?.name}</h3>
                      <p className="mt-0.5 text-sm text-stone-600">{d.description}</p>
                    </div>
                    <Badge status={d.status} />
                  </div>

                  {d.match?.reasons?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.match.reasons.map((reason) => (
                        <span
                          key={reason}
                          className="inline-flex items-center gap-1 rounded-full bg-saffron-50 px-2 py-0.5 text-[11px] font-medium text-saffron-700 ring-1 ring-saffron-200"
                        >
                          <Sparkles size={10} /> {reason}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-stone-600">
                    <span className="inline-flex items-center gap-1.5">
                      <Utensils size={14} className="text-leaf-600" />
                      <strong className="text-stone-900">{d.quantity}</strong> {d.units}
                    </span>
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <Package size={14} className="text-leaf-600" /> {d.foodType}
                    </span>
                    {d.distanceKm != null && (
                      <span className="inline-flex items-center gap-1.5">
                        <Navigation size={14} className="text-leaf-600" />
                        {formatDistance(d.distanceKm)}
                        {d.travelMinutes != null && ` · ~${formatDuration(d.travelMinutes)}`}
                      </span>
                    )}
                    {d.match?.minutesLeft != null ? (
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${
                          d.match.minutesLeft <= 120 ? 'text-red-600' : 'text-stone-600'
                        }`}
                      >
                        <TimerReset size={14} /> {timeLeft(d.match.minutesLeft)}
                      </span>
                    ) : (
                      d.pickupBefore && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={14} className="text-leaf-600" />
                          before {new Date(d.pickupBefore).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )
                    )}
                  </div>

                  <p className="mt-2 inline-flex items-start gap-1.5 text-sm text-stone-500">
                    <MapPin size={14} className="mt-0.5 shrink-0" /> {d.pickupAddress}
                  </p>

                  {isVolunteer && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {d.status === 'Posted' && (
                        <Button variant="leaf" busy={busyId === d._id} onClick={() => accept(d._id)}>
                          Accept pickup
                        </Button>
                      )}
                      {d.status === 'Accepted' && (
                        <Button variant="leaf" busy={busyId === d._id} onClick={() => setStatus(d._id, 'Collected')}>
                          Mark collected
                        </Button>
                      )}
                      {d.status === 'Collected' && (
                        <Button variant="leaf" busy={busyId === d._id} onClick={() => setStatus(d._id, 'Completed')}>
                          Mark distributed
                        </Button>
                      )}
                      {d.status === 'Completed' && (
                        <p className="text-sm text-leaf-700">Completed — {d.quantity} {d.units} served.</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <aside className="h-fit lg:sticky lg:top-20">
              <MapView markers={mapMarkers} height={300} />
              {isVolunteer && user?.stats && (
                <div className="mt-4 rounded-2xl border border-leaf-200 bg-leaf-50 p-4">
                  <p className="text-sm font-semibold text-leaf-900">Your impact</p>
                  <p className="mt-1 text-sm text-leaf-800">
                    <strong>{user.stats.donationsCollected}</strong> pickups ·{' '}
                    <strong>{user.stats.mealsServed}</strong> meals served
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
