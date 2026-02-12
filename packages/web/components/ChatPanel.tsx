"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Hash, Zap, Plus, Paperclip, ArrowUp, Bot } from "lucide-react";
import { cn } from "../lib/utils";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  listMessages,
  sendMessage,
  type OpenwriteMessageWithParts,
} from "@/lib/openwrite-client";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function MessageTime({ timestamp }: { timestamp: number }) {
  return (
    <span className="text-xs text-stone-300">
      {timeFormatter.format(new Date(timestamp))}
    </span>
  );
}

function messageText(message: OpenwriteMessageWithParts) {
  return message.parts.map((part) => part.text).join("").trim();
}

const markdownComponents: Components = {
  p({ children }) {
    return <p className="mb-3 last:mb-0">{children}</p>;
  },
  ul({ children }) {
    return <ul className="mb-3 list-disc pl-6 space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-3 list-decimal pl-6 space-y-1">{children}</ol>;
  },
  li({ children }) {
    return <li>{children}</li>;
  },
  blockquote({ children }) {
    return <blockquote className="my-3 border-l-2 border-stone-300 pl-3 text-stone-600">{children}</blockquote>;
  },
  a({ children, className, href }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn("text-orange-700 underline underline-offset-2", className)}
      >
        {children}
      </a>
    );
  },
  pre({ children }) {
    return (
      <pre className="my-3 overflow-x-auto rounded-lg bg-stone-100 px-3 py-2 text-sm leading-6">
        {children}
      </pre>
    );
  },
  code({ node: _node, className, children, ...props }) {
    const hasLanguage = typeof className === "string" && className.includes("language-");
    return (
      <code
        {...props}
        className={cn(
          "font-mono",
          hasLanguage ? className : "rounded bg-stone-100 px-1 py-0.5 text-[0.92em]",
        )}
      >
        {children}
      </code>
    );
  },
};

type ChatPanelProps = {
  projectID: string;
};

export function ChatPanel({ projectID }: ChatPanelProps) {
  const [messages, setMessages] = useState<OpenwriteMessageWithParts[]>([]);
  const [sessionID, setSessionID] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  const refreshMessages = useCallback(async () => {
    const payload = await listMessages({ projectID });
    setSessionID(payload.sessionID);
    setMessages(payload.messages);
  }, [projectID]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const payload = await listMessages({ projectID });
        if (!active) return;
        setSessionID(payload.sessionID);
        setMessages(payload.messages);
      } catch (caught) {
        if (!active) return;
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [projectID]);

  const displayMessages = useMemo(
    () =>
      messages
        .map((message) => ({
          id: message.info.id,
          role: message.info.role,
          text: messageText(message),
          createdAt: message.info.time.created,
        }))
        .filter((message) => message.text.length > 0),
    [messages],
  );

  const status = sending ? "busy" : "idle";

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    setInputValue("");
    setSending(true);
    setError(null);
    try {
      await sendMessage({ projectID, text });
      await refreshMessages();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
    } finally {
      setSending(false);
    }
  }, [inputValue, projectID, refreshMessages, sending]);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-[52px] border-b border-stone-100 flex items-center justify-between px-6 shrink-0 bg-white/80 backdrop-blur-sm z-10 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-stone-100 text-stone-500 flex items-center justify-center">
            <Hash size={12} />
          </div>
          <span className="font-semibold text-sm text-stone-700">
            {sessionID ? `Session ${sessionID}` : "Session"}
          </span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 bg-stone-50 rounded border border-stone-100">
          <div className={cn("w-1.5 h-1.5 rounded-full", status === "idle" ? "bg-stone-400" : "bg-green-500 animate-pulse")} />
          <span className="text-[10px] text-stone-500 font-medium uppercase tracking-wide">{status}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 scrollbar-hide bg-white">
        {loading && <div className="max-w-3xl mx-auto text-sm text-stone-400">Loading messages...</div>}
        {!loading && displayMessages.length === 0 && (
          <div className="max-w-3xl mx-auto text-sm text-stone-400">No messages yet.</div>
        )}
        {displayMessages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={cn(
                "flex w-full max-w-3xl mx-auto",
                isUser ? "justify-end" : "justify-start",
              )}
            >
              <div className={cn("flex gap-4 w-full", isUser ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm mt-1",
                  !isUser ? "bg-white border-stone-200 text-orange-600" : "bg-stone-800 border-stone-800 text-white",
                )}>
                  {!isUser ? <Zap size={16} fill="currentColor" /> : <span className="text-xs font-bold">U</span>}
                </div>

                <div className={cn("flex flex-col gap-1 min-w-0 flex-1", isUser && "items-end")}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-stone-700">{isUser ? "You" : "OpenWrite Agent"}</span>
                    <MessageTime timestamp={msg.createdAt} />
                  </div>

                  <div className={cn(
                    "leading-7 text-base md:text-lg",
                    isUser
                      ? "px-5 py-3 rounded-2xl bg-[#FAFAF9] border border-stone-200 text-stone-800 rounded-tr-sm shadow-sm"
                      : "px-0 py-0 text-stone-800",
                  )}>
                    {isUser ? (
                      msg.text
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {msg.text}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div className="h-4" />
      </div>

      <div className="p-4 md:p-6 pb-8 bg-white border-t border-stone-100">
        {error && <div className="mb-3 max-w-3xl mx-auto text-xs text-red-500">{error}</div>}
        <div className="max-w-3xl mx-auto w-full relative">
          <div className="relative bg-[#FAFAF9] rounded-xl border border-stone-200 shadow-sm transition-all focus-within:shadow-md focus-within:border-orange-200 focus-within:bg-white group">
            <textarea
              className="w-full bg-transparent border-0 focus:ring-0 p-4 pl-4 pr-12 min-h-[50px] max-h-[200px] resize-none text-base text-stone-800 placeholder:text-stone-400 outline-none rounded-xl"
              placeholder={sending ? "Waiting for assistant..." : "Ask OpenWrite to edit code or run a task..."}
              rows={1}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              disabled={sending}
            />

            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <button className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-lg transition-colors" aria-label="Add attachment" type="button">
                  <Plus size={16} />
                </button>
                <button className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-lg transition-colors" aria-label="Attach file" type="button">
                  <Paperclip size={16} />
                </button>
              </div>

              <button
                className="flex items-center justify-center w-8 h-8 bg-stone-900 hover:bg-black text-white rounded-lg shadow-sm transition-all transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                type="button"
                onClick={() => void handleSend()}
                disabled={sending || inputValue.trim().length === 0}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
          <div className="text-center mt-3">
            <span className="text-[10px] text-stone-300 font-medium flex items-center justify-center gap-1">
              <Bot size={10} /> AI can make mistakes. Please verify important information.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
