import { create } from 'zustand';

// L'access token reste en mémoire (jamais en localStorage) ; le refresh token est un cookie httpOnly.
export const useAuth = create((set) => ({
  accessToken: null,
  user: null,
  ready: false,
  setSession: ({ accessToken, user }) => set({ accessToken, user, ready: true }),
  clear: () => set({ accessToken: null, user: null, ready: true }),
}));
