import { Router } from 'express';
import { z } from 'zod';
import { Post, Comment, AuditLog } from '../models.js';
import { ah, HttpError, requireAuth } from '../middleware.js';
import { notify } from '../notifications.js';
import { moderate, moderationStatus } from '../moderation.js';
import { deleteImages, isOwnImageUrl } from './uploads.js';

const router = Router();
router.use(requireAuth);

const AUTHOR = 'username role';
const isModerator = (user) => ['admin', 'moderator'].includes(user.role);

const imageInput = z.object({
  url: z.string().max(500).refine(isOwnImageUrl, 'Image non hébergée par Nexora'),
  publicId: z.string().max(200).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
const postInput = z.object({
  content: z.string().trim().max(2000).default(''),
  images: z.array(imageInput).max(4).default([]),
}).refine((p) => p.content.length > 0 || p.images.length > 0, { message: 'Texte ou image requis', path: ['content'] });
const commentInput = z.object({ content: z.string().trim().min(1).max(1000) });
const pageInput = z.object({
  cursor: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Les contenus en attente de revue ne sont visibles que par leur auteur et les modérateurs. */
const visibleTo = (user) =>
  isModerator(user) ? {} : { $or: [{ 'moderation.status': { $ne: 'pending_review' } }, { author: user.id }] };

function serialize(doc, user) {
  const json = doc.toJSON();
  json.pendingReview = doc.moderation?.status === 'pending_review';
  if (!isModerator(user)) delete json.moderation;
  if (doc.likes) {
    json.likeCount = doc.likes.length;
    json.likedByMe = doc.likes.some((id) => String(id) === user.id);
    delete json.likes;
  }
  return json;
}

/** Applique la modération IA ; lève 422 si le contenu est bloqué. */
async function moderateOrReject(req, kind, text, imageUrls = []) {
  const verdict = await moderate({ text, imageUrls });
  if (verdict.decision === 'block') {
    // Le contenu bloqué n'est pas stocké ; seul le motif est journalisé.
    await AuditLog.create({
      actor: req.user.id, action: `moderation.blocked_${kind}`, meta: { categories: verdict.categories, reason: verdict.reason }, ip: req.ip,
    });
    const err = new HttpError(422, 'Contenu refusé par la modération');
    err.reason = verdict.reason;
    throw err;
  }
  return { status: moderationStatus(verdict.decision), decision: verdict.decision, categories: verdict.categories, reason: verdict.reason };
}

// Feed paginé par curseur (infinite scroll côté client).
router.get('/', ah(async (req, res) => {
  const { cursor, limit } = pageInput.parse(req.query);
  const filter = { ...visibleTo(req.user), ...(cursor ? { _id: { $lt: cursor } } : {}) };
  const posts = await Post.find(filter).sort({ _id: -1 }).limit(limit + 1).populate('author', AUTHOR);
  const hasMore = posts.length > limit;
  const items = posts.slice(0, limit).map((p) => serialize(p, req.user));
  res.json({ items, nextCursor: hasMore ? items.at(-1).id : null });
}));

router.post('/', ah(async (req, res) => {
  const { content, images } = postInput.parse(req.body);
  let moderation;
  try {
    moderation = await moderateOrReject(req, 'post', content, images.map((i) => i.url));
  } catch (err) {
    await deleteImages(images);
    throw err;
  }
  const post = await Post.create({ author: req.user.id, content, images, moderation });
  await post.populate('author', AUTHOR);
  const json = serialize(post, req.user);
  if (moderation.status === 'approved') {
    const publicJson = { ...json, likedByMe: false };
    delete publicJson.moderation;
    req.app.get('io')?.emit('post:new', publicJson);
  }
  res.status(201).json(json);
}));

router.delete('/:id', ah(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw new HttpError(404, 'Post introuvable');
  const isOwner = String(post.author) === req.user.id;
  if (!isOwner && !isModerator(req.user)) throw new HttpError(403, 'Accès refusé');
  await Comment.deleteMany({ post: post._id });
  await post.deleteOne();
  await deleteImages(post.images);
  if (!isOwner) {
    await AuditLog.create({ actor: req.user.id, action: 'moderation.post_removed', target: String(post._id), ip: req.ip });
  }
  req.app.get('io')?.emit('post:deleted', { id: req.params.id });
  res.status(204).end();
}));

async function findVisiblePost(req) {
  const post = await Post.findOne({ _id: req.params.id, ...visibleTo(req.user) });
  if (!post) throw new HttpError(404, 'Post introuvable');
  return post;
}

router.post('/:id/like', ah(async (req, res) => {
  const post = await findVisiblePost(req);
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
  const post = await findVisiblePost(req);
  const comments = await Comment.find({ post: post._id, ...visibleTo(req.user) })
    .sort({ _id: 1 }).limit(200).populate('author', AUTHOR);
  res.json({ items: comments.map((c) => serialize(c, req.user)) });
}));

router.post('/:id/comments', ah(async (req, res) => {
  const { content } = commentInput.parse(req.body);
  await findVisiblePost(req);
  const moderation = await moderateOrReject(req, 'comment', content);
  const approved = moderation.status === 'approved';
  const comment = await Comment.create({ post: req.params.id, author: req.user.id, content, moderation });
  // Le compteur public ne compte que les commentaires visibles de tous.
  const post = approved
    ? await Post.findByIdAndUpdate(req.params.id, { $inc: { commentCount: 1 } }, { new: true })
    : await Post.findById(req.params.id);
  await comment.populate('author', AUTHOR);
  const json = serialize(comment, req.user);
  if (approved) {
    const io = req.app.get('io');
    const publicJson = { ...json };
    delete publicJson.moderation;
    io?.to(`post:${post._id}`).emit('comment:new', publicJson);
    io?.emit('post:comments', { id: String(post._id), commentCount: post.commentCount });
    notify({ user: post.author, type: 'comment', actor: req.user.id, ref: String(post._id) });
  }
  res.status(201).json(json);
}));

export default router;
