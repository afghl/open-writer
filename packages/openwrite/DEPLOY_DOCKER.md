# OpenWrite Backend Docker Deployment

This guide deploys only `packages/openwrite` with persistent data volumes.

## 1) Prepare environment file

```bash
cd packages/openwrite
cp .env.docker.example .env.docker
```

Edit `.env.docker` and set:

- `OW_PROXY_TOKEN` (required in production)
- `OPENAI_API_KEY` (required for LLM features)
- Optional Pinecone values if you use vector search

## 2) Start with Docker Compose

```bash
cd packages/openwrite
docker compose up -d --build
```

Service details:

- Container port: `3000`
- Host bind: `127.0.0.1:${OW_PORT}` (default `127.0.0.1:3000`)
- Health check: `GET /healthz`

## 3) Verify service

```bash
docker compose ps
curl http://127.0.0.1:${OW_PORT:-3000}/healthz
```

Expected response:

```json
{"status":"ok"}
```

## 4) Persistent storage

Compose maps these host directories:

- `packages/openwrite/docker-data/namespace` -> `/var/lib/openwrite/namespace` (`OW_NAMESPACE`)
- `packages/openwrite/docker-data/data` -> `/var/lib/openwrite/data` (`OW_DATA_DIR`)
- `packages/openwrite/docker-data/log` -> `/var/log/openwrite` (`OW_LOG_DIR`)

Back up `docker-data` regularly.

## 5) Reverse proxy / web integration

If you deploy `packages/web` separately, set:

- `OW_API_BASE=https://your-backend-domain`
- `OW_PROXY_TOKEN=<same token as backend>`

The web server forwards requests and injects `x-ow-proxy-token`.

## 6) Common operations

```bash
# Tail logs
docker compose logs -f openwrite

# Restart
docker compose restart openwrite

# Stop
docker compose down

# Update after pull
docker compose up -d --build
```
