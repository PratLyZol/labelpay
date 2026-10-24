# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# full node_modules + scripts so `pnpm db:migrate` / `pnpm db:seed` work inside the container
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/seed ./seed
COPY --from=build /app/lib ./lib
COPY --from=build /app/tsconfig.json ./tsconfig.json
USER app
EXPOSE 3000
CMD ["node", "server.js"]
