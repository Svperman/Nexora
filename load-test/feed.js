// Test de charge k6 : inscription, lecture du fil, publication, like.
// Lancer :  k6 run -e BASE_URL=https://staging.nexora.example.com load-test/feed.js
// Ne JAMAIS lancer contre la production : crée de vrais comptes et posts.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:5173';

export const options = {
  scenarios: {
    lecteurs: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  // Objectifs alignés sur les alertes Prometheus
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    'http_req_duration{name:feed}': ['p(95)<300'],
  },
};

const json = (token) => ({
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
});

export function setup() {
  // Un compte par VU possible serait plus réaliste ; un compte partagé suffit pour mesurer le fil.
  const id = `k6_${Date.now()}`;
  const res = http.post(`${BASE}/api/auth/register`, JSON.stringify({
    email: `${id}@load.test`, username: id, password: `k6-${id}-password`, acceptTerms: true,
  }), json());
  check(res, { 'inscription 201': (r) => r.status === 201 });
  return { token: res.json('accessToken') };
}

export default function ({ token }) {
  const feed = http.get(`${BASE}/api/posts?limit=20`, { ...json(token), tags: { name: 'feed' } });
  check(feed, { 'fil 200': (r) => r.status === 200 });

  if (Math.random() < 0.1) {
    const post = http.post(`${BASE}/api/posts`, JSON.stringify({ content: `k6 ${__VU}-${__ITER}` }), { ...json(token), tags: { name: 'post' } });
    check(post, { 'post 201': (r) => r.status === 201 });
  }

  const items = feed.json('items') || [];
  if (items.length && Math.random() < 0.3) {
    const target = items[Math.floor(Math.random() * items.length)].id;
    http.post(`${BASE}/api/posts/${target}/like`, null, { ...json(token), tags: { name: 'like' } });
  }
  sleep(1 + Math.random() * 2);
}
