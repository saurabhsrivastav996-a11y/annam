import { useEffect, useState } from 'react';
import { ChefHat, Plus, Trash2, Video, HeartHandshake, Store, Eye } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import { useToast } from '../context/ToastContext.jsx';
import { getSocket } from '../services/socket.js';
import api, { errMsg, mediaUrl } from '../services/api.js';
import { Badge, Button, EmptyState, Field, PageLoader, VegDot, formatSlot, inputCls, rupees } from '../components/ui.jsx';
import FoodImage from '../components/FoodImage.jsx';
import RestaurantInsights from '../components/RestaurantInsights.jsx';

const TABS = ['Orders', 'Insights', 'Menu', 'Reels', 'Annadevta', 'Profile'];

/** Video id out of watch?v=, youtu.be/, /live/, /embed/ and /shorts/ links. */
function extractYouTubeId(raw) {
  const match = String(raw || '').match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

// What the restaurant can do next, given the current order status.
const NEXT_ACTION = {
  Placed: { status: 'Accepted', label: 'Accept order' },
  Accepted: { status: 'Preparing', label: 'Start cooking' },
  Preparing: { status: 'Ready', label: 'Mark ready' },
};

export default function RestaurantDashboard() {
  const toast = useToast();
  const [tab, setTab] = useState('Orders');
  const { data: restaurant, loading, reload: reloadRestaurant } = useFetch('/restaurants/mine');
  const { data: orderPage, reload: reloadOrders } = useFetch('/orders');
  const orders = orderPage?.items;
  const { data: reelPage, reload: reloadReels } = useFetch(
    restaurant ? `/reels?restaurantId=${restaurant._id}` : null,
    { skip: !restaurant }
  );
  const reels = reelPage?.items;
  const { data: donationPage, reload: reloadDonations } = useFetch('/donations?mine=true');
  const donations = donationPage?.items;
  const [busy, setBusy] = useState(false);

  // New orders arrive over the socket.
  useEffect(() => {
    const socket = getSocket();
    const onNew = () => {
      toast('New order received', 'success');
      reloadOrders();
    };
    // Booked for later: shown under Upcoming now, and arrives as a new order at release.
    const onScheduled = () => {
      toast('New order scheduled for later', 'info');
      reloadOrders();
    };
    socket.on('order:new', onNew);
    socket.on('order:scheduled', onScheduled);
    socket.on('donation:accepted', reloadDonations);
    return () => {
      socket.off('order:new', onNew);
      socket.off('order:scheduled', onScheduled);
      socket.off('donation:accepted', reloadDonations);
    };
  }, [reloadOrders, reloadDonations, toast]);

  if (loading) return <PageLoader label="Opening your kitchen…" />;

  if (!restaurant) return <CreateRestaurant onCreated={reloadRestaurant} />;

  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      if (message) toast(message, 'success');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">{restaurant.name}</h1>
          <p className="mt-1 text-sm text-stone-600">{restaurant.address}</p>
        </div>
        <div className="flex items-center gap-2">
          {restaurant.isTransparentKitchen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-leaf-100 px-2.5 py-1 text-xs font-medium text-leaf-700">
              <Eye size={12} /> Transparent
            </span>
          )}
          <Badge status={restaurant.isOpen ? 'Delivered' : 'Cancelled'}>
            {restaurant.isOpen ? 'Open' : 'Closed'}
          </Badge>
        </div>
      </div>

      <div className="mt-6 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'Orders' && (
          <OrdersTab orders={orders} busy={busy} reload={reloadOrders} run={run} />
        )}
        {tab === 'Insights' && <RestaurantInsights />}
        {tab === 'Menu' && (
          <MenuTab restaurant={restaurant} reload={reloadRestaurant} busy={busy} run={run} />
        )}
        {tab === 'Reels' && (
          <ReelsTab reels={reels} reload={reloadReels} busy={busy} run={run} />
        )}
        {tab === 'Annadevta' && (
          <DonationsTab donations={donations} reload={reloadDonations} busy={busy} run={run} />
        )}
        {tab === 'Profile' && (
          <ProfileTab restaurant={restaurant} reload={reloadRestaurant} busy={busy} run={run} />
        )}
      </div>
    </div>
  );
}

/* ---------- First-run: create the restaurant profile ---------- */

