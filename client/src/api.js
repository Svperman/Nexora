import { useAuth } from './store/auth.js';

let refreshing = null;

/** Rafraîchit l'access token une seule fois même si plusieurs requêtes échouent en parallèle. */
export function refreshSession() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) throw new Error('session');
      const data = await res.json();
      useAuth.getState().setSession(data);
      return data.accessToken;
    })
    .catch((err) => {
      useAuth.getState().clear();
      throw err;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function api(path, { method = 'GET', body, retry = true } = {}) {
  const token = useAuth.getState().accessToken;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && token) {
    await refreshSession();
    return api(path, { method, body, retry: false });
  }
  if (res.status === 204) return null;
  return parseResponse(res);
}

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.status = res.status;
    err.details = data.details;
    err.reason = data.reason;
    throw err;
  }
  return data;
}

/** Envoi d'un fichier (multipart) vers /api/uploads. */
export async function uploadImage(file, retry = true) {
  const body = new FormData();
  body.append('image', file);
  const token = useAuth.getState().accessToken;
  const res = await fetch('/api/uploads', {
    method: 'POST',
    credentials: 'same-origin',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  if (res.status === 401 && retry && token) {
    await refreshSession();
    return uploadImage(file, false);
  }
  return parseResponse(res);
}
