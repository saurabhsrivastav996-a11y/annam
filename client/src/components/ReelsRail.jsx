import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import ReelPlayer from './ReelPlayer.jsx';
import ReelViewer from './ReelViewer.jsx';

/** Horizontally scrollable strip of reel previews on the home page. */
export default function ReelsRail({ reels = [] }) {
  const railRef = useRef(null);
  const [openAt, setOpenAt] = useState(null);

  if (!reels.length) return null;

  const scrollBy = (dir) => railRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });

  return (
    <>
      <div className="relative">
        <div ref={railRef} className="no-scrollbar flex gap-3 overflow-x-auto scroll-smooth pb-2">
          {reels.map((reel, i) => (
            <button
              key={reel._id}
              onClick={() => setOpenAt(i)}
              className="group relative h-64 w-40 shrink-0 overflow-hidden rounded-2xl bg-stone-900 text-left transition hover:ring-2 hover:ring-saffron-400"
            >
              <ReelPlayer reel={reel} mode="hover" className="h-full w-full opacity-90 transition group-hover:opacity-100" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <span className="pointer-events-none absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/50 text-white">
                <Play size={13} className="fill-white" />
              </span>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{reel.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/70">{reel.restaurantId?.name}</p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => scrollBy(-1)}
          className="absolute -left-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-stone-200 bg-white p-2 shadow-md transition hover:bg-stone-50 md:block"
          aria-label="Scroll reels left"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => scrollBy(1)}
          className="absolute -right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-stone-200 bg-white p-2 shadow-md transition hover:bg-stone-50 md:block"
          aria-label="Scroll reels right"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {openAt !== null && <ReelViewer reels={reels} startIndex={openAt} onClose={() => setOpenAt(null)} />}
    </>
  );
}
