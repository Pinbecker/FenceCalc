FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

ARG VITE_API_BASE_URL=https://localhost:8443
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_SENTRY_RELEASE=
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=0
ARG SENTRY_AUTH_TOKEN=
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}
ENV VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE}
ENV VITE_SENTRY_TRACES_SAMPLE_RATE=${VITE_SENTRY_TRACES_SAMPLE_RATE}
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT=${SENTRY_PROJECT}

COPY package.json package-lock.json turbo.json tsconfig.base.json tsconfig.eslint.json tsconfig.json workspaceAliases.ts ./
COPY eslint.config.mjs prettier.config.mjs vitest.config.ts playwright.config.ts README.md CONTRIBUTING.md .env.example ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/geometry/package.json packages/geometry/package.json
COPY packages/rules-engine/package.json packages/rules-engine/package.json

RUN npm ci

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS api-runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/geometry/package.json ./packages/geometry/package.json
COPY --from=build /app/packages/geometry/dist ./packages/geometry/dist
COPY --from=build /app/packages/rules-engine/package.json ./packages/rules-engine/package.json
COPY --from=build /app/packages/rules-engine/dist ./packages/rules-engine/dist

RUN addgroup --system app && adduser --system --ingroup app app
RUN mkdir -p /var/lib/fence-estimator && chown app:app /var/lib/fence-estimator

VOLUME ["/var/lib/fence-estimator"]
EXPOSE 3001

USER app
CMD ["node", "apps/api/dist/server.js"]

FROM node:20-bookworm-slim AS web-runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/scripts/serve-dist.mjs ./apps/web/scripts/serve-dist.mjs

EXPOSE 4173

USER app
CMD ["node", "apps/web/scripts/serve-dist.mjs"]

FROM node:20-bookworm-slim AS proxy-runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PROXY_HOSTNAME=localhost
ENV PROXY_HTTPS_PORT=8443
ENV PROXY_HTTP_PORT=8080

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=build /app/scripts/https-reverse-proxy.mjs ./scripts/https-reverse-proxy.mjs

EXPOSE 8080
EXPOSE 8443

USER app
CMD ["node", "scripts/https-reverse-proxy.mjs"]
