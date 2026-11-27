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
    const socket = io({ auth: { token }, transports: ['websocket'] });
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
