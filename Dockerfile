# ---- Stage 1: Base ----
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
RUN apk add --no-cache python3 make g++ linux-headers
WORKDIR /app

# ---- Stage 2: Install dependencies ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# ---- Stage 3: Build client ----
FROM deps AS build-client
COPY packages/shared/ packages/shared/
COPY packages/client/ packages/client/
ARG VITE_API_URL=""
ARG VITE_GITHUB_CLIENT_ID=""
ARG VITE_DEV_MODE=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GITHUB_CLIENT_ID=$VITE_GITHUB_CLIENT_ID
ENV VITE_DEV_MODE=$VITE_DEV_MODE
RUN cd packages/client && npx vite build

# ---- Stage 4: Build server ----
FROM deps AS build-server
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
RUN cd packages/server && npx prisma generate && npx tsc

# ---- Stage 5: Server runtime ----
FROM base AS server

COPY --from=build-server /app/ /app/
# Remove client source (not needed at runtime)
RUN rm -rf packages/client/src

EXPOSE 3001

CMD ["sh", "-c", "cd packages/server && npx prisma db push --skip-generate && cd /app && npx tsx packages/server/src/index.ts"]

# ---- Stage 6: Caddy (client) ----
FROM caddy:2-alpine AS caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build-client /app/packages/client/dist/ /srv/
EXPOSE 80 443
