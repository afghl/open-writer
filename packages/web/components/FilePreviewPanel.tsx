"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, FileCode2, Pin, History } from "lucide-react";
import { FileNode, type FsEvent } from "../types";
import { cn } from "../lib/utils";
import {
  fetchFileBlob,
  fetchFileContent,
  listLibraryDocs,
  type OpenwriteFsReadResult,
} from "@/lib/openwrite-client";
import { TextPreviewRenderer } from "./file-preview/TextPreviewRenderer";
import { YouTubePreviewRenderer } from "./file-preview/YouTubePreviewRenderer";
import { PdfPreviewRenderer } from "./file-preview/PdfPreviewRenderer";

const PREVIEW_ANIMATION_MS = 2_000;

type ResolvedPreview = {
  kind: "text" | "youtube" | "pdf";
  sourceType?: "file" | "youtube";
  sourceURL?: string;
};

type LibraryPreviewMeta = {
  sourceType: "file" | "youtube";
  sourceURL?: string;
};

function normalizePreviewPath(input: string) {
  return input.replace(/^\/+/, "");
}

function findChangedLineIndexes(before: string, after: string) {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const max = Math.max(beforeLines.length, afterLines.length);
  const changed: number[] = [];

  for (let index = 0; index < max; index += 1) {
    if (beforeLines[index] !== afterLines[index]) {
      changed.push(index);
    }
  }

  return changed;
}

function shouldAnimateForFile(event: FsEvent | null, filePath: string) {
  if (!event || event.kind !== "file") return false;
  if (event.type === "fs.deleted") return false;
  if (event.type === "fs.moved") {
    return event.path === filePath || event.oldPath === filePath;
  }
  return event.path === filePath;
}

function isMarkdownFile(filePath: string) {
  return /\.(md|markdown)$/i.test(filePath);
}

function resolvePreviewFromFile(file: FileNode) {
  if (file.preview) {
    return {
      kind: file.preview.kind,
      ...(file.preview.sourceType ? { sourceType: file.preview.sourceType } : {}),
      ...(file.preview.sourceURL ? { sourceURL: file.preview.sourceURL } : {}),
    } as ResolvedPreview;
  }
  if (file.path.toLowerCase().endsWith(".pdf")) {
    return { kind: "pdf" } as const;
  }
  return null;
}

interface FilePreviewPanelProps {
  projectID: string | null;
  fsEvent: FsEvent | null;
  file: FileNode | null;
  onClose: () => void;
}

