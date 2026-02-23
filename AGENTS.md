# AGENTS.md

## Project

`open-write` 是一个 Bun monorepo 的 AI 写作/工作区助手。
核心栈：
- backend: Bun + Hono
- web: Next.js (App Router)
- tui: OpenTUI

## Instruction Priority

冲突时按优先级执行：

1. 当前任务中的用户直接要求
2. 本文件 `AGENTS.md`
3. 可执行配置（`package.json` scripts、ESLint config、TSConfig）

说明：
- 文档与脚本不一致时，以可执行配置为准。

## Commands

这里仅列出入口命令；其余命令一律以 `package.json` scripts 为准。

常用：

```bash
bun install
bun run dev:openwrite
bun run dev:web
bun run --cwd packages/tui dev
bun run ci:check
```

执行前先看 scripts：

- 根目录：`package.json`
- backend：`packages/openwrite/package.json`
- web：`packages/web/package.json`
- tui：`packages/tui/package.json`

## Repo Map (key paths)

- backend 根目录: `packages/openwrite`
- backend 主要代码: `packages/openwrite/src`
- backend server 相关: `packages/openwrite/src/server`
- backend 测试: `packages/openwrite/test`
- web 根目录: `packages/web`
- web 页面与路由: `packages/web/app`
- web 后端代理相关: `packages/web/app/api/openwrite`, `packages/web/app/events`, `packages/web/lib`
- tui 根目录: `packages/tui`
- tui 代码: `packages/tui/src`
- 脚本: `scripts`
- CI: `.github/workflows`
- env 模板: `packages/openwrite/.env.example`, `packages/web/.env.example`

## Code Style (only non-default rules)

- 使用 ES modules（`import` / `export`），不要用 `require`
- 优先命名导出（named exports）
- 对于各个包的Code style规则，可以看包内部的 `eslint.config.mjs`
- 优先最小改动（small diff），避免无关重构
- 非任务明确要求下，不破坏公共 API 向后兼容
- 无充分理由时，不新增依赖

## Workflow

- 推荐节奏：先跑聚焦检查，再跑全量门禁
- 触达 `packages/openwrite`：至少运行 `bun run typecheck:openwrite`
- 触达 `packages/web`：至少运行 `bun run typecheck:web`
- 触达 `packages/tui`：至少运行 `bun run --cwd packages/tui typecheck`
- 高风险或跨包改动：运行 `bun run ci:check`

## Repo Etiquette

- 分支命名建议：`feat/*`、`fix/*`、`chore/*`
- PR 建议包含：相关检查通过 + 简短变更说明（changelog 摘要）
- 未被任务要求时，不做“纯格式化”提交

## Gotchas / Do Not Touch

- 不要手动编辑生成/运行时目录：
  - `node_modules`
  - `packages/web/.next`
  - `packages/openwrite/.openwrite`
  - `logs`
  - `output`
  - `tmp`
- 不绕过工作区路径安全校验（workspace escape check）
- 后端受保护接口依赖 `x-ow-proxy-token`
- 大多数非项目创建接口还依赖 `x-project-id`
- `Permission.ask` 当前是 no-op；不要假设已存在真实审批流
- 不提交任何 `.env` 密钥，不把 secret 写入日志
