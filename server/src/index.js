import http from 'node:http';
import { config } from './config.js';
import { logger } from './logger.js';
import { connectDb, disconnectDb } from './db.js';
import { createRedis } from './redis.js';
import { createApp } from './app.js';
import { createSocketServer } from './socket.js';
import { initNotifications, closeNotifications } from './notifications.js';

await connectDb();
const redis = createRedis();
if (!redis) logger.warn('REDIS_URL vide : notifications traitées en direct, Socket.IO mono-instance');

const app = createApp();
const server = http.createServer(app);
const io = createSocketServer(server, redis);
app.set('io', io);
initNotifications({ redis, emitter: io });

server.listen(config.port, () => logger.info(`API Nexora sur http://localhost:${config.port}`));

const shutdown = async (signal) => {
  logger.info({ signal }, 'Arrêt en cours');
  io.close();
  server.close();
  await closeNotifications();
  await redis?.quit();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
