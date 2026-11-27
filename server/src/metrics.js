// Métriques Prometheus exposées sur GET /metrics (non routé par l'Ingress : interne au cluster).
import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'nexora_' });

export const httpDuration = new client.Histogram({
  name: 'nexora_http_request_duration_seconds',
  help: 'Durée des requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const socketConnections = new client.Gauge({
  name: 'nexora_socket_connections',
  help: 'Connexions Socket.IO ouvertes sur ce pod',
  registers: [registry],
});

export const chatMessages = new client.Counter({
  name: 'nexora_chat_messages_total',
  help: 'Messages de chat envoyés',
  registers: [registry],
});

export const notificationsTotal = new client.Counter({
  name: 'nexora_notifications_total',
  help: 'Notifications créées ou mises en file',
  labelNames: ['type', 'mode'],
  registers: [registry],
});

export const jobsTotal = new client.Counter({
  name: 'nexora_jobs_total',
  help: 'Jobs traités par le worker',
  labelNames: ['queue', 'status'],
  registers: [registry],
});

export const moderationTotal = new client.Counter({
  name: 'nexora_moderation_total',
  help: 'Décisions de la modération IA',
  labelNames: ['decision'],
  registers: [registry],
});

/** Normalise l'URL pour limiter la cardinalité : /api/posts/65ab…/like -> /api/posts/:id/like */
export const routeLabel = (url) =>
  url.split('?')[0].replace(/\/[a-f0-9]{24}(?=\/|$)/g, '/:id').replace(/\/\d+(?=\/|$)/g, '/:n');

export function httpMetrics(req, res, next) {
  if (req.path === '/metrics') return next();
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = res.statusCode === 404 ? 'not_found' : routeLabel(req.originalUrl);
    end({ method: req.method, route, status: res.statusCode });
  });
  next();
}

export async function metricsHandler(_req, res) {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}
