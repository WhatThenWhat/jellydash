# Jellydash container image.
# Build-time values: NEXT_PUBLIC_* variables are inlined by Next.js during `next build`, so they are
# passed as build args (docker-compose.yml wires them from your .env file).
# Runtime values (server URL, secrets, API key) are read from the environment when the container starts.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_IMAGE_PROTOCOL
ARG NEXT_PUBLIC_IMAGE_HOSTNAME
ARG NEXT_PUBLIC_ALLOWED_DEV_ORIGIN
ENV NEXT_PUBLIC_IMAGE_PROTOCOL=$NEXT_PUBLIC_IMAGE_PROTOCOL \
    NEXT_PUBLIC_IMAGE_HOSTNAME=$NEXT_PUBLIC_IMAGE_HOSTNAME \
    NEXT_PUBLIC_ALLOWED_DEV_ORIGIN=$NEXT_PUBLIC_ALLOWED_DEV_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app ./

# All persistent data (roles, ratings, watchlist settings, webhook secret, ...) lives in app/db.
# Mount a volume there so it survives container rebuilds.
RUN mkdir -p /app/app/db && chown -R node:node /app/app/db /app/public /app/.next
USER node

EXPOSE 4000
CMD ["npm", "start"]
