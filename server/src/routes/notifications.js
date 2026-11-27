import { Router } from 'express';
import { Notification } from '../models.js';
import { ah, requireAuth } from '../middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/', ah(async (req, res) => {
  const items = await Notification.find({ user: req.user.id }).sort({ _id: -1 }).limit(50).populate('actor', 'username');
  const unread = await Notification.countDocuments({ user: req.user.id, readAt: null });
  res.json({ items: items.map((n) => n.toJSON()), unread });
}));

router.post('/read-all', ah(async (req, res) => {
  await Notification.updateMany({ user: req.user.id, readAt: null }, { readAt: new Date() });
  res.status(204).end();
}));

export default router;
