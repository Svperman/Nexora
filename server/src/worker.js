// Worker BullMQ : traite la file des notifications et les diffuse via Redis vers les pods API.
import { Worker } from 'bullmq';
import { Emitter } from '@socket.io/redis-emitter';
import { createRedis } from './redis.js';
import { connectDb, disconnectDb } from './db.js';
import { QUEUE_NAME, processNotification } from './notifications.js';
import { logger } from './logger.js';

const redis = createRedis();
if (!redis) {
  logger.error('REDIS_URL est requis pour lancer le worker');
  process.exit(1);
}

await connectDb();
const emitter = new Emitter(redis.duplicate());

const worker = new Worker(QUEUE_NAME, (job) => processNotification(job.data, emitter), {
  connection: redis,
  concurrency: 10,
});
worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'Job échoué'));
logger.info('Worker notifications démarré');

const shutdown = async () => {
  await worker.close();
  await redis.quit();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
