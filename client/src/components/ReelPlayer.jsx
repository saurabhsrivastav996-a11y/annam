import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../services/api.js';

/**
 * Reel video with a poster fallback for when the source cannot load
 * (offline, blocked hotlink, unsupported codec).
 *
 * mode 'observer' — plays while on screen; for the one-at-a-time fullscreen feed.
 * mode 'hover'    — poster until hovered/focused; used in grids and rails so a
 *                   dozen clips never decode at once.
 */
export default function ReelPlayer({ reel, muted = true, className = '', mode = 'observer', onVisible }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (mode !== 'observer') return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play?.().catch(() => {
            /* autoplay can be refused; the poster stays visible */
          });
          onVisible?.();
        } else {
          el.pause?.();
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, onVisible]);

  if (failed) {
    return reel.thumbnailUrl ? (
      <img src={mediaUrl(reel.thumbnailUrl)} alt={reel.title} className={`object-cover ${className}`} />
    ) : (
      <div className={`grid place-items-center bg-stone-800 text-4xl ${className}`}>🍲</div>
    );
  }

  const hoverHandlers =
    mode === 'hover'
      ? {
          onMouseEnter: () => ref.current?.play?.().catch(() => {}),
          onMouseLeave: () => ref.current?.pause?.(),
        }
      : {};

  return (
    <video
      ref={ref}
      src={mediaUrl(reel.videoUrl)}
      poster={reel.thumbnailUrl ? mediaUrl(reel.thumbnailUrl) : undefined}
      className={`object-cover ${className}`}
      muted={muted}
      loop
      playsInline
      preload={mode === 'hover' ? 'none' : 'metadata'}
      onError={() => setFailed(true)}
      {...hoverHandlers}
    />
  );
}
