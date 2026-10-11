# RollBiz game server (Colyseus on Node 22).
#
# Build context is the MONOREPO ROOT (needs bun.lock, packages/shared and every
# workspace package.json). Deploy from the repo root with:
#
#   fly deploy . --config apps/server/fly.toml --dockerfile apps/server/Dockerfile \
#     --ignorefile apps/server/.dockerignore
#
# Local build:
#   docker build -f apps/server/Dockerfile -t rollbiz-server .
#   (BuildKit also picks up apps/server/Dockerfile.dockerignore automatically.)

ARG NODE_VERSION=22
ARG BUN_VERSION=1.3.14

FROM oven/bun:${BUN_VERSION} AS bun

# ---- build: install workspace deps and bundle the server --------------------
FROM node:${NODE_VERSION}-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile --filter @rollbiz/server
RUN cd apps/server && bun run build

# ---- prod-deps: runtime dependencies only -----------------------------------
FROM node:${NODE_VERSION}-slim AS prod-deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile --production --filter @rollbiz/server

# ---- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=2567
WORKDIR /repo
# bun's isolated linker uses relative symlinks into /repo/node_modules/.bun,
# so both directories are copied with the same layout.
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /repo/apps/server/package.json ./apps/server/package.json
COPY --from=build /repo/apps/server/dist ./apps/server/dist

WORKDIR /repo/apps/server
USER node
EXPOSE 2567
CMD ["node", "--enable-source-maps", "dist/index.js"]
