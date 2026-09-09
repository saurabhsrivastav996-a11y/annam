import fs from 'node:fs/promises';

/**
 * Shuts down an in-memory MongoDB and actually removes its data directory.
 *
 * mongodb-memory-server's own `doCleanup` proved unreliable here: on Windows it
 * runs while mongod is still releasing its file handles, the removal fails, and
 * the ~300 MB directory is left behind for good. Capturing the path up front
 * and retrying the delete after the process has gone works every time.
 */
export async function stopMemoryServer(mongo) {
  if (!mongo) return;

  // instanceInfo disappears once stopped, so read the path first.
  const dbPath = mongo.instanceInfo?.dbPath;

  try {
    await mongo.stop({ doCleanup: true, force: true });
  } catch {
    // Already stopped, or never started cleanly. Still try the directory.
  }

  if (!dbPath) return;

  // A few short retries cover the gap between "process exited" and "handles released".
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(dbPath, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}
