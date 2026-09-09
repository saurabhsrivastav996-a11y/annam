import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Heart, Store, Volume2, VolumeX, Eye } from 'lucide-react';
import ReelPlayer from './ReelPlayer.jsx';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ReportButton from './ReportButton.jsx';

/** Full-screen vertical reel feed, opened from the home rail or /reels. */
export default function ReelViewer({ reels, startIndex = 0, onClose }) {
  const scrollerRef = useRef(null);
  const { user } = useAuth();
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  const [counted, setCounted] = useState({});
  const [needsAccount, setNeedsAccount] = useState(false);

  // Show the viewer's own likes as already filled in.
  useEffect(() => {
    if (!user) return;
    api
      .get('/reels/likes/mine')
      .then(({ data }) => setLiked(Object.fromEntries(data.map((id) => [id, true]))))
      .catch(() => {});
  }, [user]);

  // Jump to the reel the user tapped, and lock background scrolling.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = startIndex * el.clientHeight;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [startIndex]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const countView = useCallback(
    (id) => {
      if (counted[id]) return;
      setCounted((c) => ({ ...c, [id]: true }));
      api.post(`/reels/${id}/view`).catch(() => {});
    },
    [counted]
  );

  /** Likes are one per account and toggle, so signing in is required. */
  const like = async (id) => {
    if (!user) return setNeedsAccount(true);

    // Optimistic, reconciled with whatever the server actually recorded.
    const next = !liked[id];
    setLiked((l) => ({ ...l, [id]: next }));

    try {
      const { data } = await api.post(`/reels/${id}/like`);
      setLiked((l) => ({ ...l, [id]: data.liked }));
      setLikeCounts((c) => ({ ...c, [id]: data.likes }));
    } catch {
      setLiked((l) => ({ ...l, [id]: !next }));
    }
  };

  return (
    <div className="fixed inset-0 z-[900] bg-black">
      <button
        onClick={onClose}
        className="absolute right-3 top-3 z-20 rounded-full bg-white/15 p-2 text-white backdrop-blur transition hover:bg-white/25"
        aria-label="Close reels"
      >
        <X size={22} />
      </button>
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute right-3 top-16 z-20 rounded-full bg-white/15 p-2 text-white backdrop-blur transition hover:bg-white/25"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {needsAccount && (
        <div className="absolute inset-x-0 top-1/2 z-30 mx-auto w-[min(20rem,90vw)] -translate-y-1/2 rounded-2xl bg-white p-5 text-center shadow-xl">
          <p className="font-medium text-stone-900">Sign in to like reels</p>
          <p className="mt-1 text-sm text-stone-600">
            Likes are counted once per account, so we know which reels people really rate.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setNeedsAccount(false)}
              className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              Not now
            </button>
            <Link
              to="/login"
              onClick={onClose}
              className="flex-1 rounded-xl bg-saffron-500 px-3 py-2 text-sm font-medium text-white"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      <div ref={scrollerRef} className="snap-feed no-scrollbar h-full overflow-y-auto">
        {reels.map((reel) => {
          const restaurant = reel.restaurantId;
          return (
            <section key={reel._id} className="relative grid h-full w-full place-items-center">
              <div className="relative h-full w-full max-w-[460px] overflow-hidden bg-stone-900">
                <ReelPlayer
                  reel={reel}
                  muted={muted}
                  className="h-full w-full"
                  onVisible={() => countView(reel._id)}
                />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pb-8">
                  <div className="pointer-events-auto">
                    <h3 className="text-lg font-semibold text-white">{reel.title}</h3>
                    {restaurant?.name && (
                      <Link
                        to={`/restaurant/${restaurant._id}`}
                        onClick={onClose}
                        className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur transition hover:bg-white/25"
                      >
                        <Store size={14} /> {restaurant.name} · Order now
                      </Link>
                    )}
                    <p className="mt-2 flex items-center gap-3 text-xs text-white/70">
                      <span className="inline-flex items-center gap-1"><Eye size={12} /> {reel.views}</span>
                      <span className="inline-flex items-center gap-1">
                        <Heart size={12} /> {likeCounts[reel._id] ?? reel.likes}
                      </span>
                      <ReportButton
                        targetType="reel"
                        targetId={reel._id}
                        className="!text-white/60 hover:!text-red-400"
                      />
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => like(reel._id)}
                  className="absolute bottom-28 right-3 grid size-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
                  aria-label="Like reel"
                >
                  <Heart size={24} className={liked[reel._id] ? 'fill-red-500 text-red-500' : ''} />
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
