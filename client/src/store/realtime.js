import { create } from 'zustand';
import { io } from 'socket.io-client';
import { refreshSession } from '../api.js';

/** Socket unique + notifications temps réel. */
export const useRealtime = create((set, get) => ({
  socket: null,
  notifications: [],
  unread: 0,

  connect(token) {
    get().socket?.close();
    // En dev : même origine (proxy Vite). En prod sur Vercel : connexion directe à l'API (Render),
    // car les rewrites Vercel ne relaient pas les WebSocket. L'auth passe par le token, pas par cookie.
    const url = import.meta.env.VITE_SOCKET_URL || undefined;
    const socket = io(url, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', async (err) => {
      if (err.message === 'unauthorized') {
        try {
          socket.auth.token = await refreshSession();
          socket.connect();
        } catch { /* session expirée : l'UI revient au login */ }
      }
    });
    socket.on('notification', (n) => set((s) => ({ notifications: [n, ...s.notifications].slice(0, 50), unread: s.unread + 1 })));
    set({ socket });
  },
  disconnect() {
    get().socket?.close();
    set({ socket: null, notifications: [], unread: 0 });
  },
  setNotifications: ({ items, unread }) => set({ notifications: items, unread }),
  markAllRead: () => set({ unread: 0 }),
}));
