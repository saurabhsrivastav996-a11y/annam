/**
 * Works out how a restaurant's kitchen stream should be played.
 *
 * Running our own WebRTC/RTMP ingest would mean operating transcoding and a CDN.
 * YouTube Live already does that for free, and a restaurant can go live from the
 * phone in their kitchen, so a pasted YouTube link is the practical path. Direct
 * MP4/HLS URLs still work for anyone with their own camera feed.
 *
 * Returns null for anything unrecognised, so the UI can fall back to the badge.
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
  'youtu.be', 'www.youtu.be',
]);

// YouTube ids are exactly 11 chars of [A-Za-z0-9_-].
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Pulls the video id out of any of YouTube's link shapes. */
function youtubeVideoId(url) {
  // youtu.be/<id>
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return VIDEO_ID.test(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get('v');
  if (v && VIDEO_ID.test(v)) return v;

  // youtube.com/live/<id>, /embed/<id>, /shorts/<id>, /v/<id>
  const [section, id] = url.pathname.split('/').filter(Boolean);
  if (['live', 'embed', 'shorts', 'v'].includes(section) && VIDEO_ID.test(id || '')) {
    return id;
  }

  return null;
}

export function parseStreamUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const id = youtubeVideoId(url);
    if (!id) return null;
    return {
      kind: 'youtube',
      // nocookie host, and no related videos from other channels at the end.
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }

  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(url.pathname + url.search)) {
    return { kind: 'file', embedUrl: url.href, watchUrl: url.href };
  }

  return null;
}

/** True for an empty value or a URL we know how to play. */
export const isPlayableStreamUrl = (raw) => !raw || parseStreamUrl(raw) !== null;
