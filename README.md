# open-write
An AI agent that helps you learn, gather information, understands your thoughts, and ultimately assists you in writing.

WIP: This is a work in progress.

## Local Development Defaults

You can run:
- `bun run dev:openwrite`
- `bun run dev:web`

without extra env setup.

Default behavior in development:
- `OW_NAMESPACE` defaults to `<repo>/packages/openwrite/.openwrite/namespace`
- `OW_DATA_DIR` defaults to `<repo>/packages/openwrite/.openwrite`
- `OW_PROXY_TOKEN` defaults to `dev-openwrite-proxy-token`

## Production Deployment Notes

Frontend (`packages/web`) is designed to run on Vercel and proxy API calls through its serverless routes to a separate backend node.

Backend required environment variables:
- `OW_PROXY_TOKEN`: shared secret with Vercel proxy
- `OW_NAMESPACE`: absolute path for project workspace namespace
- `OW_DATA_DIR`: JSON storage directory
- `OW_LOG_DIR`: log directory
- `OW_HOME`: optional home override
- `OW_LOG_LEVEL`: optional log level
- `PORT`: backend listening port

Backend health endpoint:
- `GET /healthz`
