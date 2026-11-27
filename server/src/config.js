import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT || 4000),
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  mongoUri: process.env.MONGO_URI || '',
  redisUrl: process.env.REDIS_URL || '',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30),
  // Nombre de proxys devant l'API : 1 (Ingress k8s, Render seul), 2 (Vercel rewrite -> Render).
  // Sert à retrouver la vraie IP client (rate limiting, journal d'audit).
  trustProxy: Number(process.env.TRUST_PROXY || 1),
};

if (config.isProd) {
  if (!config.mongoUri) throw new Error('MONGO_URI est obligatoire en production');
  if (!config.jwtAccessSecret || config.jwtAccessSecret.length < 32 || config.jwtAccessSecret.startsWith('change-me')) {
    throw new Error('JWT_ACCESS_SECRET doit faire au moins 32 caractères en production');
  }
}
if (!config.jwtAccessSecret) config.jwtAccessSecret = 'dev-only-insecure-secret';
