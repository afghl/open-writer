import { expect, test } from "bun:test"
import { PlanAgent } from "../../src/agent/plan"
import { SearchAgent } from "../../src/agent/search"
import { WriterAgent } from "../../src/agent/writer"

const WORKSPACE_ROOT = "/current_workspace/workspace"

function promptOf(agent: { Info(): { prompt?: string } }) {
  return agent.Info().prompt ?? ""
}

test("plan/search/writer prompts share workspace contract and resolve placeholders", () => {
  const planPrompt = promptOf(new PlanAgent())
  const searchPrompt = promptOf(new SearchAgent())
  const writerPrompt = promptOf(new WriterAgent())

  for (const prompt of [planPrompt, searchPrompt, writerPrompt]) {
    expect(prompt).toContain("工作区目录（共享基线）如下")
    expect(prompt).toContain(WORKSPACE_ROOT)
    expect(prompt).not.toContain("{{WORKSPACE_CONTRACT_COMMON}}")
    expect(prompt).not.toContain("{{WORKSPACE_ROOT}}")
  }

  expect(planPrompt).toContain("你可以写入：`spec/**`、`inputs/insights/**`。")
  expect(planPrompt).toContain("你禁止写入：`article/**`。")

  expect(searchPrompt).toContain("你只能写入：`spec/research/search-reports/**`。")
  expect(searchPrompt).toContain("你禁止写入：`inputs/library/**` 与 `article/**`。")

  expect(writerPrompt).toContain("你只能写入：`article/**`（含 `article/chapters/**` 等正文产物）。")
  expect(writerPrompt).toContain("`spec/**`、`inputs/**` 默认只读；除非系统明确授权，不得修改。")
})
