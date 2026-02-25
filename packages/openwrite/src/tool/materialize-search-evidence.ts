import { promises as fs } from "node:fs"
import z from "zod"
import { publish } from "@/bus"
import { fsUpdated } from "@/bus"
import { fetchChunks, type SearchChunk } from "@/search"
import { resolveWorkspacePath } from "@/util/workspace-path"
import { Tool } from "./tool"

const DESCRIPTION =
  "通过替换证据章节下的 chunk_id 占位符，在搜索报告中物化 canonical 证据条目。"

const EVIDENCE_HEADING = "## 证据原文"
const CHUNK_ID_RE = /chunk_id\s*[:=]\s*([^\s`"'|,\]]+)/gi

function normalizeChunkIDToken(input: string) {
  return input
    .trim()
    .replace(/^`+/, "")
    .replace(/`+$/, "")
    .replace(/^['"]+/, "")
    .replace(/['"]+$/, "")
    .replace(/[.,;:)\]]+$/, "")
}

function uniqueChunkIDs(chunkIDs: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const chunkID of chunkIDs) {
    if (!chunkID || seen.has(chunkID)) continue
    seen.add(chunkID)
    result.push(chunkID)
  }
  return result
}

function parseEvidenceSectionRange(lines: string[]) {
  const startIndex = lines.findIndex((line) => line.trim() === EVIDENCE_HEADING)
  if (startIndex < 0) {
    throw new Error(`Evidence section heading not found: ${EVIDENCE_HEADING}`)
  }

  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith("## ")) {
      endIndex = index
      break
    }
  }

  return {
    startIndex,
    endIndex,
  }
}

function extractChunkIDsFromLines(lines: string[]) {
  const chunkIDs: string[] = []
  for (const line of lines) {
    CHUNK_ID_RE.lastIndex = 0
    let match = CHUNK_ID_RE.exec(line)
    while (match?.[1]) {
      const chunkID = normalizeChunkIDToken(match[1])
      if (chunkID) {
        chunkIDs.push(chunkID)
      }
      match = CHUNK_ID_RE.exec(line)
    }
  }
  return uniqueChunkIDs(chunkIDs)
}

function quoteLines(input: string) {
  const lines = input.split(/\r?\n/)
  if (lines.length === 0) {
    return ["> "]
  }
  return lines.map((line) => `> ${line}`)
}

function renderEvidenceEntries(input: {
  chunks: SearchChunk[]
  missingChunkIDs: string[]
}) {
  const output: string[] = []

  for (let index = 0; index < input.chunks.length; index += 1) {
    const chunk = input.chunks[index]
    output.push(`### evidence_${index + 1}`)
    output.push(`- chunk_id: ${chunk.chunk_id}`)
    output.push(`- source_path: ${chunk.source_path}`)
    output.push(`- offset_start: ${chunk.metadata.offset_start}`)
    output.push(`- text_len: ${chunk.metadata.text_len}`)
    output.push("- text:")
    output.push(...quoteLines(chunk.text))
    output.push("")
  }

  if (input.missingChunkIDs.length > 0) {
    output.push("### missing_chunk_ids")
    for (const chunkID of input.missingChunkIDs) {
      output.push(`- ${chunkID}`)
    }
    output.push("")
  }

  if (output.length === 0) {
    output.push("- 无可物化证据。")
  }

  if (output[output.length - 1] === "") {
    output.pop()
  }
  return output
}

export const MaterializeSearchEvidenceTool = Tool.define("materialize_search_evidence", async () => ({
  description: DESCRIPTION,
  parameters: z.object({
    report_path: z.string().min(1).describe("需要原地物化证据条目的逻辑报告路径。"),
  }),
  async execute(params, ctx) {
    const {
      resolvedPath,
      logicalNamespacePath,
    } = resolveWorkspacePath(params.report_path, ctx.projectID)

    await ctx.ask({
      permission: "edit",
      patterns: [resolvedPath],
      always: ["*"],
      metadata: {
        tool: "materialize_search_evidence",
        report_path: params.report_path,
        resolved_path: resolvedPath,
      },
    })

    const report = await fs.readFile(resolvedPath, "utf8")
    const lines = report.split(/\r?\n/)
    const range = parseEvidenceSectionRange(lines)
    const rawEvidenceLines = lines.slice(range.startIndex + 1, range.endIndex)
    const chunkIDs = extractChunkIDsFromLines(rawEvidenceLines)
    if (chunkIDs.length === 0) {
      throw new Error("No chunk_id placeholders found under the evidence section.")
    }

    const fetchResult = await fetchChunks({
      projectID: ctx.projectID,
      chunkIDs,
    })
    const chunkByID = new Map(fetchResult.chunks.map((chunk) => [chunk.chunk_id, chunk]))
    const resolvedChunks = chunkIDs
      .map((chunkID) => chunkByID.get(chunkID))
      .filter((chunk): chunk is SearchChunk => !!chunk)
    const missingChunkIDs = uniqueChunkIDs([
      ...fetchResult.missing_chunk_ids,
      ...chunkIDs.filter((chunkID) => !chunkByID.has(chunkID)),
    ])

    const materializedLines = renderEvidenceEntries({
      chunks: resolvedChunks,
      missingChunkIDs,
    })
    const nextLines = [
      ...lines.slice(0, range.startIndex + 1),
      ...materializedLines,
      ...lines.slice(range.endIndex),
    ]
    await fs.writeFile(resolvedPath, nextLines.join("\n"), "utf8")
    await publish(fsUpdated, {
      projectID: ctx.projectID,
      path: logicalNamespacePath,
      kind: "file",
      source: "agent_tool",
      time: Date.now(),
    })

    const payload = {
      report_path: params.report_path,
      requested_chunk_ids: chunkIDs,
      materialized_count: resolvedChunks.length,
      missing_chunk_ids: missingChunkIDs,
    }
    return {
      title: `materialize_search_evidence (${resolvedChunks.length})`,
      metadata: payload,
      output: JSON.stringify(payload, null, 2),
    }
  },
}))
