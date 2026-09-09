/**
 * Builds the demo reel videos in server/seed-media/reels.
 *
 *   node scripts/build-seed-reels.mjs
 *
 * Public stock-video hosts block hotlinking, so instead of shipping reels that
 * silently fail to play, we render short 9:16 clips locally from each dish photo
 * (a slow push-in). The result is committed, so a fresh clone has working reels
 * with no network and no API keys. Requires ffmpeg on PATH; only needed when
 * changing the demo content.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../server/seed-media/reels');
const TMP_DIR = path.resolve(__dirname, '../.tmp-reels');

const CLIPS = [
  { slug: 'butter-chicken', photo: 'photo-1603894584373-5ac82b2ae398' },
  { slug: 'garlic-naan', photo: 'photo-1601050690597-df0568f70950' },
  { slug: 'prawn-ghee-roast', photo: 'photo-1559847844-5315695dadae' },
  { slug: 'neer-dosa', photo: 'photo-1630383249896-424e482df921' },
  { slug: 'millet-bowl', photo: 'photo-1512621776951-a57141f2eefd' },
];

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.mkdir(TMP_DIR, { recursive: true });

for (const { slug, photo } of CLIPS) {
  const src = path.join(TMP_DIR, `${slug}.jpg`);
  const out = path.join(OUT_DIR, `${slug}.mp4`);

  const url = `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1600&q=80`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${slug}: ${res.status}`);
  await fs.writeFile(src, Buffer.from(await res.arrayBuffer()));

  // Fill a 9:16 frame, then push in slowly over 6 seconds.
  const filter = [
    'scale=-2:1280',
    'crop=720:1280',
    "zoompan=z='min(zoom+0.0007,1.25)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=25",
    'format=yuv420p',
  ].join(',');

  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-loop', '1', '-i', src,
    '-vf', filter,
    '-t', '6', '-r', '25',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
    '-movflags', '+faststart',
    out,
  ]);

  const { size } = await fs.stat(out);
  console.log(`✓ ${slug}.mp4  ${(size / 1024).toFixed(0)} KB`);
}

await fs.rm(TMP_DIR, { recursive: true, force: true });
console.log(`\nWrote ${CLIPS.length} clips to server/seed-media/reels`);
