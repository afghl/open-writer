"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, FileCode2, Pin, History } from "lucide-react";
import { FileNode } from "../types";
import { fetchFileContent, type OpenwriteFsReadResult } from "@/lib/openwrite-client";

interface FilePreviewPanelProps {
  projectID: string | null;
  fsRefreshTick: number;
  file: FileNode | null;
  onClose: () => void;
}

export function FilePreviewPanel({ projectID, fsRefreshTick, file, onClose }: FilePreviewPanelProps) {
  const [content, setContent] = useState("");
  const [meta, setMeta] = useState<OpenwriteFsReadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!projectID || !file || file.type === "folder") {
      setContent("");
      setMeta(null);
      setError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const loadFile = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFileContent({
          projectID,
          path: file.path,
          offset: 0,
          limit: 2000,
        });
        if (!active) return;
        setMeta(result);
        setContent(result.content);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadFile();
    return () => {
      active = false;
    };
  }, [projectID, file, fsRefreshTick]);

  const lines = useMemo(() => {
    if (!content) return [""];
    return content.split(/\r?\n/);
  }, [content]);

  if (!file) return null;

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="h-12 border-b border-stone-100 flex items-center justify-between px-4 shrink-0 bg-white">
        <div className="flex items-center gap-2.5 text-stone-600 overflow-hidden">
          <FileCode2 size={16} className="text-blue-500" />
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

      {/* Tabs */}
      <div className="h-10 border-b border-stone-100 flex items-center px-4 gap-6 text-xs font-medium bg-[#FAFAF9] shrink-0">
        <span className="text-stone-800 border-b-[2px] border-orange-400 py-3 px-1">Code</span>
        <span className="text-stone-400 cursor-pointer hover:text-stone-600 px-1 py-3">Preview</span>
        <span className="text-stone-400 cursor-pointer hover:text-stone-600 px-1 py-3">Blame</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-0 bg-white font-mono text-sm leading-6 text-stone-700">
        <div className="flex min-h-full">
            {/* Line Numbers */}
            <div className="w-12 bg-[#FAFAF9] border-r border-stone-100 flex flex-col items-end pr-3 py-4 text-stone-300 select-none text-xs">
                {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            {/* Code */}
            <div className="flex-1 py-4 px-5">
              {loading && <div className="text-stone-400">Loading file...</div>}
              {error && <div className="text-red-500">Failed to load file: {error}</div>}
              {!loading && !error && (
                <>
                  <pre className="whitespace-pre-wrap break-words">{content || ""}</pre>
                  {meta?.truncated && (
                    <div className="mt-2 text-xs text-stone-400">
                      Truncated at {meta.limit} lines ({meta.totalLines} total lines).
                    </div>
                  )}
                </>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}
