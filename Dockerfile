FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# schema precisa estar presente antes do install porque o postinstall roda
# `prisma generate`, que falha sem prisma/schema.prisma no diretório.
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* são inlined no bundle client-side no momento do build, não em
# runtime — precisam chegar como build args do Railway (Docker não propaga
# variáveis de serviço para dentro do `docker build` automaticamente).
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_R2_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_R2_PUBLIC_BASE_URL=$NEXT_PUBLIC_R2_PUBLIC_BASE_URL

RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["pnpm", "start"]