function CreateRestaurant({ onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', address: '', cuisineType: 'Indian', category: 'both', description: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/restaurants', form);
      toast('Restaurant created', 'success');
      onCreated();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <span className="grid size-12 place-items-center rounded-xl bg-saffron-500 text-white">
        <ChefHat size={24} />
      </span>
      <h1 className="mt-4 font-display text-3xl font-bold text-stone-900">Set up your kitchen</h1>
      <p className="mt-1 text-sm text-stone-600">
        Create your restaurant profile to start adding a menu, reels and donations.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Restaurant name">
          <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Address">
          <input required className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cuisine">
            <input className={inputCls} value={form.cuisineType} onChange={(e) => setForm({ ...form, cuisineType: e.target.value })} />
          </Field>
          <Field label="Serves">
            <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="both">Veg &amp; Non-veg</option>
              <option value="veg">Pure veg</option>
              <option value="non-veg">Non-veg</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea rows={3} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Button type="submit" size="lg" busy={busy} className="w-full">Create restaurant</Button>
      </form>
    </div>
  );
}

/* ---------- Tabs ---------- */

function OrdersTab({ orders, busy, reload, run }) {
  const upcoming = (orders || []).filter((o) => o.status === 'Scheduled');
  const live = (orders || []).filter((o) => !['Scheduled', 'Delivered', 'Cancelled'].includes(o.status));
  const done = (orders || []).filter((o) => ['Delivered', 'Cancelled'].includes(o.status));

  if (!orders?.length) {
    return <EmptyState icon={Store} title="No orders yet" hint="Orders from customers will appear here in real time." />;
  }

  const Card = ({ order }) => {
    const next = NEXT_ACTION[order.status];
    return (
      <li className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-stone-900">#{order._id.slice(-6).toUpperCase()}</p>
            <p className="text-sm text-stone-500">
              {order.customerId?.name} · {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <Badge status={order.status} />
        </div>

        <ul className="mt-3 space-y-1 text-sm text-stone-600">
          {order.items.map((i) => (
            <li key={i.foodId}>{i.qty} × {i.name}</li>
          ))}
        </ul>

        {order.status === 'Scheduled' && order.scheduledFor && (
          <p className="mt-2 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-800">
            Due {formatSlot(order.scheduledFor)} · moves to Active around {formatSlot(order.releaseAt)}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3">
          <p className="font-semibold text-stone-900">{rupees(order.total)}</p>
          <div className="flex gap-2">
            {next && (
              <Button
                size="sm"
                busy={busy}
                onClick={() =>
                  run(
                    async () => {
                      await api.put(`/orders/${order._id}/status`, { status: next.status });
                      reload();
                    },
                    next.label + 'ed'
                  )
                }
              >
                {next.label}
              </Button>
            )}
            {['Scheduled', 'Placed', 'Accepted', 'Preparing'].includes(order.status) && (
              <Button
                size="sm"
                variant="danger"
                busy={busy}
                onClick={() => {
                  const reason = window.prompt('Why are you cancelling? The customer sees this.');
                  if (reason === null) return; // dismissed
                  run(async () => {
                    await api.put(`/orders/${order._id}/status`, { status: 'Cancelled', reason });
                    reload();
                  }, 'Order cancelled — any payment is being refunded');
                }}
              >
                Cancel
              </Button>
            )}
            {order.status === 'Ready' && (
              <span className="text-sm text-stone-500">Waiting for a courier…</span>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-8">
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Upcoming</h2>
          <ul className="grid gap-3 sm:grid-cols-2">{upcoming.map((o) => <Card key={o._id} order={o} />)}</ul>
        </section>
      )}
      {live.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Active</h2>
          <ul className="grid gap-3 sm:grid-cols-2">{live.map((o) => <Card key={o._id} order={o} />)}</ul>
        </section>
      )}
      {done.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Completed</h2>
          <ul className="grid gap-3 sm:grid-cols-2">{done.map((o) => <Card key={o._id} order={o} />)}</ul>
        </section>
      )}
    </div>
  );
}

function MenuTab({ restaurant, reload, busy, run }) {
  const empty = { name: '', price: '', description: '', category: 'veg' };
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => body.append(k, v));
      if (file) body.append('image', file);
      await api.post(`/restaurants/${restaurant._id}/menu`, body);
      setForm(empty);
      setFile(null);
      e.target.reset();
      reload();
    }, 'Menu item added');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section>
        {restaurant.menu?.length ? (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {restaurant.menu.map((item) => (
              <li key={item._id} className="flex items-center gap-3 p-4">
                <FoodImage src={item.imageUrl} alt={item.name} className="size-14 shrink-0 overflow-hidden rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-stone-900">
                    <VegDot category={item.category} /> <span className="truncate">{item.name}</span>
                  </p>
                  <p className="truncate text-sm text-stone-500">{item.description}</p>
                </div>
                <p className="shrink-0 font-semibold">{rupees(item.price)}</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.delete(`/restaurants/${restaurant._id}/menu/${item._id}`);
                      reload();
                    }, 'Item removed')
                  }
                  className="p-1.5 text-stone-400 hover:text-red-600"
                  aria-label={`Delete ${item.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Your menu is empty" hint="Add your first dish using the form." />
        )}
      </section>

      <form onSubmit={add} className="h-fit space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-800">Add a dish</h2>
        <Field label="Name">
          <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Price (₹)">
          <input required type="number" min="0" step="1" className={inputCls} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea rows={2} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="veg">Veg</option>
            <option value="non-veg">Non-veg</option>
          </select>
        </Field>
        <Field label="Photo" hint="Optional. Stored on Cloudinary, or locally if no keys are set.">
          <input type="file" accept="image/*" className={inputCls} onChange={(e) => setFile(e.target.files[0])} />
        </Field>
        <Button type="submit" busy={busy} className="w-full"><Plus size={15} /> Add item</Button>
      </form>
    </div>
  );
}

function ReelsTab({ reels, reload, busy, run }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');

  const upload = (e) => {
    e.preventDefault();
    run(async () => {
      const body = new FormData();
      body.append('title', title);
      if (file) body.append('video', file);
      else if (videoUrl) body.append('videoUrl', videoUrl);
      await api.post('/reels', body);
      setTitle('');
      setFile(null);
      setVideoUrl('');
      e.target.reset();
      reload();
    }, 'Reel published');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section>
        {reels?.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {reels.map((reel) => (
              <div key={reel._id} className="relative aspect-[9/14] overflow-hidden rounded-2xl bg-stone-900">
                <video
                  src={mediaUrl(reel.videoUrl)}
                  poster={reel.thumbnailUrl ? mediaUrl(reel.thumbnailUrl) : undefined}
                  className="size-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3">
                  <p className="line-clamp-2 text-sm font-medium text-white">{reel.title}</p>
                  <p className="text-[11px] text-white/70">{reel.views} views · {reel.likes} likes</p>
                </div>
                <button
                  disabled={busy}
                  onClick={() => run(async () => { await api.delete(`/reels/${reel._id}`); reload(); }, 'Reel deleted')}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-red-600"
                  aria-label="Delete reel"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Video} title="No reels yet" hint="Short cooking videos get far more taps than static photos." />
        )}
      </section>

      <form onSubmit={upload} className="h-fit space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-800">Upload a reel</h2>
        <Field label="Title">
          <input required className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Making our butter chicken" />
        </Field>
        <Field label="Video file" hint="MP4/WebM, up to 50 MB.">
          <input type="file" accept="video/*" className={inputCls} onChange={(e) => setFile(e.target.files[0])} />
        </Field>
        <Field label="…or paste a video URL">
          <input className={inputCls} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…/clip.mp4" />
        </Field>
        <Button type="submit" busy={busy} disabled={!file && !videoUrl} className="w-full">
          <Video size={15} /> Publish reel
        </Button>
      </form>
    </div>
  );
}

function DonationsTab({ donations, reload, busy, run }) {
  const empty = { description: '', quantity: '', units: 'meals', foodType: 'veg' };
  const [form, setForm] = useState(empty);

  const post = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/donations', { ...form, quantity: Number(form.quantity) });
      setForm(empty);
      reload();
    }, 'Donation posted — volunteers have been notified');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section>
        {donations?.length ? (
          <ul className="space-y-3">
            {donations.map((d) => (
              <li key={d._id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-stone-900">{d.description}</p>
                    <p className="mt-0.5 text-sm text-stone-500">
                      {d.quantity} {d.units} · {d.foodType} · posted{' '}
                      {new Date(d.postedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    {d.volunteerId && (
                      <p className="mt-1 text-sm text-leaf-700">
                        Claimed by {d.volunteerId.name}
                        {d.volunteerId.phone ? ` · ${d.volunteerId.phone}` : ''}
                      </p>
                    )}
                  </div>
                  <Badge status={d.status} />
                </div>
                {d.status === 'Posted' && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="mt-3"
                    busy={busy}
                    onClick={() => run(async () => { await api.delete(`/donations/${d._id}`); reload(); }, 'Donation removed')}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={HeartHandshake}
            title="No donations posted"
            hint="At closing time, post what is left instead of binning it."
          />
        )}
      </section>

      <form onSubmit={post} className="h-fit space-y-3 rounded-2xl border border-leaf-200 bg-leaf-50 p-5">
        <h2 className="text-sm font-semibold text-leaf-900">Post surplus food</h2>
        <Field label="What is available">
          <textarea required rows={2} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="15 veg meals (dal, rice, roti)" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <input required type="number" min="1" className={inputCls} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Units">
            <input className={inputCls} value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
          </Field>
        </div>
        <Field label="Food type">
          <select className={inputCls} value={form.foodType} onChange={(e) => setForm({ ...form, foodType: e.target.value })}>
            <option value="veg">Veg</option>
            <option value="non-veg">Non-veg</option>
            <option value="mixed">Mixed</option>
          </select>
        </Field>
        <Button type="submit" variant="leaf" busy={busy} className="w-full">
          <HeartHandshake size={15} /> Post donation
        </Button>
      </form>
    </div>
  );
}

function ProfileTab({ restaurant, reload, busy, run }) {
  const [form, setForm] = useState({
    name: restaurant.name,
    address: restaurant.address,
    cuisineType: restaurant.cuisineType,
    description: restaurant.description || '',
    phone: restaurant.phone || '',
    category: restaurant.category,
    isOpen: restaurant.isOpen,
    isTransparentKitchen: restaurant.isTransparentKitchen,
    kitchenStreamUrl: restaurant.kitchenStreamUrl || '',
  });

  // Mirrors the server's parser so the owner sees the embed (or the problem)
  // before saving; the server validates again on write.
  const youtubeId = extractYouTubeId(form.kitchenStreamUrl);
  const isDirectFile = /^https?:\/\/.+\.(mp4|webm|m3u8)(\?|$)/i.test(form.kitchenStreamUrl.trim());
  const embedUrl = youtubeId ? `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1` : null;
  const streamError =
    form.kitchenStreamUrl.trim() && !youtubeId && !isDirectFile
      ? 'Not a link we can play. Use a YouTube video/live link, or a direct .mp4/.m3u8 URL.'
      : '';

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      await api.put(`/restaurants/${restaurant._id}`, form);
      reload();
    }, 'Profile saved');
  };

  return (
    <form onSubmit={save} className="max-w-lg space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <Field label="Restaurant name">
        <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Address">
        <input required className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cuisine">
          <input className={inputCls} value={form.cuisineType} onChange={(e) => setForm({ ...form, cuisineType: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </div>
      <Field label="Description">
        <textarea rows={3} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={form.isOpen} onChange={(e) => setForm({ ...form, isOpen: e.target.checked })} className="size-4 accent-saffron-500" />
        Accepting orders
      </label>
      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={form.isTransparentKitchen} onChange={(e) => setForm({ ...form, isTransparentKitchen: e.target.checked })} className="size-4 accent-leaf-600" />
        Kitchen transparency — let customers see inside
      </label>

      {form.isTransparentKitchen && (
        <div className="rounded-xl border border-leaf-200 bg-leaf-50 p-4">
          <Field
            label="Kitchen stream link"
            hint="Go live on YouTube from a phone in your kitchen, then paste the video link here. A direct .mp4/.m3u8 camera URL also works. Leave blank to show the badge only."
            error={streamError}
          >
            <input
              className={inputCls}
              placeholder="https://www.youtube.com/watch?v=…"
              value={form.kitchenStreamUrl}
              onChange={(e) => setForm({ ...form, kitchenStreamUrl: e.target.value })}
            />
          </Field>

          {embedUrl && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-leaf-900">Preview — this is what customers see</p>
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                <iframe src={embedUrl} title="Kitchen stream preview" className="size-full" allowFullScreen />
              </div>
            </div>
          )}
        </div>
      )}

      <Button type="submit" busy={busy} disabled={Boolean(streamError)}>Save changes</Button>
    </form>
  );
}
