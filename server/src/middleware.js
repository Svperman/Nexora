import { ZodError } from 'zod';
import { verifyAccessToken } from './auth.js';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Enveloppe un handler async pour transmettre les erreurs à Express 4. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Authentification requise'));
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new HttpError(401, 'Jeton invalide ou expiré'));
  }
}

/** RBAC simple : requireRole('admin') ou requireRole('admin', 'moderator'). */
export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'Accès refusé'));

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'Ressource introuvable'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Données invalides', details: err.flatten().fieldErrors });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'Déjà utilisé', fields: Object.keys(err.keyPattern || {}) });
  }
  if (err?.name === 'CastError') return res.status(400).json({ error: 'Identifiant invalide' });
  const status = err.status || 500;
  if (status >= 500) logger.error({ err, url: req.originalUrl }, 'Erreur serveur');
  res.status(status).json({ error: status >= 500 ? 'Erreur interne' : err.message });
}
