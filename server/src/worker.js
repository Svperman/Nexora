// Worker BullMQ : traite la file des notifications et les diffuse via Redis vers les pods API.
import http from 'node:http';
import { Worker } from 'bullmq';
import { Emitter } from '@socket.io/redis-emitter';
import { createRedis } from './redis.js';
import { connectDb, disconnectDb } from './db.js';
import { QUEUE_NAME, processNotification } from './notifications.js';
import { jobsTotal, registry } from './metrics.js';
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
worker.on('completed', () => jobsTotal.inc({ queue: QUEUE_NAME, status: 'completed' }));
worker.on('failed', (job, err) => {
  jobsTotal.inc({ queue: QUEUE_NAME, status: 'failed' });
  logger.error({ err, jobId: job?.id }, 'Job échoué');
});

// Petit serveur HTTP pour Prometheus et la sonde de vie.
const metricsPort = Number(process.env.METRICS_PORT || 9464);
const metricsServer = http.createServer(async (req, res) => {
  if (req.url === '/metrics') {
    res.setHeader('Content-Type', registry.contentType);
    return res.end(await registry.metrics());
  }
  if (req.url === '/healthz') return res.end(worker.isRunning() ? 'ok' : 'stopped');
  res.statusCode = 404;
  res.end();
});
metricsServer.listen(metricsPort);
logger.info({ metricsPort }, 'Worker notifications démarré');

const shutdown = async () => {
  metricsServer.close();
  await worker.close();
  await redis.quit();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
