# ---- Stage 1: Base ----
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Stage 2: Install dependencies ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile --registry https://registry.npmmirror.com

# ---- Stage 3: Build client ----
FROM deps AS build-client
COPY packages/shared/ packages/shared/
COPY packages/client/ packages/client/
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @uno-online/shared build && pnpm --filter @uno-online/client build

# ---- Stage 4: Build server ----
FROM deps AS build-server
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
RUN pnpm --filter @uno-online/shared build \
  && pnpm --filter @uno-online/server build \
  && node -e "const fs = require('fs'); const p = 'packages/shared/package.json'; const pkg = JSON.parse(fs.readFileSync(p, 'utf8')); pkg.main = './dist/index.js'; pkg.types = './dist/index.d.ts'; fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');"

# ---- Stage 5: Server runtime ----
FROM base AS server

COPY --from=build-server /app/ /app/
# Remove client source (not needed at runtime)
RUN rm -rf packages/client/src

EXPOSE 3001

CMD ["pnpm", "--filter", "@uno-online/server", "start"]

# ---- Stage 6: Caddy (client) ----
FROM caddy:2-alpine AS caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build-client /app/packages/client/dist/ /srv/
EXPOSE 80 443
