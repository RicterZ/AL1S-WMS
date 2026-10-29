# syntax=docker/dockerfile:1
FROM node:24-alpine AS build

ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm config set registry "$NPM_REGISTRY" \
  && npm install --global pnpm@10.32.1

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages
RUN pnpm build \
  && pnpm --filter @al1s-wms/api deploy --prod --legacy /app/runtime

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV BIND_ADDRESS=0.0.0.0
ENV DATABASE_URL=/data/al1s-wms.db
ENV UPLOADS_DIR=/data/uploads

WORKDIR /app
COPY --from=build /app/runtime ./
COPY --from=build /app/apps/web/dist ./public

RUN mkdir -p /data/uploads

EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["./node_modules/.bin/tsx", "dist/server.js"]
