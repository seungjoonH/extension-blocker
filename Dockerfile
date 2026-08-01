# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS clamav-base
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    clamav \
    clamav-daemon \
    clamav-freshclam \
    gosu \
  && rm -rf /var/lib/apt/lists/*
COPY deploy/docker/clamd.conf /etc/clamav/clamd.conf
RUN freshclam

FROM clamav-base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nodejs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY deploy/docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
  && chown -R nodejs:nodejs /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=15s --start-period=180s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>{if(!r.ok)process.exit(1);return r.json()}).then((b)=>process.exit(b.ready?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
