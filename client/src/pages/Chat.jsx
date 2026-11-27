import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../store/auth.js';
import { useRealtime } from '../store/realtime.js';
import { useCall } from '../store/call.js';
import { useT } from '../i18n.js';

function UserSearch() {
  const t = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const timer = setTimeout(() => {
      api(`/users/search?q=${encodeURIComponent(q.trim())}`).then((d) => setResults(d.items)).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chat.search')} />
      {results.length > 0 && (
        <ul className="dropdown">
          {results.map((u) => (
            <li key={u.id}><button className="ghost" onClick={() => { setQ(''); navigate(`/messages/${u.id}`); }}>{u.username}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thread({ peerId }) {
  const t = useT();
  const me = useAuth((s) => s.user);
  const socket = useRealtime((s) => s.socket);
  const startCall = useCall((s) => s.start);
  const callBusy = useCall((s) => s.status !== 'idle');
  const [messages, setMessages] = useState([]);
  const [peer, setPeer] = useState(null);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState(null);
  const bottom = useRef(null);

  useEffect(() => {
    setMessages([]);
    api(`/users/${peerId}`).then((d) => setPeer(d.user)).catch(() => setPeer(null));
    api(`/messages/${peerId}`).then((d) => setMessages(d.items)).catch(() => {});
  }, [peerId]);

  useEffect(() => {
    if (!socket) return;
    let timer;
    const onMsg = (m) => {
      const inThread = (m.from === peerId && m.to === me.id) || (m.from === me.id && m.to === peerId);
      if (inThread) setMessages((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
    };
    const onTyping = ({ from }) => {
      if (from !== peerId) return;
      setTyping(true);
      clearTimeout(timer);
      timer = setTimeout(() => setTyping(false), 2000);
    };
    socket.on('chat:message', onMsg);
    socket.on('chat:typing', onTyping);
    return () => {
      clearTimeout(timer);
      socket.off('chat:message', onMsg);
      socket.off('chat:typing', onTyping);
    };
  }, [socket, peerId, me.id]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !socket) return;
    const res = await socket.emitWithAck('chat:send', { to: peerId, content: text });
    if (res?.error) return setError(res.error);
    setError(null);
    setText('');
  };

  return (
    <div className="thread card">
      <header className="row between">
        <span><strong>{peer?.username ?? '…'}</strong>{typing && <span className="muted"> {t('chat.typing')}</span>}</span>
        {peer && (
          <span className="row">
            <button className="ghost" disabled={callBusy} onClick={() => startCall(peer, false)} aria-label={t('chat.audioCall')} title={t('chat.audioCall')}>📞</button>
            <button className="ghost" disabled={callBusy} onClick={() => startCall(peer, true)} aria-label={t('chat.videoCall')} title={t('chat.videoCall')}>🎥</button>
          </span>
        )}
      </header>
      <div className="messages">
        {messages.map((m) => (
          <p key={m.id} className={m.from === me.id ? 'bubble mine' : 'bubble'}>{m.content}</p>
        ))}
        <div ref={bottom} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="row" onSubmit={send}>
        <input value={text} onChange={(e) => { setText(e.target.value); socket?.emit('chat:typing', peerId); }}
          placeholder={t('chat.placeholder')} maxLength={2000} />
        <button>{t('feed.send')}</button>
      </form>
    </div>
  );
}

export default function Chat() {
  const t = useT();
  const { peerId } = useParams();
  const socket = useRealtime((s) => s.socket);
  const [convs, setConvs] = useState([]);

  useEffect(() => {
    const load = () => api('/messages').then((d) => setConvs(d.items)).catch(() => {});
    load();
    socket?.on('chat:message', load);
    return () => socket?.off('chat:message', load);
  }, [socket, peerId]);

  return (
    <section className="chat">
      <aside className="card">
        <UserSearch />
        <ul className="convs">
          {convs.length === 0 && <li className="muted">{t('chat.empty')}</li>}
          {convs.map((c) => (
            <li key={c.peer.id} className={c.peer.id === peerId ? 'active' : ''}>
              <Link to={`/messages/${c.peer.id}`}>
                <strong>{c.peer.username}</strong>
                {c.unread > 0 && c.peer.id !== peerId && <span className="badge">{c.unread}</span>}
                <span className="muted ellipsis">{c.lastMessage.content}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      {peerId ? <Thread peerId={peerId} /> : <div className="card center muted">{t('chat.choose')}</div>}
    </section>
  );
}
