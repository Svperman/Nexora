import { Router } from 'express';
import { z } from 'zod';
import { Post, Comment } from '../models.js';
import { ah, HttpError, requireAuth } from '../middleware.js';
import { notify } from '../notifications.js';

const router = Router();
router.use(requireAuth);

const AUTHOR = 'username role';
const contentInput = (max) => z.object({ content: z.string().trim().min(1).max(max) });
const pageInput = z.object({
  cursor: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const serializePost = (post, me) => {
  const json = post.toJSON();
  json.likeCount = post.likes.length;
  json.likedByMe = post.likes.some((id) => String(id) === me);
  delete json.likes;
  return json;
};

// Feed paginé par curseur (infinite scroll côté client).
router.get('/', ah(async (req, res) => {
  const { cursor, limit } = pageInput.parse(req.query);
  const posts = await Post.find(cursor ? { _id: { $lt: cursor } } : {})
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('author', AUTHOR);
  const hasMore = posts.length > limit;
  const items = posts.slice(0, limit).map((p) => serializePost(p, req.user.id));
  res.json({ items, nextCursor: hasMore ? items.at(-1).id : null });
}));

router.post('/', ah(async (req, res) => {
  const { content } = contentInput(2000).parse(req.body);
  const post = await Post.create({ author: req.user.id, content });
  await post.populate('author', AUTHOR);
  const json = serializePost(post, req.user.id);
  req.app.get('io')?.emit('post:new', { ...json, likedByMe: false });
  res.status(201).json(json);
}));

router.delete('/:id', ah(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw new HttpError(404, 'Post introuvable');
  const isOwner = String(post.author) === req.user.id;
  if (!isOwner && !['admin', 'moderator'].includes(req.user.role)) throw new HttpError(403, 'Accès refusé');
  await Comment.deleteMany({ post: post._id });
  await post.deleteOne();
  req.app.get('io')?.emit('post:deleted', { id: req.params.id });
  res.status(204).end();
}));

router.post('/:id/like', ah(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw new HttpError(404, 'Post introuvable');
  const liked = post.likes.some((id) => String(id) === req.user.id);
  const updated = await Post.findByIdAndUpdate(
    post._id,
    liked ? { $pull: { likes: req.user.id } } : { $addToSet: { likes: req.user.id } },
    { new: true },
  );
  if (!liked) notify({ user: post.author, type: 'like', actor: req.user.id, ref: String(post._id) });
  const payload = { id: String(post._id), likeCount: updated.likes.length };
  req.app.get('io')?.emit('post:likes', payload);
  res.json({ ...payload, likedByMe: !liked });
}));

router.get('/:id/comments', ah(async (req, res) => {
  const comments = await Comment.find({ post: req.params.id }).sort({ _id: 1 }).limit(200).populate('author', AUTHOR);
  res.json({ items: comments.map((c) => c.toJSON()) });
}));

router.post('/:id/comments', ah(async (req, res) => {
  const { content } = contentInput(1000).parse(req.body);
  const post = await Post.findByIdAndUpdate(req.params.id, { $inc: { commentCount: 1 } }, { new: true });
  if (!post) throw new HttpError(404, 'Post introuvable');
  const comment = await Comment.create({ post: post._id, author: req.user.id, content });
  await comment.populate('author', AUTHOR);
  const json = comment.toJSON();
  const io = req.app.get('io');
  io?.to(`post:${post._id}`).emit('comment:new', json);
  io?.emit('post:comments', { id: String(post._id), commentCount: post.commentCount });
  notify({ user: post.author, type: 'comment', actor: req.user.id, ref: String(post._id) });
  res.status(201).json(json);
}));

export default router;
