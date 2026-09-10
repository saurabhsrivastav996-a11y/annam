import { Eye, ExternalLink, Radio } from 'lucide-react';
import { mediaUrl } from '../services/api.js';

/**
 * The kitchen transparency panel.
 *
 * `stream` is resolved server-side (see server/src/utils/streamUrl.js), so this
 * only has to pick a player: a YouTube embed, or a plain <video> for a direct
 * camera URL. With transparency enabled but no link yet, it shows the badge and
 * says so rather than rendering an empty box.
 */
export default function KitchenStream({ stream, restaurantName }) {
  return (
    <section className="rounded-2xl border border-leaf-200 bg-leaf-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-leaf-900">
          <Eye size={17} /> Live kitchen feed
        </h2>

        {stream?.kind === 'youtube' && (
          <a
            href={stream.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-leaf-700 hover:text-leaf-900 hover:underline"
          >
            Watch on YouTube <ExternalLink size={13} />
          </a>
        )}
      </div>

      {!stream ? (
        <p className="mt-1 text-sm text-leaf-800">
          This kitchen is enrolled in kitchen transparency. {restaurantName} is not streaming right
          now — check back around meal times.
        </p>
      ) : (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-leaf-800">
            <Radio size={13} className="animate-pulse text-red-600" />
            Straight from the kitchen that cooks your order.
          </p>

          <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl bg-black">
            {stream.kind === 'youtube' ? (
              <iframe
                src={stream.embedUrl}
                title={`${restaurantName} live kitchen`}
                className="size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <video
                src={mediaUrl(stream.embedUrl)}
                controls
                // A feed labelled "live" should be running. Muted is what makes
                // autoplay permitted at all — browsers block it with sound.
                autoPlay
                muted
                // A real camera feed never ends; looping keeps a short clip
                // behaving like one instead of stopping on a frozen frame.
                loop
                playsInline
                className="size-full object-cover"
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
