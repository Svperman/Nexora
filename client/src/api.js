import { useAuth } from './store/auth.js';

// Au-delà, on considère l'API injoignable (l'offre gratuite Render met ~30-60 s à se réveiller).
const TIMEOUT_MS = 25_000;
const UPLOAD_TIMEOUT_MS = 60_000;

let refreshing = null;

/** Erreur "serveur injoignable" : délai dépassé, réseau coupé ou passerelle en erreur (502/503/504). */
function offlineError() {
  const err = new Error('Serveur injoignable');
  err.offline = true;
  err.status = 0;
  return err;
}

/** fetch vers l'API avec délai maximal ; met à jour l'indicateur "serveur injoignable". */
async function apiFetch(url, init, timeoutMs = TIMEOUT_MS) {
  let res;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    useAuth.getState().setServerDown(true);
    throw offlineError();
  }
  if ([502, 503, 504].includes(res.status) && !res.headers.get('content-type')?.includes('application/json')) {
    useAuth.getState().setServerDown(true);
    throw offlineError();
  }
  useAuth.getState().setServerDown(false);
  return res;
}

/** Rafraîchit l'access token une seule fois même si plusieurs requêtes échouent en parallèle. */
export function refreshSession() {
  refreshing ??= apiFetch('/api/auth/refresh', { method: 'POST' })
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
  const res = await apiFetch(`/api${path}`, {
    method,
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
  const res = await apiFetch('/api/uploads', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  }, UPLOAD_TIMEOUT_MS);
  if (res.status === 401 && retry && token) {
    await refreshSession();
    return uploadImage(file, false);
  }
  return parseResponse(res);
}
