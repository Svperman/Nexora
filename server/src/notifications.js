import { Queue } from 'bullmq';
import { Notification } from './models.js';
import { logger } from './logger.js';
import { notificationsTotal, registry } from './metrics.js';
import client from 'prom-client';

// Profondeur de la file BullMQ, lue au moment du scraping.
new client.Gauge({
  name: 'nexora_queue_jobs',
  help: 'Jobs dans la file des notifications par état',
  labelNames: ['state'],
  registers: [registry],
  async collect() {
    if (!queue) return;
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    for (const [state, n] of Object.entries(counts)) this.set({ state }, n);
  },
});

export const QUEUE_NAME = 'notifications';
export const userRoom = (id) => `user:${id}`;

let queue = null;
let localEmitter = null;

/**
 * @param {object} opts
 * @param {import('ioredis').Redis|null} opts.redis  connexion Redis (null => traitement en direct)
 * @param {{ to(room:string): { emit(ev:string, data:any): void } }} opts.emitter  io ou redis-emitter
 */
export function initNotifications({ redis, emitter }) {
  localEmitter = emitter;
  queue = redis ? new Queue(QUEUE_NAME, { connection: redis }) : null;
}

/** Crée la notification en base et la pousse en temps réel. Utilisé par l'API (sans Redis) ou par le worker. */
export async function processNotification(data, emitter) {
  if (String(data.user) === String(data.actor)) return null; // pas d'auto-notification
  const doc = await Notification.create(data);
  emitter?.to(userRoom(data.user)).emit('notification', doc.toJSON());
  return doc;
}

export async function notify(data) {
  try {
    notificationsTotal.inc({ type: data.type, mode: queue ? 'queued' : 'direct' });
    if (queue) {
      await queue.add('notify', data, { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000 });
    } else {
      await processNotification(data, localEmitter);
    }
  } catch (err) {
    logger.error({ err }, 'Échec de la notification');
  }
}

export async function closeNotifications() {
  await queue?.close();
  queue = null;
}