export function FilePreviewPanel({ projectID, fsEvent, file, onClose }: FilePreviewPanelProps) {
  const [content, setContent] = useState("");
  const [meta, setMeta] = useState<OpenwriteFsReadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedLines, setHighlightedLines] = useState<Set<number>>(new Set());
  const [resolvedPreview, setResolvedPreview] = useState<ResolvedPreview | null>(null);
  const [pdfBlobURL, setPdfBlobURL] = useState<string | null>(null);

  const contentRef = useRef("");
  const clearHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfBlobURLRef = useRef<string | null>(null);

  const replacePdfBlobURL = useCallback((nextURL: string | null) => {
    setPdfBlobURL((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      pdfBlobURLRef.current = nextURL;
      return nextURL;
    });
  }, []);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    return () => {
      if (clearHighlightTimerRef.current) {
        clearTimeout(clearHighlightTimerRef.current);
        clearHighlightTimerRef.current = null;
      }
      if (pdfBlobURLRef.current) {
        URL.revokeObjectURL(pdfBlobURLRef.current);
        pdfBlobURLRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!file || file.type === "folder") {
      setResolvedPreview(null);
      return () => {
        active = false;
      };
    }

    const fromFile = resolvePreviewFromFile(file);
    if (fromFile) {
      setResolvedPreview(fromFile);
      return () => {
        active = false;
      };
    }

    if (!projectID) {
      setResolvedPreview({ kind: "text" });
      return () => {
        active = false;
      };
    }

    const resolvePreview = async () => {
      const docs = await listLibraryDocs({ projectID });
      const map = new Map<string, LibraryPreviewMeta>();
      for (const doc of docs) {
        map.set(normalizePreviewPath(doc.doc_path), {
          sourceType: doc.source_type,
          sourceURL: doc.source_url,
        });
      }

      if (!active) return;

      const matchedDoc = map.get(normalizePreviewPath(file.path));
      if (matchedDoc?.sourceType === "youtube") {
        setResolvedPreview({
          kind: "youtube",
          sourceType: "youtube",
          ...(matchedDoc.sourceURL ? { sourceURL: matchedDoc.sourceURL } : {}),
        });
        return;
      }

      setResolvedPreview({ kind: "text" });
    };

    setResolvedPreview(null);
    void resolvePreview().catch(() => {
      if (!active) return;
      setResolvedPreview({ kind: "text" });
    });

    return () => {
      active = false;
    };
  }, [projectID, file]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    if (!projectID || !file || file.type === "folder" || !resolvedPreview) {
      setContent("");
      setMeta(null);
      setError(null);
      setLoading(false);
      setHighlightedLines(new Set());
      replacePdfBlobURL(null);
      return () => {
        active = false;
        controller.abort();
      };
    }

    const animate = resolvedPreview.kind === "text" && shouldAnimateForFile(fsEvent, file.path);

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (resolvedPreview.kind === "pdf") {
          const blob = await fetchFileBlob({
            projectID,
            path: file.path,
            signal: controller.signal,
          });
          if (!active) return;
          replacePdfBlobURL(URL.createObjectURL(blob));
          setContent("");
          setMeta(null);
          setHighlightedLines(new Set());
          return;
        }

        replacePdfBlobURL(null);
        const result = await fetchFileContent({
          projectID,
          path: file.path,
          offset: 0,
          limit: 2000,
        });
        if (!active) return;

        const nextContent = result.content;
        const previousContent = contentRef.current;
        setMeta(result);
        setContent(nextContent);

        if (!animate) {
          setHighlightedLines(new Set());
          return;
        }

        const nextHighlighted = new Set(findChangedLineIndexes(previousContent, nextContent));
        setHighlightedLines(nextHighlighted);
        if (clearHighlightTimerRef.current) {
          clearTimeout(clearHighlightTimerRef.current);
        }
        clearHighlightTimerRef.current = setTimeout(() => {
          setHighlightedLines(new Set());
          clearHighlightTimerRef.current = null;
        }, PREVIEW_ANIMATION_MS);
      } catch (cause) {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [projectID, file, fsEvent, resolvedPreview, replacePdfBlobURL]);

  if (!file) return null;

  const activeTabLabel = resolvedPreview
    ? resolvedPreview.kind === "pdf"
      ? "PDF"
      : resolvedPreview.kind === "youtube"
        ? "YouTube"
        : "Code"
    : "Resolving";

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="h-12 border-b border-stone-100 flex items-center justify-between px-4 shrink-0 bg-white">
        <div className="flex items-center gap-2.5 text-stone-600 overflow-hidden">
          <FileCode2
            size={16}
            className={cn(
              resolvedPreview?.kind === "pdf" && "text-red-500",
              resolvedPreview?.kind === "youtube" && "text-rose-500",
              (!resolvedPreview || resolvedPreview.kind === "text") && "text-blue-500",
            )}
          />
          <span className="font-mono text-sm text-stone-700 truncate">{file.path}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 hover:bg-stone-100 rounded text-stone-400 transition-colors">
            <History size={16} />
          </button>
          <button className="p-2 hover:bg-stone-100 rounded text-stone-400 transition-colors">
            <Pin size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded text-stone-400 hover:text-red-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="h-10 border-b border-stone-100 flex items-center px-4 gap-6 text-xs font-medium bg-[#FAFAF9] shrink-0">
        <span className="text-stone-800 border-b-[2px] border-orange-400 py-3 px-1">{activeTabLabel}</span>
        <span className="text-stone-400 px-1 py-3">Preview</span>
        <span className="text-stone-400 px-1 py-3">Blame</span>
      </div>

      <div
        className={cn(
          "flex-1 overflow-auto p-0 bg-white",
          resolvedPreview?.kind === "text" && "font-mono text-sm leading-6 text-stone-700",
        )}
      >
        {!resolvedPreview ? (
          <div className="px-5 py-4 text-sm text-stone-400">Resolving preview type...</div>
        ) : resolvedPreview.kind === "text" ? (
          <TextPreviewRenderer
            loading={loading}
            error={error}
            content={content}
            meta={meta}
            highlightedLines={highlightedLines}
            markdown={isMarkdownFile(file.path)}
          />
        ) : resolvedPreview.kind === "youtube" ? (
          <YouTubePreviewRenderer
            loading={loading}
            error={error}
            sourceURL={resolvedPreview.sourceURL}
            fallbackText={content}
            meta={meta}
          />
        ) : (
          <PdfPreviewRenderer
            loading={loading}
            error={error}
            blobURL={pdfBlobURL}
          />
        )}
      </div>
    </div>
  );
}
