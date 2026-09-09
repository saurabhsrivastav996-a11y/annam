import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Heart, Store, Volume2, VolumeX, Eye } from 'lucide-react';
import ReelPlayer from './ReelPlayer.jsx';
import api from '../services/api.js';

/** Full-screen vertical reel feed, opened from the home rail or /reels. */
export default function ReelViewer({ reels, startIndex = 0, onClose }) {
  const scrollerRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState({});
  const [counted, setCounted] = useState({});

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

  const like = (id) => {
    if (liked[id]) return;
    setLiked((l) => ({ ...l, [id]: true }));
    api.post(`/reels/${id}/like`).catch(() => {});
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
                        <Heart size={12} /> {reel.likes + (liked[reel._id] ? 1 : 0)}
                      </span>
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
