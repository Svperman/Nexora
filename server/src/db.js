import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';

let memoryServer;

export async function connectDb(uri = config.mongoUri) {
  let target = uri;
  if (!target) {
    // Dev/test sans Atlas : MongoDB en mémoire (binaire téléchargé au premier lancement).
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    target = memoryServer.getUri('nexora');
    logger.warn('MONGO_URI vide : base MongoDB en mémoire (données non persistées)');
  }
  await mongoose.connect(target);
  logger.info('MongoDB connecté');
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
  memoryServer = undefined;
}
