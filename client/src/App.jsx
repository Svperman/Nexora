import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth.js';
import { useRealtime } from './store/realtime.js';
import { api, refreshSession } from './api.js';
import AuthPage from './pages/AuthPage.jsx';
import Feed from './pages/Feed.jsx';
import Chat from './pages/Chat.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';

const LABELS = { like: 'a aimé votre post', comment: 'a commenté votre post', message: 'vous a envoyé un message' };

function Notifications() {
  const { notifications, unread, setNotifications, markAllRead } = useRealtime();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api('/notifications').then(setNotifications).catch(() => {});
  }, [setNotifications]);

  const toggle = async () => {
    setOpen((o) => !o);
    if (!open && unread > 0) {
      markAllRead();
      await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
    }
  };

  return (
    <div className="notif">
      <button className="ghost" onClick={toggle} aria-expanded={open} aria-label={`Notifications (${unread} non lues)`}>
        🔔{unread > 0 && <span className="badge">{unread}</span>}
      </button>
      {open && (
        <ul className="notif-panel">
          {notifications.length === 0 && <li className="muted">Aucune notification</li>}
          {notifications.map((n) => (
            <li key={n.id}>
              <strong>{n.actor?.username ?? "Quelqu'un"}</strong> {LABELS[n.type]}
              <time>{new Date(n.createdAt).toLocaleString('fr-FR')}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  const { user, ready, accessToken } = useAuth();
  const { connect, disconnect } = useRealtime();

  // Au chargement : tentative de restauration de session via le cookie refresh.
  useEffect(() => {
    refreshSession().catch(() => {});
  }, []);

  const loggedIn = Boolean(user);
  useEffect(() => {
    if (loggedIn) connect(useAuth.getState().accessToken);
    else disconnect();
    // Reconnexion uniquement à la connexion/déconnexion ; les refresh ultérieurs sont gérés par le store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  if (!ready) return <div className="center muted">Chargement…</div>;
  if (!user || !accessToken) return <AuthPage />;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    useAuth.getState().clear();
  };

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">Nexora</span>
        <nav>
          <NavLink to="/" end>Fil</NavLink>
          <NavLink to="/messages">Messages</NavLink>
          <NavLink to="/settings">Compte</NavLink>
          {user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <Notifications />
        <button className="ghost" onClick={logout}>Déconnexion</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/messages" element={<Chat />} />
          <Route path="/messages/:peerId" element={<Chat />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={user.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
