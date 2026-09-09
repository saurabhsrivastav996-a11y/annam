import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { stopMemoryServer } from '../src/utils/memoryServer.js';

let mongo;

/** Boots a throwaway MongoDB for the test file. */
export async function startDb() {
  mongo = await MongoMemoryServer.create({ instance: { dbName: 'annam-test' } });
  await mongoose.connect(mongo.getUri());
}

export async function stopDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await stopMemoryServer(mongo);
}

export async function clearDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
