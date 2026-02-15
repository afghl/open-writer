FROM oven/bun:1.3.5

WORKDIR /app

# Install workspace dependencies with lockfile for reproducible builds.
COPY package.json bun.lock ./
COPY packages/openwrite/package.json ./packages/openwrite/package.json
COPY packages/web/package.json ./packages/web/package.json
COPY packages/tui/package.json ./packages/tui/package.json
RUN bun install --frozen-lockfile

# Copy backend source only.
COPY packages/openwrite ./packages/openwrite

WORKDIR /app/packages/openwrite

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "start"]
