import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { z } from 'zod';
import { config } from './config.js';
import { verifyAccessToken } from './auth.js';
import { Message, User, conversationId } from './models.js';
import { notify, userRoom } from './notifications.js';
import { logger } from './logger.js';

const messageInput = z.object({
  to: z.string().regex(/^[a-f0-9]{24}$/),
  content: z.string().trim().min(1).max(2000),
});

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
  });

  return io;
}
