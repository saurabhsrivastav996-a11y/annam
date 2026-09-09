/**
 * Sweeps abandoned in-memory MongoDB data directories.
 *
 *   node scripts/clean-temp.mjs
 *
 * mongodb-memory-server writes each instance's data to a `mongo-mem-*` folder
 * under the OS temp directory and removes it on a clean shutdown. A process
 * that is force-killed never gets that far, so the folders pile up — around
 * 300 MB each, which fills a disk faster than it sounds.
 *
 * Runs automatically before and after the test suite. Only touches directories
 * untouched for a while, so a server running right now is left alone.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A live mongod checkpoints roughly every minute, so anything untouched for
// ten is finished. Its open file handles are a second guard: removing a
// directory still in use fails, and a failure is treated as "leave it alone".
const STALE_AFTER_MS = 10 * 60 * 1000;
const tmp = os.tmpdir();

const entries = await fs.readdir(tmp, { withFileTypes: true }).catch(() => []);
const candidates = entries.filter((e) => e.isDirectory() && e.name.startsWith('mongo-mem-'));

let removed = 0;
let skipped = 0;

for (const entry of candidates) {
  const dir = path.join(tmp, entry.name);
  try {
    const { mtimeMs } = await fs.stat(dir);
    if (Date.now() - mtimeMs < STALE_AFTER_MS) {
      skipped += 1;
      continue;
    }
    await fs.rm(dir, { recursive: true, force: true });
    removed += 1;
  } catch {
    // In use, or already gone. Either way, leave it.
    skipped += 1;
  }
}

if (removed || skipped) {
  console.log(`[clean-temp] removed ${removed} stale mongo-mem dir(s), left ${skipped} in place`);
}
