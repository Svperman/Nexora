import { Router } from 'express';
import { z } from 'zod';
import { User, Post, Comment, Message, AuditLog } from '../models.js';
import { ah, HttpError, requireAuth, requireRole } from '../middleware.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats', ah(async (_req, res) => {
  const since = new Date(Date.now() - 7 * 86400_000);
  const [users, posts, comments, messages, postsPerDay] = await Promise.all([
    User.countDocuments(),
    Post.countDocuments(),
    Comment.countDocuments(),
    Message.countDocuments(),
    Post.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  res.json({ users, posts, comments, messages, postsPerDay: postsPerDay.map((d) => ({ day: d._id, count: d.count })) });
}));

router.get('/audit', ah(async (_req, res) => {
  const items = await AuditLog.find().sort({ _id: -1 }).limit(100).populate('actor', 'username');
  res.json({ items: items.map((a) => a.toJSON()) });
}));

router.patch('/users/:id/role', ah(async (req, res) => {
  const { role } = z.object({ role: z.enum(['user', 'moderator', 'admin']) }).parse(req.body);
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  await AuditLog.create({ actor: req.user.id, action: 'admin.role_change', target: String(user._id), meta: { role }, ip: req.ip });
  res.json({ user: user.toJSON() });
}));

export default router;
