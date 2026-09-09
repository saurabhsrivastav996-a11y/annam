/**
 * Starts a local MongoDB for development.
 *
 *   npm run db
 *
 * Windows installs MongoDB as a service, but starting that service needs
 * Administrator. Running mongod directly does not, so this launches it against
 * a data directory inside the project (gitignored) and leaves it in the
 * foreground — Ctrl+C stops it.
 *
 * Not needed if the MongoDB service is already running, or if MONGODB_URI
 * points at Atlas.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../.mongodb-data');
const PORT = Number(process.env.MONGO_PORT) || 27017;

/** Common install locations, newest version first. */
function findMongod() {
  if (process.platform === 'win32') {
    const root = 'C:\\Program Files\\MongoDB\\Server';
    if (fs.existsSync(root)) {
      const versions = fs
        .readdirSync(root)
        .sort((a, b) => parseFloat(b) - parseFloat(a));
      for (const v of versions) {
        const exe = path.join(root, v, 'bin', 'mongod.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }

  for (const candidate of ['/usr/bin/mongod', '/usr/local/bin/mongod', '/opt/homebrew/bin/mongod']) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fall back to PATH and let spawn report if it is missing.
  return 'mongod';
}

/** True if something already holds the port. */
const portInUse = () =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: PORT })
      .on('connect', () => {
        socket.destroy();
        resolve(true);
      })
      .on('error', () => resolve(false));
    setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1500);
  });

if (await portInUse()) {
  console.log(`MongoDB is already running on port ${PORT}. Nothing to do.`);
  process.exit(0);
}

fs.mkdirSync(DB_PATH, { recursive: true });

const mongod = findMongod();
console.log(`Starting ${mongod}`);
console.log(`  data:  ${DB_PATH}`);
console.log(`  uri:   mongodb://127.0.0.1:${PORT}/annam`);
console.log('  Ctrl+C to stop.\n');

const child = spawn(mongod, ['--dbpath', DB_PATH, '--port', String(PORT), '--bind_ip', '127.0.0.1'], {
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error(`\nCould not start MongoDB: ${err.message}`);
  if (err.code === 'ENOENT') {
    console.error(
      os.platform() === 'win32'
        ? 'Install it from https://www.mongodb.com/try/download/community, or leave MONGODB_URI blank to use the in-memory database.'
        : 'Install MongoDB, or leave MONGODB_URI blank to use the in-memory database.'
    );
  }
  process.exit(1);
});

// Ctrl+C should stop mongod, not orphan it.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
