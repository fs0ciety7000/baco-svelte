# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# CSM — Client Solutions Management Tool
# Image Node autonome (SvelteKit adapter-node). Configuration 100 % runtime :
# aucune variable n'est figée au build, la même image sert en recette et en prod.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    BODY_SIZE_LIMIT=25M
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# adapter-node gère SIGTERM (arrêt propre) : pas besoin d'init supplémentaire.
CMD ["node", "build"]
