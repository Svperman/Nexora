import { useEffect, useRef, useState } from 'react';
import { useFeed } from '../store/feed.js';
import { useRealtime } from '../store/realtime.js';
import { useAuth } from '../store/auth.js';
import { api, uploadImage } from '../api.js';
import { useT } from '../i18n.js';

const MAX_IMAGES = 4;

/** Message d'erreur lisible, avec le motif de la modération le cas échéant. */
const errorText = (t, err) => (err.status === 422 && err.reason ? t('feed.rejected', { reason: err.reason }) : err.message);

function Comments({ postId }) {
  const t = useT();
  const socket = useRealtime((s) => s.socket);
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/posts/${postId}/comments`).then((d) => setItems(d.items)).catch(() => {});
    if (!socket) return;
    const onNew = (c) => c.post === postId && setItems((xs) => (xs.some((x) => x.id === c.id) ? xs : [...xs, c]));
    socket.emit('post:join', postId);
    socket.on('comment:new', onNew);
    return () => {
      socket.emit('post:leave', postId);
      socket.off('comment:new', onNew);
    };
  }, [postId, socket]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try {
      const c = await api(`/posts/${postId}/comments`, { method: 'POST', body: { content: text } });
      setItems((xs) => (xs.some((x) => x.id === c.id) ? xs : [...xs, c]));
      setText('');
    } catch (err) {
      setError(errorText(t, err));
    }
  };

  return (
    <div className="comments">
      {items.map((c) => (
        <p key={c.id} className={c.pendingReview ? 'pending' : ''}>
          <strong>{c.author?.username}</strong> {c.content}
          {c.pendingReview && <small className="muted"> · {t('feed.pending')}</small>}
        </p>
      ))}
      <form onSubmit={send} className="row">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('feed.commentPlaceholder')} maxLength={1000} />
        <button>{t('feed.send')}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function Images({ images }) {
  const t = useT();
  if (!images?.length) return null;
  return (
    <div className={`images n${images.length}`}>
      {images.map((img) => (
        <a key={img.url} href={img.url} target="_blank" rel="noopener noreferrer">
          <img src={img.url} alt={t('feed.image')} loading="lazy" width={img.width} height={img.height} />
        </a>
      ))}
    </div>
  );
}

function PostCard({ post }) {
  const t = useT();
  const { toggleLike, remove } = useFeed();
  const me = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const canDelete = post.author?.id === me.id || ['admin', 'moderator'].includes(me.role);

  return (
    <article className={`card post${post.pendingReview ? ' pending' : ''}`}>
      <header>
        <strong>{post.author?.username ?? t('feed.deleted')}</strong>
        <time>{t.date(post.createdAt)}</time>
      </header>
      {post.pendingReview && <p className="badge-pending">{t('feed.pending')}</p>}
      {post.content && <p className="content">{post.content}</p>}
      <Images images={post.images} />
      <footer className="row">
        <button className={post.likedByMe ? 'ghost active' : 'ghost'} onClick={() => toggleLike(post.id)} aria-pressed={post.likedByMe}>
          ♥ {post.likeCount}
        </button>
        <button className="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>💬 {post.commentCount}</button>
        {canDelete && (
          <button className="ghost danger" onClick={() => confirm(t('feed.confirmDelete')) && remove(post.id)}>{t('feed.delete')}</button>
        )}
      </footer>
      {open && <Comments postId={post.id} />}
    </article>
  );
}

function Composer() {
  const t = useT();
  const create = useFeed((s) => s.create);
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);

  const addFiles = async (files) => {
    setError(null);
    const room = MAX_IMAGES - images.length;
    if (files.length > room) setError(t('feed.maxImages'));
    setUploading(true);
    try {
      for (const file of [...files].slice(0, room)) {
        const img = await uploadImage(file);
        setImages((xs) => [...xs, img]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const publish = async (e) => {
    e.preventDefault();
    if (!text.trim() && images.length === 0) return;
    setError(null);
    try {
      await create(text, images);
      setText('');
      setImages([]);
    } catch (err) {
      setError(errorText(t, err));
      // Images supprimées côté serveur si le post est refusé
      if (err.status === 422) setImages([]);
    }
  };

  return (
    <form className="card composer" onSubmit={publish}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('feed.placeholder')} maxLength={2000} rows={3} />
      {images.length > 0 && (
        <div className="previews">
          {images.map((img) => (
            <figure key={img.url}>
              <img src={img.url} alt="" />
              <button type="button" className="remove" aria-label={t('feed.removeImage')}
                onClick={() => setImages((xs) => xs.filter((x) => x.url !== img.url))}>×</button>
            </figure>
          ))}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row between">
        <label className={`ghost file${images.length >= MAX_IMAGES || uploading ? ' disabled' : ''}`}>
          🖼 {uploading ? t('feed.uploading') : t('feed.addImage')}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden
            disabled={images.length >= MAX_IMAGES || uploading} onChange={(e) => addFiles(e.target.files)} />
        </label>
        <div className="row">
          <span className="muted">{text.length}/2000</span>
          <button disabled={uploading || (!text.trim() && images.length === 0)}>{t('feed.publish')}</button>
        </div>
      </div>
    </form>
  );
}

export default function Feed() {
  const t = useT();
  const { posts, hasMore, loading, error, loadMore, reset, addPost, removePost, patchPost } = useFeed();
  const socket = useRealtime((s) => s.socket);
  const sentinel = useRef(null);

  useEffect(() => {
    reset();
    loadMore();
  }, [reset, loadMore]);

  // Infinite scroll : charge la page suivante quand la sentinelle devient visible.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => entry.isIntersecting && loadMore(), { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // Mises à jour temps réel du fil.
  useEffect(() => {
    if (!socket) return;
    const onLikes = ({ id, likeCount }) => patchPost(id, { likeCount });
    const onComments = ({ id, commentCount }) => patchPost(id, { commentCount });
    const onDeleted = ({ id }) => removePost(id);
    socket.on('post:new', addPost);
    socket.on('post:likes', onLikes);
    socket.on('post:comments', onComments);
    socket.on('post:deleted', onDeleted);
    return () => {
      socket.off('post:new', addPost);
      socket.off('post:likes', onLikes);
      socket.off('post:comments', onComments);
      socket.off('post:deleted', onDeleted);
    };
  }, [socket, addPost, patchPost, removePost]);

  return (
    <section className="feed">
      <Composer />
      {posts.map((p) => <PostCard key={p.id} post={p} />)}
      {error && <p className="error">{error} <button className="link" onClick={loadMore}>{t('feed.retry')}</button></p>}
      <div ref={sentinel} className="muted center-text">
        {loading ? t('app.loading') : hasMore ? '' : posts.length ? t('feed.upToDate') : t('feed.empty')}
      </div>
    </section>
  );
}
