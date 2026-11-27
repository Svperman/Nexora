import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth.js';
import { useRealtime } from './store/realtime.js';
import { useCall } from './store/call.js';
import { api, refreshSession } from './api.js';
import { useT } from './i18n.js';
import AuthPage from './pages/AuthPage.jsx';
import Feed from './pages/Feed.jsx';
import Chat from './pages/Chat.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import Moderation from './pages/Moderation.jsx';
import CallOverlay from './components/CallOverlay.jsx';
import ServerStatus from './components/ServerStatus.jsx';

const isModerator = (user) => ['admin', 'moderator'].includes(user.role);

function Notifications() {
  const t = useT();
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
      <button className="ghost" onClick={toggle} aria-expanded={open} aria-label={t('notif.title', { n: unread })}>
        🔔{unread > 0 && <span className="badge">{unread}</span>}
      </button>
      {open && (
        <ul className="notif-panel">
          {notifications.length === 0 && <li className="muted">{t('notif.empty')}</li>}
          {notifications.map((n) => (
            <li key={n.id}>
              <strong>{n.actor?.username ?? t('notif.someone')}</strong> {t(`notif.${n.type}`)}
              <time>{t.date(n.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  const t = useT();
  const { user, ready, accessToken } = useAuth();
  const { connect, disconnect } = useRealtime();
  const socket = useRealtime((s) => s.socket);
  const bindCalls = useCall((s) => s.bind);

  // Au chargement : tentative de restauration de session via le cookie refresh.
  useEffect(() => {
    refreshSession().catch(() => {});
  }, []);

  const loggedIn = Boolean(user);
  useEffect(() => {
    if (loggedIn) connect(useAuth.getState().accessToken);
    else {
      useCall.getState().hangup(null);
      disconnect();
    }
    // Reconnexion uniquement à la connexion/déconnexion ; les refresh ultérieurs sont gérés par le store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  useEffect(() => (socket ? bindCalls(socket) : undefined), [socket, bindCalls]);

  if (!ready) return <div className="center muted">{t('app.loading')}</div>;
  if (!user || !accessToken) return <><ServerStatus /><AuthPage /></>;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    useAuth.getState().clear();
  };

  return (
    <div className="layout">
      <ServerStatus />
      <header className="topbar">
        <span className="brand">Nexora</span>
        <nav>
          <NavLink to="/" end>{t('nav.feed')}</NavLink>
          <NavLink to="/messages">{t('nav.messages')}</NavLink>
          <NavLink to="/settings">{t('nav.account')}</NavLink>
          {isModerator(user) && <NavLink to="/moderation">{t('nav.moderation')}</NavLink>}
          {user.role === 'admin' && <NavLink to="/admin">{t('nav.admin')}</NavLink>}
        </nav>
        <Notifications />
        <button className="ghost" onClick={logout}>{t('nav.logout')}</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/messages" element={<Chat />} />
          <Route path="/messages/:peerId" element={<Chat />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/moderation" element={isModerator(user) ? <Moderation /> : <Navigate to="/" />} />
          <Route path="/admin" element={user.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <CallOverlay />
    </div>
  );
}
