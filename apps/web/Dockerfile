# syntax = docker/dockerfile:1

# Alternate Sure frontend (TanStack Start). Builds the pnpm workspace and
# serves the production build with `vite preview`. The Rails API origin is
# provided at runtime via SURE_API_ORIGIN (e.g. http://web:3000).
ARG NODE_VERSION=24
FROM registry.docker.com/library/node:${NODE_VERSION}-slim AS build

WORKDIR /repo

# Enable pnpm via corepack (version pinned by the root packageManager field)
RUN corepack enable

# Copy workspace manifests first for layer-cached dependency installs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# Copy the rest of the frontend source and build client + SSR bundles
COPY apps/web apps/web
RUN pnpm --filter @sure/web build

# Final stage: minimal runtime serving the built frontend. vite preview
# loads vite.config.ts (which imports from src/), so the full app dir ships.
FROM registry.docker.com/library/node:${NODE_VERSION}-slim

WORKDIR /repo

RUN corepack enable \
    && groupadd --system --gid 1001 web \
    && useradd web --uid 1001 --gid 1001 --create-home --shell /bin/bash

COPY --chown=web:web --from=build /repo/node_modules ./node_modules
COPY --chown=web:web --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml ./
COPY --chown=web:web --from=build /repo/apps/web ./apps/web

USER 1001:1001

ENV SURE_API_ORIGIN=http://web:3000 \
    HOST=0.0.0.0 \
    PORT=5173

EXPOSE 5173
CMD ["pnpm", "--filter", "@sure/web", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]