# Filesystem Sync Strategy

This project uses a lightweight sync model for frontend file views.

- Use `GET /api/fs/tree` and `GET /api/fs/read` as the source of truth.
- Frontend should poll these endpoints periodically to reconcile state.
- SSE `/event` delivers best-effort `fs.*` notifications for responsive UI updates.

Current `fs.*` event source values:

- `agent_tool`: emitted when agent tools modify files (currently from `edit` tool).
- `api`: reserved for future frontend write APIs.
- `external_upload`: reserved for non-agent ingestion/upload pipelines.

This design intentionally accepts temporary frontend/backend divergence and resolves it through periodic reads.
