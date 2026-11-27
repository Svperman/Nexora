// File de revue humaine : contenus signalés par la modération IA (ou dont l'analyse a échoué).
import { Router } from 'express';
import { z } from 'zod';
import { Post, Comment, AuditLog } from '../models.js';
import { ah, HttpError, requireAuth, requireRole } from '../middleware.js';
import { deleteImages } from './uploads.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'moderator'));

const MODELS = { post: Post, comment: Comment };

router.get('/queue', ah(async (_req, res) => {
  const filter = { 'moderation.status': 'pending_review' };
  const [posts, comments] = await Promise.all([
    Post.find(filter).sort({ _id: 1 }).limit(50).populate('author', 'username'),
    Comment.find(filter).sort({ _id: 1 }).limit(50).populate('author', 'username'),
  ]);
  res.json({
    items: [
      ...posts.map((p) => ({ kind: 'post', ...p.toJSON() })),
      ...comments.map((c) => ({ kind: 'comment', ...c.toJSON() })),
    ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
  });
}));

router.post('/:kind/:id', ah(async (req, res) => {
  const { kind, id } = z.object({ kind: z.enum(['post', 'comment']), id: z.string().regex(/^[a-f0-9]{24}$/) }).parse(req.params);
  const { action } = z.object({ action: z.enum(['approve', 'remove']) }).parse(req.body);
  const doc = await MODELS[kind].findById(id);
  if (!doc) throw new HttpError(404, 'Contenu introuvable');
  const io = req.app.get('io');

  if (action === 'approve') {
    doc.moderation.status = 'approved';
    doc.moderation.reviewedBy = req.user.id;
    doc.moderation.reviewedAt = new Date();
    await doc.save();
    if (kind === 'comment') {
      const post = await Post.findByIdAndUpdate(doc.post, { $inc: { commentCount: 1 } }, { new: true });
      if (post) io?.emit('post:comments', { id: String(post._id), commentCount: post.commentCount });
    }
  } else {
    if (kind === 'post') {
      await Comment.deleteMany({ post: doc._id });
      await deleteImages(doc.images);
      io?.emit('post:deleted', { id });
    }
    await doc.deleteOne();
  }
  await AuditLog.create({ actor: req.user.id, action: `moderation.${action}_${kind}`, target: id, ip: req.ip });
  res.json({ ok: true });
}));

export default router;
