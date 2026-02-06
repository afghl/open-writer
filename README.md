# open-write
An AI agent that helps you learn, gather information, understands your thoughts, and ultimately assists you in writing.

## Packages
- `packages/openwrite`: Backend API using Hono + ai SDK
- `packages/web`: Frontend placeholder

## Setup
```sh
bun install
```

## Run backend
```sh
OPENAI_API_KEY=your_key_here bun run --cwd packages/openwrite dev
```

## API
`POST /api/generate`

Body:
```json
{ "prompt": "Write a short outline about AI-assisted writing." }
```

Response:
```json
{ "text": "..." }
```
