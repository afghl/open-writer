import { expect, test } from "bun:test"
import SEARCH_SYSTEM_PROMPT from "../../src/agent/search.txt"

const REQUIRED_HEADINGS = [
  "## 问题回顾和思考",
  "## 完整回答",
  "## 证据原文",
]

test("search prompt defines three report headings in fixed order", () => {
  let lastIndex = -1
  for (const heading of REQUIRED_HEADINGS) {
    const current = SEARCH_SYSTEM_PROMPT.indexOf(`\`${heading}\``)
    expect(current).toBeGreaterThan(lastIndex)
    lastIndex = current
  }
})

test("search prompt defines strict REPORT_PATH/REPORT_ERROR output contract", () => {
  expect(SEARCH_SYSTEM_PROMPT).toContain("report_path")
  expect(SEARCH_SYSTEM_PROMPT).toContain("REPORT_PATH: <report_path>")
  expect(SEARCH_SYSTEM_PROMPT).toContain("REPORT_ERROR: <code>: <brief_reason>")

  for (const code of [
    "NO_CANDIDATE",
    "NO_EVIDENCE",
    "WRITE_FAILED",
    "READBACK_FAILED",
    "TOOL_FAILED",
  ]) {
    expect(SEARCH_SYSTEM_PROMPT).toContain(code)
  }
})

test("search prompt requires reasoning-driven query iteration", () => {
  expect(SEARCH_SYSTEM_PROMPT).toContain("query rewrite 采用原则性迭代")
  expect(SEARCH_SYSTEM_PROMPT).toContain("每轮 query 都要解释“为什么这样写”")
  expect(SEARCH_SYSTEM_PROMPT).toContain("若上一轮覆盖不足/证据薄弱/有冲突，下一轮必须针对缺口改写")
  expect(SEARCH_SYSTEM_PROMPT).toContain("若首轮证据已足够回答，可停止，不强制多轮")
  expect(SEARCH_SYSTEM_PROMPT).not.toContain("单次 query，不做 query rewrite")
})

test("search prompt allows evidence text output and removes pointer-only constraints", () => {
  expect(SEARCH_SYSTEM_PROMPT).toContain("`完整回答`")
  expect(SEARCH_SYSTEM_PROMPT).toContain("`text`")
  expect(SEARCH_SYSTEM_PROMPT).not.toContain("pointer-only")
  expect(SEARCH_SYSTEM_PROMPT).not.toContain("禁止填写原文摘录")
})

test("search prompt requires evidence materialization tool before final output", () => {
  expect(SEARCH_SYSTEM_PROMPT).toContain("- `materialize_search_evidence`")
  expect(SEARCH_SYSTEM_PROMPT).toContain("证据原文章节先只写 `chunk_id` 占位")
  expect(SEARCH_SYSTEM_PROMPT).toContain("调用 `materialize_search_evidence`")
  expect(SEARCH_SYSTEM_PROMPT).toContain("禁止手工编写“证据原文”里的 `text` 正文")
})

test("search prompt requires a full-answer section with markdown chunk citations", () => {
  expect(SEARCH_SYSTEM_PROMPT).toContain("`完整回答`")
  expect(SEARCH_SYSTEM_PROMPT).toContain("输出一段完整、连贯、可独立阅读的详细回答")
  expect(SEARCH_SYSTEM_PROMPT).toContain("使用 Markdown 方式标注相关 `chunk_id`")
  expect(SEARCH_SYSTEM_PROMPT).toContain("[chunk_id: doc_id::3]")
})

test("search prompt removes structured answer section", () => {
  expect(SEARCH_SYSTEM_PROMPT).not.toContain("`回答答案`")
})

test("search prompt keeps atomic pinecone tools and avoids standalone rerank tool", () => {
  expect(SEARCH_SYSTEM_PROMPT).toContain("- `pinecone_hybrid_search`")
  expect(SEARCH_SYSTEM_PROMPT).toContain("- `resolve_chunk_evidence`")
  expect(SEARCH_SYSTEM_PROMPT).not.toContain("- `rerank`")
})
