import mongoose from 'mongoose';
import { env, isProd } from './env.js';
import { stopMemoryServer } from '../utils/memoryServer.js';

let memoryServer = null;

/**
 * Connects to MongoDB.
 * - If MONGODB_URI is set (e.g. Atlas), uses it.
 * - Otherwise spins up an in-memory MongoDB so the app runs with zero setup.
 *   In-memory data is wiped when the process exits.
 */
export async function connectDB() {
  let uri = env.mongoUri;
  let mode = 'external';

  if (!uri) {
    // Falling back in production would mean every restart silently wipes real
    // customer data — and mongodb-memory-server is a devDependency, so it is
    // not even installed there. Fail loudly instead.
    if (isProd) {
      throw new Error(
        'MONGODB_URI is required in production. Set it to your MongoDB Atlas connection string.'
      );
    }
    mode = 'in-memory';
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({ instance: { dbName: 'annam' } });
    uri = memoryServer.getUri();
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    // A refused connection to a local server almost always means it is simply
    // not running, which is worth saying rather than printing a raw timeout.
    if (/127\.0\.0\.1|localhost/.test(uri)) {
      throw new Error(
        [
          `Could not reach MongoDB at ${uri}`,
          '  Start it with:  npm run db',
          '  Or clear MONGODB_URI in server/.env to use the in-memory database.',
        ].join('\n')
      );
    }
    throw err;
  }

  const label = mode === 'in-memory' ? 'in-memory MongoDB (data resets on restart)' : uri.replace(/\/\/[^@]+@/, '//***@');
  console.log(`[db] connected -> ${label}`);
  return { mode, uri };
}

export async function disconnectDB() {
  await mongoose.connection.close();
  await stopMemoryServer(memoryServer);
  memoryServer = null;
}

export const isInMemory = () => Boolean(memoryServer);
