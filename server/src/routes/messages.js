import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Message, User, conversationId } from '../models.js';
import { ah, requireAuth } from '../middleware.js';

const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f0-9]{24}$/);

/** Liste des conversations : dernier message par interlocuteur. */
router.get('/', ah(async (req, res) => {
  const me = new mongoose.Types.ObjectId(req.user.id);
  const rows = await Message.aggregate([
    { $match: { $or: [{ from: me }, { to: me }] } },
    { $sort: { _id: -1 } },
    { $group: { _id: '$conversation', last: { $first: '$$ROOT' },
      unread: { $sum: { $cond: [{ $and: [{ $eq: ['$to', me] }, { $eq: ['$readAt', null] }] }, 1, 0] } } } },
    { $sort: { 'last._id': -1 } },
    { $limit: 50 },
  ]);
  const peerIds = rows.map((r) => (String(r.last.from) === req.user.id ? r.last.to : r.last.from));
  const peers = await User.find({ _id: { $in: peerIds } }).select('username');
  const byId = new Map(peers.map((p) => [String(p._id), p.toJSON()]));
  res.json({
    items: rows.map((r, i) => ({
      peer: byId.get(String(peerIds[i])) ?? { id: String(peerIds[i]), username: 'Compte supprimé' },
      lastMessage: { id: String(r.last._id), from: String(r.last.from), content: r.last.content, createdAt: r.last.createdAt },
      unread: r.unread,
    })),
  });
}));

/** Historique avec un utilisateur (pagination par curseur, du plus récent au plus ancien). */
router.get('/:userId', ah(async (req, res) => {
  const peer = objectId.parse(req.params.userId);
  const cursor = objectId.optional().parse(req.query.cursor);
  const conversation = conversationId(req.user.id, peer);
  const filter = cursor ? { conversation, _id: { $lt: cursor } } : { conversation };
  const items = await Message.find(filter).sort({ _id: -1 }).limit(31);
  const hasMore = items.length > 30;
  const page = items.slice(0, 30);
  await Message.updateMany({ conversation, to: req.user.id, readAt: null }, { readAt: new Date() });
  res.json({ items: page.reverse().map((m) => m.toJSON()), nextCursor: hasMore ? String(page[0]._id) : null });
}));

export default router;
