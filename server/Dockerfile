FROM node:26-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
EXPOSE 4000 9464
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:4000/healthz || exit 1
# Même image pour l'API (défaut) et le worker : `node --import ./src/tracing.js src/worker.js`
CMD ["node", "--import", "./src/tracing.js", "src/index.js"]
