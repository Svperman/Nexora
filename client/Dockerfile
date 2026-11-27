FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Image nginx non-root (port 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security.inc /etc/nginx/snippets/security.inc
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
