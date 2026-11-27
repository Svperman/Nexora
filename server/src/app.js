import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler, notFound } from './middleware.js';
import { httpMetrics, metricsHandler } from './metrics.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import userRoutes from './routes/users.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import moderationRoutes from './routes/moderation.js';
import uploadRoutes, { LOCAL_UPLOAD_DIR } from './routes/uploads.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy); // Ingress, Render, Vercel…
  app.disable('x-powered-by');

  app.use(httpMetrics);
  app.get('/metrics', metricsHandler);
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (!config.isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => /^\/(healthz|readyz|metrics)/.test(req.url) } }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ mongo: ready });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/moderation', moderationRoutes);
  app.use('/api/uploads', uploadRoutes);
  if (!config.isProd) {
    // Repli de développement quand Cloudinary n'est pas configuré.
    app.use('/uploads', express.static(LOCAL_UPLOAD_DIR, { fallthrough: false, maxAge: '1h' }));
  }
  app.use('/api', userRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
