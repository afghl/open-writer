# @open-write/tui

Minimal OpenTUI client for `open-write`.

## What It Does

- Creates a project on startup with `POST /api/project`
- Or uses an existing project via `OPENWRITE_PROJECT_ID`
- Sends text messages with `POST /api/message`
- Renders user and assistant lines in terminal
- Subscribes to `GET /event` and prints SSE payloads in the right column

## Run

From repository root:

```bash
# terminal 1
bun run dev

# terminal 2
bun run --cwd packages/tui dev
```

Or production-like:

```bash
# terminal 1
bun run --cwd packages/openwrite start

# terminal 2
bun run --cwd packages/tui start
```

## Environment Variables

- `OPENWRITE_API_BASE` (optional): backend base URL, default `http://127.0.0.1:3000`
- `OPENWRITE_PROJECT_ID` (optional): existing project ID; when provided, startup skips `POST /api/project`

Example:

```bash
OPENWRITE_API_BASE=http://127.0.0.1:3000 bun run --cwd packages/tui start
```

Use an existing project:

```bash
OPENWRITE_PROJECT_ID=project_xxx bun run --cwd packages/tui start
```

## Controls

- `Enter`: send message
- `Esc`: quit
