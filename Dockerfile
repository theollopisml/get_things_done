# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
# These placeholders only allow SvelteKit to evaluate server modules during build.
# Runtime credentials are injected by Compose; no production secret enters the build.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1/build pnpm build
RUN pnpm prune --prod --ignore-scripts

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/drizzle/migrations ./drizzle/migrations
COPY --from=build --chown=node:node /app/scripts/doctor.mjs /app/scripts/migrate.mjs ./scripts/
COPY --from=build --chown=node:node /app/src/lib/server/operations/doctor.ts ./src/lib/server/operations/doctor.ts
COPY --from=build --chown=node:node /app/src/lib/domain/recurrence.ts ./src/lib/domain/recurrence.ts
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 CMD ["node", "--input-type=module", "-e", "const r = await fetch('http://127.0.0.1:3000/ready', {signal: AbortSignal.timeout(4000)}); process.exit(r.ok ? 0 : 1)"]
CMD ["node", "build/index.js"]
