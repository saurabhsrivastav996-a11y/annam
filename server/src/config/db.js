import mongoose from 'mongoose';
import { env } from './env.js';

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
    mode = 'in-memory';
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({ instance: { dbName: 'annam' } });
    uri = memoryServer.getUri();
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const label = mode === 'in-memory' ? 'in-memory MongoDB (data resets on restart)' : uri.replace(/\/\/[^@]+@/, '//***@');
  console.log(`[db] connected -> ${label}`);
  return { mode, uri };
}

export async function disconnectDB() {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
  memoryServer = null;
}

export const isInMemory = () => Boolean(memoryServer);
