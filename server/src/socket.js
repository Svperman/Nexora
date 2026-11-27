import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { z } from 'zod';
import { config } from './config.js';
import { verifyAccessToken } from './auth.js';
import { Message, User, conversationId } from './models.js';
import { notify, userRoom } from './notifications.js';
import { logger } from './logger.js';
import { socketConnections, chatMessages } from './metrics.js';

const messageInput = z.object({
  to: z.string().regex(/^[a-f0-9]{24}$/),
  content: z.string().trim().min(1).max(2000),
});

const userId = z.string().regex(/^[a-f0-9]{24}$/);
const callId = z.string().uuid();
const sdp = z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(20_000) });
const rtcSchemas = {
  'call:offer': z.object({ to: userId, callId, video: z.boolean(), description: sdp }),
  'call:answer': z.object({ to: userId, callId, description: sdp }),
  'call:ice': z.object({
    to: userId,
    callId,
    candidate: z.object({
      candidate: z.string().max(1000),
      sdpMid: z.string().max(64).nullable().optional(),
      sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
      usernameFragment: z.string().max(256).nullable().optional(),
    }),
  }),
  'call:reject': z.object({ to: userId, callId, reason: z.enum(['busy', 'declined']).default('declined') }),
  'call:end': z.object({ to: userId, callId }),
};
const RTC_EVENTS = Object.keys(rtcSchemas);

export function createSocketServer(httpServer, redis) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
  });

  if (redis) {
    // Adapter Redis : diffusion entre plusieurs réplicas API (HPA) et depuis le worker.
    io.adapter(createAdapter(redis.duplicate(), redis.duplicate()));
  }

  // Authentification du handshake par access token JWT.
  io.use((socket, next) => {
    try {
      const payload = verifyAccessToken(socket.handshake.auth?.token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const me = socket.data.userId;
    socket.join(userRoom(me));
    socketConnections.inc();
    socket.on('disconnect', () => socketConnections.dec());

    // Fil d'un post : rejoindre la room pour recevoir les nouveaux commentaires.
    socket.on('post:join', (postId) => typeof postId === 'string' && socket.join(`post:${postId}`));
    socket.on('post:leave', (postId) => typeof postId === 'string' && socket.leave(`post:${postId}`));

    socket.on('chat:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const { to, content } = messageInput.parse(payload);
        if (!(await User.exists({ _id: to }))) return reply({ error: 'Destinataire inconnu' });
        const msg = await Message.create({ from: me, to, conversation: conversationId(me, to), content });
        const json = msg.toJSON();
        chatMessages.inc();
        io.to(userRoom(to)).to(userRoom(me)).emit('chat:message', json);
        notify({ user: to, type: 'message', actor: me, ref: json.id });
        reply({ ok: true, message: json });
      } catch (err) {
        if (err instanceof z.ZodError) return reply({ error: 'Message invalide' });
        logger.error({ err }, 'chat:send');
        reply({ error: 'Erreur interne' });
      }
    });

    socket.on('chat:typing', (to) => {
      if (typeof to === 'string') io.to(userRoom(to)).emit('chat:typing', { from: me });
    });

    // --- Signalisation WebRTC (appels audio/vidéo 1-à-1) ---------------------
    // Le serveur ne fait que relayer : le média circule en pair-à-pair (ou via TURN), chiffré DTLS-SRTP.
    // L'expéditeur est toujours imposé par le serveur (`from: me`), jamais lu dans le message.
    for (const event of RTC_EVENTS) {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const parsed = rtcSchemas[event].safeParse(payload);
        if (!parsed.success || parsed.data.to === me) return reply({ error: 'Signal invalide' });
        const { to, ...data } = parsed.data;
        if (event === 'call:offer') {
          const peers = await io.in(userRoom(to)).fetchSockets();
          if (peers.length === 0) return reply({ error: 'Utilisateur hors ligne' });
          const caller = await User.findById(me).select('username');
          data.fromName = caller?.username;
        }
        io.to(userRoom(to)).emit(event, { ...data, from: me });
        reply({ ok: true });
      });
    }
  });

  return io;
}
