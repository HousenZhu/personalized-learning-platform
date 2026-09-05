FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
ENV DATABASE_URL=postgresql://coursepilot:coursepilot@postgres:5432/learning_platform?schema=public \
    BETTER_AUTH_SECRET=build-only-better-auth-secret-not-used-at-runtime \
    BETTER_AUTH_URL=http://localhost:3000 \
    NEXT_PUBLIC_APP_URL=http://localhost:3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    AGENT_INTERNAL_SECRET=build-only-agent-secret-not-used-at-runtime
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate && npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["npm", "start"]
