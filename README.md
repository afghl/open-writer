# OpenWrite

OpenWrite 是一个基于 Bun + Hono + Next.js 的多端 AI 写作/工作区助手（Web + TUI）。

项目仍处于 WIP 阶段，但核心链路已打通：项目创建、会话对话（含流式）、工作区文件浏览/读取、工具调用、基础 CI 门禁。

## 当前完成情况（截至当前仓库状态）

### 已完成

1. 后端核心能力（`packages/openwrite`）
- 项目与会话管理：创建项目、列出项目、会话消息存储。
- 对话能力：
  - 非流式：`POST /api/message`
  - 流式 SSE：`POST /api/message/stream`
  - 消息分页：`GET /api/messages`
- 文件系统能力：
  - 树：`GET /api/fs/tree`
  - 文件读取：`GET /api/fs/read`
  - 资料导入：`POST /api/library/import`（异步）
  - 导入状态：`GET /api/library/import/:id`
  - 资料列表：`GET /api/library/docs`
  - 文件系统 SSE 事件：`GET /event/fs`
- 内置工具：`read`、`edit`、`bash`（通过工具注册表接入模型调用）。
- 路径安全：工作区路径会做越界检查，防止逃逸到项目外。
- 流式稳定性修复：`done` 事件已做幂等去重（同一 assistant 只发一次）。

2. Web 客户端（`packages/web`）
- 项目列表加载与自动跳转到 `/projects/[project_slug]`。
- 空项目态下可一键创建项目。
- 三栏主界面：
  - 左侧文件树（从后端拉取）
  - 中间文件预览（带行号、截断提示）
  - 右侧流式聊天（增量渲染、乐观 UI、错误提示）
- 前端通过 Next API Route 代理后端，并自动注入 `x-ow-proxy-token`。
- 提供 `/events` 与 `/events/fs`（转发到后端 `/event/fs`）以支持前端 SSE 订阅。

3. TUI 客户端（`packages/tui`）
- 启动时自动创建项目，或使用已有项目 ID。
- 支持发送聊天消息。
- 内置 curl 面板，可直接调试后端接口并保存响应到临时文件。

4. 工程质量与门禁
- 根脚本已覆盖 monorepo 关键检查：
  - `test:openwrite`
  - `typecheck:openwrite`
  - `typecheck:web`
  - `lint:web`
  - `build:web:ci`
  - `ci:check`
- 已提供 GitHub Actions：`.github/workflows/ci.yml`。
- `packages/openwrite` typecheck 当前可通过。
- `packages/openwrite` 测试用例包含：
  - 项目创建/排序
  - 工作区树与读取
  - edit 工具事件
  - 消息模型转换
  - SSE done 去重回归

### 已知限制 / 尚未完成

1. 权限体系尚未落地
- `Permission.ask` 目前是 no-op，尚无真正的交互审批/策略引擎。

2. 鉴权模型仍偏 MVP
- 后端主要依赖 `x-ow-proxy-token` + `x-project-id`，尚无用户级认证与多租户隔离。

3. 前端部分区域仍是占位
- 左侧进度卡片使用 `MOCK_PROGRESS`。

4. TUI 与 SSE 端点存在对齐问题
- 当前 TUI 使用 `/event`，后端实际事件端点为 `/event/fs`。
- 不影响 TUI 的非流式聊天，但会影响其实时事件面板。

5. 写作流程硬闸门主要依赖 Prompt 约束
- Plan Agent 的规则很完整，但“系统级不可绕过约束”还未完全工程化到权限层。

---

## Monorepo 结构

```text
packages/
  openwrite/   # 后端服务（Bun + Hono + AI SDK）
  web/         # Web 前端（Next.js App Router）
  tui/         # 终端客户端（OpenTUI）
```

---

## API 概览（后端）

### 公共
- `GET /healthz`

### 项目
- `POST /api/project`
- `GET /api/projects`

### 会话消息
- `POST /api/message`
- `POST /api/message/stream` (SSE)
- `GET /api/messages`

### 工作区文件
- `GET /api/fs/tree`
- `GET /api/fs/read`
- `POST /api/library/import`
- `GET /api/library/import/:id`
- `GET /api/library/docs`
- `GET /event/fs` (SSE)

### 请求头约定
- 除 `GET /healthz` 外，请带 `x-ow-proxy-token`。
- 除创建/列项目接口外，请带 `x-project-id`。

---

## 快速开始（本地）

### 1) 安装依赖

```bash
bun install
```

### 2) 启动后端与前端

```bash
bun run dev:openwrite
bun run dev:web
```

默认开发配置（无需额外 env）：
- `OW_NAMESPACE` -> `<repo>/packages/openwrite/.openwrite/namespace`
- `OW_DATA_DIR` -> `<repo>/packages/openwrite/.openwrite`
- `OW_PROXY_TOKEN` -> `dev-openwrite-proxy-token`

---

## 环境变量

### 后端（`packages/openwrite`）

必需（生产）：
- `OW_PROXY_TOKEN`
- `OW_NAMESPACE`（绝对路径）

常用：
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `PINECONE_API_KEY`
- `OW_PINECONE_INDEX`
- `OW_EMBEDDING_MODEL`
- `OW_IMPORT_MAX_PDF_MB`
- `OW_IMPORT_MAX_TXT_MB`
- `OW_DATA_DIR`
- `OW_LOG_DIR`
- `OW_LOG_LEVEL`
- `OW_HOME`
- `PORT`

若 Web 部署在 Vercel 且文件上传走 `/api/openwrite/library/import` 代理链路，建议：
- `OW_IMPORT_MAX_PDF_MB=4`
- `OW_IMPORT_MAX_TXT_MB=4`

参考：`packages/openwrite/.env.example`

### Web（`packages/web`）

代理后端时使用：
- `OW_API_BASE`
- `OW_PROXY_TOKEN`
- `OW_PROXY_TIMEOUT_MS`（可选）

参考：`packages/web/.env.example`

---

## 质量检查与 CI

```bash
bun run test
bun run typecheck
bun run lint:web
bun run build:web:ci
bun run ci:check
```

CI 在 GitHub Actions 上执行 `bun run ci:check`。

---

## 部署说明（当前方案）

推荐拆分部署：
1. `packages/web` 部署到 Vercel（Next.js）。
2. `packages/openwrite` 部署到独立 Bun 服务。
3. Web 通过服务器端 API route 代理后端，并携带共享 token。
4. 若保留当前上传代理链路，请将单文件大小控制在 4MB 以内（Vercel 友好范围）。

生产环境下若 `OW_API_BASE` 或 `OW_PROXY_TOKEN` 缺失，Web 代理请求会失败（不会回退到 localhost）。
