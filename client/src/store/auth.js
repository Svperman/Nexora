import { create } from 'zustand';

// L'access token reste en mémoire (jamais en localStorage) ; le refresh token est un cookie httpOnly.
export const useAuth = create((set, get) => ({
  accessToken: null,
  user: null,
  ready: false,
  serverDown: false, // l'API n'a pas répondu (délai dépassé, réseau, passerelle)
  setSession: ({ accessToken, user }) => set({ accessToken, user, ready: true, serverDown: false }),
  clear: () => set({ accessToken: null, user: null, ready: true }),
  setServerDown: (serverDown) => get().serverDown !== serverDown && set({ serverDown }),
}));
