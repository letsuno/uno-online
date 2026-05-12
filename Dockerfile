# ---- Stage 1: Build base ----
FROM node:22-slim AS build-base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Stage 2: Install dependencies ----
FROM build-base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY packages/admin/package.json packages/admin/
RUN pnpm install --frozen-lockfile --registry https://registry.npmmirror.com

# ---- Stage 3: Build client ----
FROM deps AS build-client
COPY packages/shared/ packages/shared/
COPY packages/client/ packages/client/
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @uno-online/shared build && pnpm --filter @uno-online/client build

# ---- Stage 4: Build admin ----
FROM deps AS build-admin
COPY packages/shared/ packages/shared/
COPY packages/admin/ packages/admin/
RUN pnpm --filter @uno-online/shared build && pnpm --filter @uno-online/admin build

# ---- Stage 5: Build server + prune to prod deps ----
FROM deps AS build-server
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
RUN pnpm --filter @uno-online/shared build \
  && pnpm --filter @uno-online/server build \
  && pnpm deploy --filter @uno-online/server --prod --legacy /app/deploy

# ---- Stage 6: Server runtime ----
FROM node:22-slim AS server
WORKDIR /app
COPY --from=build-server /app/deploy/ /app/
COPY --from=build-server /app/packages/server/dist/ /app/dist/

EXPOSE 3001

CMD ["node", "dist/index.js"]

# ---- Stage 7: Caddy (client + admin) ----
FROM caddy:2-alpine AS caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build-client /app/packages/client/dist/ /srv/
COPY --from=build-admin /app/packages/admin/dist/ /srv/admin/
EXPOSE 80 443
