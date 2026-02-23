import { expect, test } from "bun:test"
import SEARCH_SYSTEM_PROMPT from "../../src/agent/search.txt"

const REQUIRED_HEADINGS = [
  "## Summary",
  "## Query & Scope",
  "## Retrieval Steps",
  "## Candidate Summary",
  "## Evidence Ledger",
  "## Rerank Result",
  "## Final Answer",
  "## Open Questions",
]

test("search prompt defines eight report headings in fixed order", () => {
  let lastIndex = -1
  for (const heading of REQUIRED_HEADINGS) {
    const current = SEARCH_SYSTEM_PROMPT.indexOf(`\`${heading}\``)
    expect(current).toBeGreaterThan(lastIndex)
    lastIndex = current
  }
})

test("search prompt defines strict REPORT_PATH/REPORT_ERROR output contract", () => {
  expect(SEARCH_SYSTEM_PROMPT).toContain("REPORT_PATH: spec/research/search-reports/latest.md")
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

test("search prompt enforces pointer-only evidence ledger", () => {
  expect(SEARCH_SYSTEM_PROMPT).toContain("pointer-only")
  expect(SEARCH_SYSTEM_PROMPT).toContain(
    "`evidence_id | chunk_id | source_path | offset_start | text_len | usage`",
  )
  expect(SEARCH_SYSTEM_PROMPT).toContain("禁止填写原文摘录")
})

test("search prompt uses atomic pinecone search flow without standalone rerank tool", () => {
  expect(SEARCH_SYSTEM_PROMPT).toContain("- `pinecone_hybrid_search`")
  expect(SEARCH_SYSTEM_PROMPT).toContain("单次 query，不做 query rewrite")
  expect(SEARCH_SYSTEM_PROMPT).not.toContain("- `rerank`")
})
