import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User, AuditLog } from '../models.js';
import { ah, HttpError, requireAuth } from '../middleware.js';
import {
  REFRESH_COOKIE,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  refreshCookieOptions,
} from '../auth.js';
import { config } from '../config.js';

const router = Router();
const DUMMY_HASH = bcrypt.hashSync('nexora-dummy-password', 12);

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: config.isTest ? 1000 : 20, standardHeaders: 'draft-7', legacyHeaders: false });

const registerInput = z.object({
  email: z.string().email().max(254),
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/, 'lettres, chiffres, _ et . uniquement'),
  password: z.string().min(10).max(128),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Les conditions doivent être acceptées' }) }),
  marketing: z.boolean().optional(),
});
const loginInput = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });

async function sendSession(res, user, status = 200) {
  const refresh = await issueRefreshToken(user._id);
  res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
  res.status(status).json({ accessToken: signAccessToken(user), user: user.toJSON() });
}

router.post('/register', limiter, ah(async (req, res) => {
  const body = registerInput.parse(req.body);
  const user = await User.create({
    email: body.email,
    username: body.username,
    passwordHash: await bcrypt.hash(body.password, 12),
    consents: { terms: new Date(), marketing: Boolean(body.marketing) },
  });
  await AuditLog.create({ actor: user._id, action: 'auth.register', ip: req.ip });
  await sendSession(res, user, 201);
}));

router.post('/login', limiter, ah(async (req, res) => {
  const { email, password } = loginInput.parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  // Comparaison toujours effectuée pour limiter les attaques temporelles.
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Identifiants incorrects');
  await AuditLog.create({ actor: user._id, action: 'auth.login', ip: req.ip });
  await sendSession(res, user);
}));

router.post('/refresh', limiter, ah(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  const rotated = token && (await rotateRefreshToken(token));
  if (!rotated) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    throw new HttpError(401, 'Session expirée');
  }
  const user = await User.findById(rotated.userId);
  if (!user) throw new HttpError(401, 'Session expirée');
  res.cookie(REFRESH_COOKIE, rotated.token, refreshCookieOptions());
  res.json({ accessToken: signAccessToken(user), user: user.toJSON() });
}));

router.post('/logout', ah(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.status(204).end();
}));

router.get('/me', requireAuth, ah(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  res.json({ user: user.toJSON() });
}));

export default router;
