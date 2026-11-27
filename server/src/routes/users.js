import { Router } from 'express';
import { z } from 'zod';
import { User, Post, Comment, Message, Notification, RefreshToken, AuditLog } from '../models.js';
import { ah, HttpError, requireAuth } from '../middleware.js';
import { REFRESH_COOKIE } from '../auth.js';
import { deleteImages } from './uploads.js';

const router = Router();
router.use(requireAuth);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/users/search', ah(async (req, res) => {
  const q = z.string().trim().min(1).max(30).parse(req.query.q);
  const users = await User.find({ username: { $regex: `^${escapeRegex(q)}`, $options: 'i' }, _id: { $ne: req.user.id } })
    .select('username role bio')
    .limit(10);
  res.json({ items: users.map((u) => u.toJSON()) });
}));

router.get('/users/:id', ah(async (req, res) => {
  const user = await User.findById(req.params.id).select('username role bio createdAt');
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  res.json({ user: user.toJSON() });
}));

/** Serveurs ICE pour WebRTC : STUN public + TURN optionnel (TURN_SERVERS, JSON). */
router.get('/rtc/config', (_req, res) => {
  let turn = [];
  try {
    turn = process.env.TURN_SERVERS ? JSON.parse(process.env.TURN_SERVERS) : [];
  } catch {
    turn = [];
  }
  res.json({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, ...turn] });
});

// ---- RGPD -----------------------------------------------------------------

/** Droit d'accès / portabilité : export JSON de toutes les données de l'utilisateur. */
router.get('/me/export', ah(async (req, res) => {
  const id = req.user.id;
  const [user, posts, comments, messages, notifications] = await Promise.all([
    User.findById(id),
    Post.find({ author: id }).lean(),
    Comment.find({ author: id }).lean(),
    Message.find({ $or: [{ from: id }, { to: id }] }).lean(),
    Notification.find({ user: id }).lean(),
  ]);
  await AuditLog.create({ actor: id, action: 'gdpr.export', ip: req.ip });
  res.setHeader('Content-Disposition', 'attachment; filename="nexora-export.json"');
  res.json({ exportedAt: new Date(), user: user?.toJSON(), posts, comments, messages, notifications });
}));

router.patch('/me/consents', ah(async (req, res) => {
  const { marketing } = z.object({ marketing: z.boolean() }).parse(req.body);
  const user = await User.findByIdAndUpdate(req.user.id, { 'consents.marketing': marketing }, { new: true });
  await AuditLog.create({ actor: req.user.id, action: 'gdpr.consents', meta: { marketing }, ip: req.ip });
  res.json({ user: user.toJSON() });
}));

/** Droit à l'effacement : suppression du compte et des contenus associés. */
router.delete('/me', ah(async (req, res) => {
  const id = req.user.id;
  const posts = await Post.find({ author: id }).select('_id images');
  await deleteImages(posts.flatMap((p) => p.images));
  await Promise.all([
    Comment.deleteMany({ $or: [{ author: id }, { post: { $in: posts.map((p) => p._id) } }] }),
    Post.deleteMany({ author: id }),
    Post.updateMany({ likes: id }, { $pull: { likes: id } }),
    Message.deleteMany({ $or: [{ from: id }, { to: id }] }),
    Notification.deleteMany({ $or: [{ user: id }, { actor: id }] }),
    RefreshToken.deleteMany({ user: id }),
  ]);
  await User.deleteOne({ _id: id });
  // Journal conservé sans données personnelles (identifiant technique seulement).
  await AuditLog.create({ action: 'gdpr.account_deleted', target: id });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.status(204).end();
}));

export default router;
