process.env.NODE_ENV = 'test';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.CLOUDINARY_URL = '';
process.env.MODERATION_ENABLED = 'false';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';

const { connectDb, disconnectDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createSocketServer } = await import('../src/socket.js');
const { initNotifications, closeNotifications } = await import('../src/notifications.js');
const { User, Post, Comment } = await import('../src/models.js');
const { signAccessToken } = await import('../src/auth.js');
const { sniffImage, LOCAL_UPLOAD_DIR } = await import('../src/routes/uploads.js');
const { routeLabel } = await import('../src/metrics.js');
const { moderationStatus } = await import('../src/moderation.js');

let app, server, io, port;
const created = [];

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
  await Promise.all(created.map((f) => fs.unlink(path.join(LOCAL_UPLOAD_DIR, path.basename(f))).catch(() => {})));
});

async function register(username) {
  const res = await request(app).post('/api/auth/register').send({
    email: `${username}@example.test`, username, password: 'motdepasse-solide', acceptTerms: true,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.accessToken, user: res.body.user };
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
// PNG 1x1 valide
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('détection du type réel des images', () => {
  assert.equal(sniffImage(PNG), 'png');
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpg');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
});

test('upload local, post avec image, refus des images externes', async () => {
  const { token } = await register('uploader');
  const fake = await request(app).post('/api/uploads').set(bearer(token))
    .attach('image', Buffer.from('<script>alert(1)</script> padding'), { filename: 'x.png', contentType: 'image/png' });
  assert.equal(fake.status, 415);

  const up = await request(app).post('/api/uploads').set(bearer(token)).attach('image', PNG, 'pixel.png');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.match(up.body.url, /^\/uploads\/[a-f0-9-]+\.png$/);
  created.push(up.body.url);
  const served = await request(app).get(up.body.url);
  assert.equal(served.status, 200);

  const post = await request(app).post('/api/posts').set(bearer(token)).send({ images: [up.body] });
  assert.equal(post.status, 201, JSON.stringify(post.body));
  assert.equal(post.body.images.length, 1);
  assert.equal(post.body.content, '');

  const foreign = await request(app).post('/api/posts').set(bearer(token))
    .send({ content: 'x', images: [{ url: 'https://evil.example/tracker.png' }] });
  assert.equal(foreign.status, 400);
  const empty = await request(app).post('/api/posts').set(bearer(token)).send({ content: '   ' });
  assert.equal(empty.status, 400);

  // Suppression du post => suppression du fichier
  await request(app).delete(`/api/posts/${post.body.id}`).set(bearer(token)).expect(204);
  assert.equal((await request(app).get(up.body.url)).status, 404);
});

test('modération : statuts et file de revue humaine', async () => {
  assert.equal(moderationStatus('allow'), 'approved');
  assert.equal(moderationStatus('skipped'), 'approved');
  assert.equal(moderationStatus('flag'), 'pending_review');
  assert.equal(moderationStatus('error'), 'pending_review');

  const author = await register('auteur');
  const reader = await register('lecteur');
  const modUser = await register('modo');
  await User.updateOne({ _id: modUser.user.id }, { role: 'moderator' });
  const modToken = signAccessToken({ _id: modUser.user.id, role: 'moderator' });

  const pending = await Post.create({
    author: author.user.id, content: 'contenu signalé', moderation: { status: 'pending_review', decision: 'flag', categories: ['spam'] },
  });
  const ids = async (t) => (await request(app).get('/api/posts?limit=50').set(bearer(t))).body.items.map((p) => p.id);
  assert.ok(!(await ids(reader.token)).includes(String(pending._id)), 'caché aux autres');
  assert.ok((await ids(author.token)).includes(String(pending._id)), "visible par l'auteur");
  assert.equal((await request(app).post(`/api/posts/${pending._id}/like`).set(bearer(reader.token))).status, 404);

  assert.equal((await request(app).get('/api/moderation/queue').set(bearer(reader.token))).status, 403);
  const queue = await request(app).get('/api/moderation/queue').set(bearer(modToken));
  assert.equal(queue.status, 200);
  assert.ok(queue.body.items.some((i) => i.id === String(pending._id) && i.kind === 'post'));

  await request(app).post(`/api/moderation/post/${pending._id}`).set(bearer(modToken)).send({ action: 'approve' }).expect(200);
  assert.ok((await ids(reader.token)).includes(String(pending._id)), 'visible après approbation');

  const c = await Comment.create({ post: pending._id, author: reader.user.id, content: 'limite', moderation: { status: 'pending_review' } });
  await request(app).post(`/api/moderation/comment/${c._id}`).set(bearer(modToken)).send({ action: 'remove' }).expect(200);
  assert.equal(await Comment.countDocuments({ _id: c._id }), 0);
});

test('métriques Prometheus', async () => {
  assert.equal(routeLabel('/api/posts/65a1b2c3d4e5f6a7b8c9d0e1/like?x=1'), '/api/posts/:id/like');
  await request(app).get('/healthz');
  const res = await request(app).get('/metrics');
  assert.equal(res.status, 200);
  assert.match(res.text, /nexora_http_request_duration_seconds_count\{method="GET",route="\/healthz",status="200"\}/);
  assert.match(res.text, /nexora_process_resident_memory_bytes/);
});

test('signalisation WebRTC relayée et validée', async () => {
  const a = await register('appelant');
  const b = await register('appele');
  const config = await request(app).get('/api/rtc/config').set(bearer(a.token));
  assert.ok(config.body.iceServers[0].urls.length > 0);

  const connect = (token) => new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
  const sa = await connect(a.token);
  const callId = crypto.randomUUID();

  // Destinataire hors ligne
  const offline = await sa.emitWithAck('call:offer', { to: b.user.id, callId, video: true, description: { type: 'offer', sdp: 'v=0' } });
  assert.equal(offline.error, 'Utilisateur hors ligne');

  const sb = await connect(b.token);
  const gotOffer = new Promise((r) => sb.on('call:offer', r));
  const ok = await sa.emitWithAck('call:offer', { to: b.user.id, callId, video: true, description: { type: 'offer', sdp: 'v=0' } });
  assert.equal(ok.ok, true);
  const offer = await gotOffer;
  assert.equal(offer.from, a.user.id);
  assert.equal(offer.fromName, 'appelant');

  const gotAnswer = new Promise((r) => sa.on('call:answer', r));
  await sb.emitWithAck('call:answer', { to: a.user.id, callId, description: { type: 'answer', sdp: 'v=0' } });
  assert.equal((await gotAnswer).from, b.user.id);

  const bad = await sa.emitWithAck('call:ice', { to: b.user.id, callId: 'pas-un-uuid', candidate: { candidate: 'x' } });
  assert.equal(bad.error, 'Signal invalide');
  const self = await sa.emitWithAck('call:end', { to: a.user.id, callId });
  assert.equal(self.error, 'Signal invalide');

  sa.close();
  sb.close();
});
