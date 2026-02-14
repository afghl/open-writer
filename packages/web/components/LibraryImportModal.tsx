"use client"

import { useEffect, useMemo, useState } from "react"
import {
  createLibraryImport,
  getLibraryImport,
  listLibraryDocs,
  type OpenwriteLibraryDoc,
  type OpenwriteLibraryImport,
} from "@/lib/openwrite-client"

type Mode = "file" | "url"
type ReplaceMode = "new" | "replace"

type LibraryImportModalProps = {
  open: boolean
  projectID: string | null
  onClose: () => void
  onImported?: () => void
}

const STAGE_LABELS: Record<OpenwriteLibraryImport["stage"], string> = {
  queued: "排队中",
  validating: "校验中",
  ingesting: "接收资料",
  parsing: "解析内容",
  summarizing_title: "生成标题与摘要",
  chunking: "切块",
  embedding: "生成向量",
  pinecone_upsert: "写入 Pinecone",
  writing_summary: "写入总结",
  refresh_index: "刷新索引",
  success: "完成",
  fail: "失败",
}

export function LibraryImportModal({ open, projectID, onClose, onImported }: LibraryImportModalProps) {
  const [mode, setMode] = useState<Mode>("file")
  const [replaceMode, setReplaceMode] = useState<ReplaceMode>("new")
  const [replaceDocID, setReplaceDocID] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [url, setURL] = useState("")
  const [docs, setDocs] = useState<OpenwriteLibraryDoc[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [importState, setImportState] = useState<OpenwriteLibraryImport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const selectedDoc = useMemo(() => docs.find((doc) => doc.id === replaceDocID), [docs, replaceDocID])

  useEffect(() => {
    if (!open) {
      setMode("file")
      setReplaceMode("new")
      setReplaceDocID("")
      setFile(null)
      setURL("")
      setImportError(null)
      setImportState(null)
      return
    }

    if (!projectID) {
      return
    }

    let active = true
    setLoadingDocs(true)
    setImportError(null)

    void (async () => {
      try {
        const result = await listLibraryDocs({ projectID })
        if (!active) return
        setDocs(result)
      } catch (error) {
        if (!active) return
        const message = error instanceof Error ? error.message : String(error)
        setImportError(message)
      } finally {
        if (active) {
          setLoadingDocs(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [open, projectID])

  useEffect(() => {
    if (!projectID || !importState?.id) {
      return
    }
    if (importState.status === "success" || importState.status === "fail") {
      return
    }

    let active = true
    const refresh = async () => {
      try {
        const next = await getLibraryImport({
          projectID,
          importID: importState.id,
        })
        if (!active) return
        setImportState(next.import)
        if (next.import.status === "success") {
          onImported?.()
          onClose()
        }
      } catch (error) {
        if (!active) return
        const message = error instanceof Error ? error.message : String(error)
        setImportError(message)
      }
    }

    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, 2_000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [importState?.id, importState?.status, onClose, onImported, projectID])

  if (!open) return null

  const submit = async () => {
    if (!projectID || submitting) return

    setImportError(null)

    if (mode === "file" && !file) {
      setImportError("请选择 PDF 或 TXT 文件")
      return
    }

    if (mode === "url" && !url.trim()) {
      setImportError("请输入 YouTube URL")
      return
    }

    if (replaceMode === "replace" && !replaceDocID) {
      setImportError("请选择一个待替换文件")
      return
    }

    setSubmitting(true)
    try {
      const created = await createLibraryImport({
        projectID,
        ...(mode === "file" && file ? { file } : {}),
        ...(mode === "url" ? { url: url.trim() } : {}),
        ...(replaceMode === "replace" && replaceDocID ? { replaceDocID } : {}),
      })
      setImportState({
        id: created.id,
        project_id: projectID,
        input: {
          mode,
          ...(replaceMode === "replace" && replaceDocID ? { replace_doc_id: replaceDocID } : {}),
          ...(mode === "file" && file ? { file_name: file.name } : {}),
          ...(mode === "url" ? { url: url.trim() } : {}),
        },
        status: (created.status as OpenwriteLibraryImport["status"]) ?? "queued",
        stage: (created.stage as OpenwriteLibraryImport["stage"]) ?? "queued",
        time: {
          created: Date.now(),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setImportError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h3 className="text-base font-bold text-stone-800">导入资料</h3>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
            onClick={onClose}
            disabled={submitting}
          >
            关闭
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">输入方式</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("file")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${mode === "file" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-stone-200 text-stone-600"}`}
              >
                上传文件 (PDF/TXT)
              </button>
              <button
                type="button"
                onClick={() => setMode("url")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${mode === "url" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-stone-200 text-stone-600"}`}
              >
                YouTube URL
              </button>
            </div>
          </div>

          {mode === "file" ? (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                选择文件
              </label>
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700"
                disabled={submitting}
              />
              {file && (
                <p className="mt-1 text-xs text-stone-500">
                  已选：{file.name} ({Math.round(file.size / 1024)} KB)
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                YouTube URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(event) => setURL(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700"
                disabled={submitting}
              />
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">导入模式</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setReplaceMode("new")
                  setReplaceDocID("")
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${replaceMode === "new" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-stone-200 text-stone-600"}`}
              >
                新文件
              </button>
              <button
                type="button"
                onClick={() => setReplaceMode("replace")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${replaceMode === "replace" ? "border-orange-300 bg-orange-50 text-orange-700" : "border-stone-200 text-stone-600"}`}
                disabled={docs.length === 0}
              >
                替换已有文件
              </button>
            </div>

            {replaceMode === "replace" && (
              <div className="mt-3 space-y-2">
                <select
                  className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700"
                  value={replaceDocID}
                  onChange={(event) => setReplaceDocID(event.target.value)}
                  disabled={submitting || loadingDocs}
                >
                  <option value="">请选择要替换的文档</option>
                  {docs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} ({doc.id})
                    </option>
                  ))}
                </select>
                {selectedDoc && (
                  <p className="text-xs text-stone-500">将替换：{selectedDoc.doc_path}</p>
                )}
              </div>
            )}
          </div>

          {importState && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
              <p>
                当前状态：<strong>{importState.status}</strong>
              </p>
              <p>当前阶段：{STAGE_LABELS[importState.stage]}</p>
              <p className="text-xs text-stone-500">import_id: {importState.id}</p>
              {importState.error && (
                <p className="mt-1 text-xs text-red-600">
                  {importState.error.code}: {importState.error.message}
                </p>
              )}
            </div>
          )}

          {importError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {importError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void submit()}
              disabled={submitting || !projectID}
            >
              {submitting ? "提交中..." : "开始导入"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
