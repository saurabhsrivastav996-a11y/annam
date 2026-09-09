import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;

/** Boots a throwaway MongoDB for the test file. */
export async function startDb() {
  mongo = await MongoMemoryServer.create({ instance: { dbName: 'annam-test' } });
  await mongoose.connect(mongo.getUri());
}

export async function stopDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongo?.stop({ doCleanup: true, force: true });
}

export async function clearDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
