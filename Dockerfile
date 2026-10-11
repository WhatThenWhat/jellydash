# Jellydash multi-server image. No environment-specific values are baked in at build time:
# everything (URLs, secrets) is read when the container starts.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    NODE_OPTIONS=--no-warnings
COPY --from=build /app ./
RUN mkdir -p /data && chown -R node:node /data /app/.next \
 && chmod +x /app/docker-entrypoint.sh
USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q -O /dev/null http://127.0.0.1:4000/api/health || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
