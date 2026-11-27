import { Redis } from 'ioredis';
import { config } from './config.js';

/** Crée une connexion Redis, ou null si REDIS_URL n'est pas défini. */
export function createRedis() {
  if (!config.redisUrl) return null;
  // maxRetriesPerRequest: null est requis par BullMQ.
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}
