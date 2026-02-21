"use client";

import { useMemo } from "react";
import type { OpenwriteFsReadResult } from "@/lib/openwrite-client";

type YouTubePreviewRendererProps = {
  loading: boolean;
  error: string | null;
  sourceURL?: string;
  fallbackText: string;
  meta: OpenwriteFsReadResult | null;
};

function toYouTubeEmbedURL(sourceURL?: string) {
  if (!sourceURL) return null;
  try {
    const parsed = new URL(sourceURL);
    const host = parsed.hostname.toLowerCase();
    const allowedHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
    if (!allowedHosts.has(host)) {
      return null;
    }
    let videoID = "";

    if (host === "youtu.be" || host === "www.youtu.be") {
      videoID = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    } else {
      const fromQuery = parsed.searchParams.get("v")?.trim() ?? "";
      if (fromQuery) {
        videoID = fromQuery;
      } else {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length >= 2 && (parts[0] === "shorts" || parts[0] === "embed")) {
          videoID = parts[1] ?? "";
        }
      }
    }

    if (!videoID) {
      return null;
    }

    return `https://www.youtube.com/embed/${encodeURIComponent(videoID)}`;
  } catch {
    return null;
  }
}

export function YouTubePreviewRenderer({
  loading,
  error,
  sourceURL,
  fallbackText,
  meta,
}: YouTubePreviewRendererProps) {
  const embedURL = useMemo(() => toYouTubeEmbedURL(sourceURL), [sourceURL]);

  if (loading) {
    return <div className="px-5 py-4 text-sm text-stone-400">Loading video...</div>;
  }

  if (error) {
    return <div className="px-5 py-4 text-sm text-red-500">Failed to load YouTube preview: {error}</div>;
  }

  if (!embedURL) {
    return (
      <div className="px-5 py-4 text-sm text-stone-500">
        This file is marked as YouTube source, but no valid source URL is available.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-black aspect-video">
        <iframe
          title="YouTube Preview"
          src={embedURL}
          className="h-full w-full border-0"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <div className="rounded-lg border border-stone-200 bg-[#FAFAF9] p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Transcript</div>
        <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-stone-700 font-mono">
          {fallbackText.length > 0 ? fallbackText : "No transcript text available."}
        </pre>
        {meta?.truncated && (
          <div className="mt-2 text-xs text-stone-400">
            Transcript truncated at {meta.limit} lines ({meta.totalLines} total lines).
          </div>
        )}
      </div>
    </div>
  );
}
