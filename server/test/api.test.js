process.env.NODE_ENV = 'test';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';

const { connectDb, disconnectDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createSocketServer } = await import('../src/socket.js');
const { initNotifications, closeNotifications } = await import('../src/notifications.js');

let app, server, io, port;

before(async () => {
  await connectDb();
  app = createApp();
  server = http.createServer(app);
  io = createSocketServer(server, null);
  app.set('io', io);
  initNotifications({ redis: null, emitter: io });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});

after(async () => {
  io.close();
  await new Promise((r) => server.close(r));
  await closeNotifications();
  await disconnectDb();
});

const cookieOf = (res) => res.headers['set-cookie'].find((c) => c.startsWith('nx_rt=')).split(';')[0];

async function register(username) {
  const res = await request(app).post('/api/auth/register').send({
    email: `${username}@example.test`, username, password: 'motdepasse-solide', acceptTerms: true,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.accessToken, user: res.body.user, cookie: cookieOf(res) };
}

test('healthz', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
});

test('inscription : validation et unicité', async () => {
  const bad = await request(app).post('/api/auth/register').send({ email: 'x', username: 'a', password: '1' });
  assert.equal(bad.status, 400);
  await register('alice');
  const dup = await request(app).post('/api/auth/register').send({
    email: 'alice@example.test', username: 'alice2', password: 'motdepasse-solide', acceptTerms: true,
  });
  assert.equal(dup.status, 409);
});

test('login + rotation du refresh token + détection de réutilisation', async () => {
  const login = await request(app).post('/api/auth/login').send({ email: 'alice@example.test', password: 'motdepasse-solide' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.passwordHash, undefined);
  const c1 = cookieOf(login);

  const r1 = await request(app).post('/api/auth/refresh').set('Cookie', c1);
  assert.equal(r1.status, 200);
  const c2 = cookieOf(r1);
  assert.notEqual(c1, c2);

  // Réutilisation de l'ancien token => refus + révocation de toute la famille
  const reuse = await request(app).post('/api/auth/refresh').set('Cookie', c1);
  assert.equal(reuse.status, 401);
  const after = await request(app).post('/api/auth/refresh').set('Cookie', c2);
  assert.equal(after.status, 401);

  const wrong = await request(app).post('/api/auth/login').send({ email: 'alice@example.test', password: 'mauvais' });
  assert.equal(wrong.status, 401);
});

test('feed, likes, commentaires et notifications', async () => {
  const bob = await register('bob');
  const carol = await register('carol');
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  assert.equal((await request(app).get('/api/posts')).status, 401);

  for (let i = 0; i < 3; i++) {
    const r = await request(app).post('/api/posts').set(auth(bob.token)).send({ content: `post ${i}` });
    assert.equal(r.status, 201);
  }
  const page1 = await request(app).get('/api/posts?limit=2').set(auth(carol.token));
  assert.equal(page1.body.items.length, 2);
  assert.equal(page1.body.items[0].content, 'post 2');
  assert.ok(page1.body.nextCursor);
  const page2 = await request(app).get(`/api/posts?limit=2&cursor=${page1.body.nextCursor}`).set(auth(carol.token));
  assert.equal(page2.body.items.length, 1);
  assert.equal(page2.body.nextCursor, null);

  const postId = page1.body.items[0].id;
  const like = await request(app).post(`/api/posts/${postId}/like`).set(auth(carol.token));
  assert.deepEqual([like.body.likeCount, like.body.likedByMe], [1, true]);
  const comment = await request(app).post(`/api/posts/${postId}/comments`).set(auth(carol.token)).send({ content: 'Bravo' });
  assert.equal(comment.status, 201);
  assert.equal(comment.body.author.username, 'carol');

  const notifs = await request(app).get('/api/notifications').set(auth(bob.token));
  assert.equal(notifs.body.unread, 2);

  const forbidden = await request(app).delete(`/api/posts/${postId}`).set(auth(carol.token));
  assert.equal(forbidden.status, 403);
  const admin = await request(app).get('/api/admin/stats').set(auth(carol.token));
  assert.equal(admin.status, 403);
});

test('chat temps réel via Socket.IO', async () => {
  const dan = await register('dan');
  const eve = await register('eve');
  const connect = (token) => new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
  const sDan = await connect(dan.token);
  const sEve = await connect(eve.token);

  const received = new Promise((r) => sEve.on('chat:message', r));
  const notified = new Promise((r) => sEve.on('notification', r));
  const ack = await sDan.emitWithAck('chat:send', { to: eve.user.id, content: 'Salut Eve' });
  assert.equal(ack.ok, true);
  assert.equal((await received).content, 'Salut Eve');
  assert.equal((await notified).type, 'message');

  const convs = await request(app).get('/api/messages').set({ Authorization: `Bearer ${eve.token}` });
  assert.equal(convs.body.items[0].peer.username, 'dan');
  assert.equal(convs.body.items[0].unread, 1);

  const bad = ioClient(`http://localhost:${port}`, { auth: { token: 'nope' }, transports: ['websocket'] });
  await new Promise((r) => bad.on('connect_error', r));
  bad.close();
  sDan.close();
  sEve.close();
});

test('RGPD : export puis suppression du compte', async () => {
  const frank = await register('frank');
  const auth = { Authorization: `Bearer ${frank.token}` };
  await request(app).post('/api/posts').set(auth).send({ content: 'données perso' });
  const exp = await request(app).get('/api/me/export').set(auth);
  assert.equal(exp.status, 200);
  assert.equal(exp.body.posts.length, 1);
  assert.equal(exp.body.user.username, 'frank');

  assert.equal((await request(app).delete('/api/me').set(auth)).status, 204);
  assert.equal((await request(app).get('/api/auth/me').set(auth)).status, 404);
  assert.equal((await request(app).post('/api/auth/refresh').set('Cookie', frank.cookie)).status, 401);
});
