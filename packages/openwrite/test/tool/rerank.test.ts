import { afterAll, expect, mock, test } from "bun:test"

const loadRerankEvidenceModule = () => import("../../src/search/" + "rerank-evidence?rerank-fallback-test")

mock.module("@/llm", () => ({
  LLM: {
    for() {
      throw new Error("LLM unavailable in test")
    },
  },
}))

afterAll(() => {
  mock.restore()
})

test("rerankEvidence falls back to hybrid score ordering when LLM is unavailable", async () => {
  const { rerankEvidence } = await loadRerankEvidenceModule()

  const result = await rerankEvidence({
    query: "best evidence",
    candidates: [
      {
        chunk_id: "c-low",
        doc_id: "doc_a",
        source_path: "inputs/library/docs/a.md",
        source_text_path: "projects/project-1/workspace/inputs/library/docs/text/a.txt",
        snippet: "low confidence",
        hybrid_score: 0.02,
        rank: 2,
        metadata: {
          offset_start: 0,
          text_len: 40,
        },
      },
      {
        chunk_id: "c-high",
        doc_id: "doc_b",
        source_path: "inputs/library/docs/b.md",
        source_text_path: "projects/project-1/workspace/inputs/library/docs/text/b.txt",
        snippet: "high confidence",
        hybrid_score: 0.09,
        rank: 1,
        metadata: {
          offset_start: 40,
          text_len: 50,
        },
      },
    ],
    chunks: [
      {
        chunk_id: "c-low",
        doc_id: "doc_a",
        source_path: "inputs/library/docs/a.md",
        source_text_path: "projects/project-1/workspace/inputs/library/docs/text/a.txt",
        text: "chunk-low",
        snippet: "chunk-low",
        hybrid_score: 0,
        metadata: {
          offset_start: 0,
          text_len: 40,
        },
      },
      {
        chunk_id: "c-high",
        doc_id: "doc_b",
        source_path: "inputs/library/docs/b.md",
        source_text_path: "projects/project-1/workspace/inputs/library/docs/text/b.txt",
        text: "chunk-high",
        snippet: "chunk-high",
        hybrid_score: 0,
        metadata: {
          offset_start: 40,
          text_len: 50,
        },
      },
    ],
    topK: 2,
  })

  expect(result.fallback).toBe(true)
  expect(result.results).toHaveLength(2)
  expect(result.results[0]?.chunk_id).toBe("c-high")
  expect(result.results[0]?.rank).toBe(1)
  expect(result.results[1]?.chunk_id).toBe("c-low")
  expect(result.missing_chunk_ids).toEqual([])
})
