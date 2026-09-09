import { useState } from 'react';
import { Video } from 'lucide-react';
import { useFetch } from '../hooks/useApi.js';
import ReelPlayer from '../components/ReelPlayer.jsx';
import ReelViewer from '../components/ReelViewer.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';

export default function ReelsPage() {
  const { data: reelPage, loading } = useFetch('/reels?limit=50');
  const reels = reelPage?.items;
  const [openAt, setOpenAt] = useState(null);

  if (loading) return <PageLoader label="Loading reels…" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-stone-900">Food Reels</h1>
      <p className="mt-1 text-sm text-stone-600">
        Watch dishes being made, then jump straight to the kitchen that made them.
      </p>

      {!reels?.length ? (
        <div className="mt-8">
          <EmptyState icon={Video} title="No reels yet" hint="Restaurants have not uploaded any videos." />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {reels.map((reel, i) => (
            <button
              key={reel._id}
              onClick={() => setOpenAt(i)}
              className="group relative aspect-[9/14] overflow-hidden rounded-2xl bg-stone-900 text-left transition hover:ring-2 hover:ring-saffron-400"
            >
              <ReelPlayer reel={reel} mode="hover" className="h-full w-full opacity-90 transition group-hover:opacity-100" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{reel.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/70">{reel.restaurantId?.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {openAt !== null && <ReelViewer reels={reels} startIndex={openAt} onClose={() => setOpenAt(null)} />}
    </div>
  );
}
