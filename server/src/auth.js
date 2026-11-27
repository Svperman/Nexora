import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { RefreshToken, AuditLog } from './models.js';

export const REFRESH_COOKIE = 'nx_rt';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id ?? user.id), role: user.role }, config.jwtAccessSecret, {
    expiresIn: config.accessTokenTtl,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtAccessSecret);
}

/** Émet un nouveau refresh token (dans une famille existante ou nouvelle). */
export async function issueRefreshToken(userId, family = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString('base64url');
  await RefreshToken.create({
    user: userId,
    tokenHash: sha256(token),
    family,
    expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86400_000),
  });
  return token;
}

/**
 * Rotation : le token présenté est révoqué et remplacé.
 * Si un token déjà révoqué est réutilisé (vol probable), toute la famille est révoquée.
 */
export async function rotateRefreshToken(token) {
  const doc = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (!doc || doc.expiresAt < new Date()) return null;

  if (doc.revokedAt) {
    await RefreshToken.updateMany({ family: doc.family, revokedAt: null }, { revokedAt: new Date() });
    await AuditLog.create({ actor: doc.user, action: 'auth.refresh_reuse_detected', target: doc.family });
    return null;
  }

  const next = await issueRefreshToken(doc.user, doc.family);
  doc.revokedAt = new Date();
  doc.replacedBy = sha256(next);
  await doc.save();
  return { userId: doc.user, token: next };
}

export async function revokeRefreshToken(token) {
  const doc = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (doc) await RefreshToken.updateMany({ family: doc.family, revokedAt: null }, { revokedAt: new Date() });
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: config.refreshTokenTtlDays * 86400_000,
  };
}
