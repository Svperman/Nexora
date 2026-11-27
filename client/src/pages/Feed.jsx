import { useEffect, useRef, useState } from 'react';
import { useFeed } from '../store/feed.js';
import { useRealtime } from '../store/realtime.js';
import { useAuth } from '../store/auth.js';
import { api } from '../api.js';

function Comments({ postId }) {
  const socket = useRealtime((s) => s.socket);
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');

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
    const c = await api(`/posts/${postId}/comments`, { method: 'POST', body: { content: text } });
    setItems((xs) => (xs.some((x) => x.id === c.id) ? xs : [...xs, c]));
    setText('');
  };

  return (
    <div className="comments">
      {items.map((c) => (
        <p key={c.id}><strong>{c.author?.username}</strong> {c.content}</p>
      ))}
      <form onSubmit={send} className="row">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Écrire un commentaire…" maxLength={1000} />
        <button>Envoyer</button>
      </form>
    </div>
  );
}

function PostCard({ post }) {
  const { toggleLike, remove } = useFeed();
  const me = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const canDelete = post.author?.id === me.id || ['admin', 'moderator'].includes(me.role);

  return (
    <article className="card post">
      <header>
        <strong>{post.author?.username ?? 'Compte supprimé'}</strong>
        <time>{new Date(post.createdAt).toLocaleString('fr-FR')}</time>
      </header>
      <p className="content">{post.content}</p>
      <footer className="row">
        <button className={post.likedByMe ? 'ghost active' : 'ghost'} onClick={() => toggleLike(post.id)} aria-pressed={post.likedByMe}>
          ♥ {post.likeCount}
        </button>
        <button className="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>💬 {post.commentCount}</button>
        {canDelete && <button className="ghost danger" onClick={() => confirm('Supprimer ce post ?') && remove(post.id)}>Supprimer</button>}
      </footer>
      {open && <Comments postId={post.id} />}
    </article>
  );
}

export default function Feed() {
  const { posts, hasMore, loading, error, loadMore, reset, create, addPost, removePost, patchPost } = useFeed();
  const socket = useRealtime((s) => s.socket);
  const sentinel = useRef(null);
  const [text, setText] = useState('');

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

  const publish = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await create(text);
    setText('');
  };

  return (
    <section className="feed">
      <form className="card composer" onSubmit={publish}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Quoi de neuf ?" maxLength={2000} rows={3} />
        <div className="row end">
          <span className="muted">{text.length}/2000</span>
          <button disabled={!text.trim()}>Publier</button>
        </div>
      </form>
      {posts.map((p) => <PostCard key={p.id} post={p} />)}
      {error && <p className="error">{error} <button className="link" onClick={loadMore}>Réessayer</button></p>}
      <div ref={sentinel} className="muted center-text">
        {loading ? 'Chargement…' : hasMore ? '' : posts.length ? 'Vous êtes à jour ✨' : 'Aucun post pour le moment.'}
      </div>
    </section>
  );
}
