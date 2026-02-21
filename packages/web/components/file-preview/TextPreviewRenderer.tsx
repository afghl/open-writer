"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { OpenwriteFsReadResult } from "@/lib/openwrite-client";

type TextPreviewRendererProps = {
  loading: boolean;
  error: string | null;
  content: string;
  meta: OpenwriteFsReadResult | null;
  highlightedLines: Set<number>;
  markdown: boolean;
};

export function TextPreviewRenderer({
  loading,
  error,
  content,
  meta,
  highlightedLines,
  markdown,
}: TextPreviewRendererProps) {
  const lines = useMemo(() => {
    if (!content) return [""];
    return content.split(/\r?\n/);
  }, [content]);

  if (loading) {
    return <div className="px-5 py-4 text-sm text-stone-400">Loading file...</div>;
  }
  if (error) {
    return <div className="px-5 py-4 text-sm text-red-500">Failed to load file: {error}</div>;
  }

  if (markdown) {
    return (
      <div className="px-5 py-4 text-sm leading-7 text-stone-700">
        <div className="prose prose-stone max-w-none prose-pre:bg-stone-100 prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content.length > 0 ? content : "(empty file)"}
          </ReactMarkdown>
        </div>
        {meta?.truncated && (
          <div className="mt-2 text-xs text-stone-400">
            Truncated at {meta.limit} lines ({meta.totalLines} total lines).
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-full">
      <div className="w-12 bg-[#FAFAF9] border-r border-stone-100 flex flex-col items-end pr-3 py-4 text-stone-300 select-none text-xs">
        {lines.map((_, index) => <div key={index}>{index + 1}</div>)}
      </div>
      <div className="flex-1 py-4 px-5">
        <div className="space-y-0">
          {lines.map((line, index) => (
            <div
              key={index}
              className={cn(
                "whitespace-pre-wrap break-words rounded-[2px] px-1 -mx-1",
                highlightedLines.has(index) && "ow-line-flash",
              )}
            >
              {line.length > 0 ? line : " "}
            </div>
          ))}
        </div>
        {meta?.truncated && (
          <div className="mt-2 text-xs text-stone-400">
            Truncated at {meta.limit} lines ({meta.totalLines} total lines).
          </div>
        )}
      </div>
    </div>
  );
}
