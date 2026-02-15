"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hash, Plus, Paperclip, ArrowUp, Bot } from "lucide-react";
import { cn } from "../lib/utils";
import {
  AssistantMessageBox,
  ToolMessageBox,
  UserMessageBox,
  type DisplayMessage,
} from "./ChatMessageBoxes";
import {
  listMessages,
  sendMessageStream,
  type MessageStreamEvent,
  type OpenwriteMessageWithParts,
} from "@/lib/openwrite-client";

function messageText(message: OpenwriteMessageWithParts) {
  return message.parts.map((part) => part.text).join("").trim();
}

const TOOL_STEP_HINT = "Tool step completed.";

function mapToDisplayMessage(message: OpenwriteMessageWithParts): DisplayMessage {
  const kind = message.parts.some((part) => part.kind === "tool") ? "tool" : "text";
  return {
    id: message.info.id,
    role: message.info.role,
    text: messageText(message),
    createdAt: message.info.time.created,
    kind,
  };
}

function mergeMessageLists(
  current: OpenwriteMessageWithParts[],
  incoming: OpenwriteMessageWithParts[],
) {
  if (incoming.length === 0) {
    return current;
  }
  const merged = [...current];
  const indexByID = new Map(merged.map((message, index) => [message.info.id, index]));
  for (const next of incoming) {
    const index = indexByID.get(next.info.id);
    if (typeof index === "number") {
      merged[index] = next;
      continue;
    }
    indexByID.set(next.info.id, merged.length);
    merged.push(next);
  }
  merged.sort((a, b) => (a.info.id > b.info.id ? 1 : -1));
  return merged;
}

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
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<DisplayMessage | null>(null);
  const [streamingAssistantMessages, setStreamingAssistantMessages] = useState<DisplayMessage[]>([]);

  const messageListRef = useRef<OpenwriteMessageWithParts[]>([]);
  const sendingAbortRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const didInitialAutoScrollRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior });
    });
  }, []);

  const refreshMessages = useCallback(async (input?: { lastMessageID?: string }) => {
    const payload = await listMessages({
      projectID,
      ...(input?.lastMessageID ? { lastMessageID: input.lastMessageID } : {}),
    });
    setSessionID(payload.sessionID);
    setMessages((previous) => {
      if (!input?.lastMessageID) {
        return payload.messages;
      }
      return mergeMessageLists(previous, payload.messages);
    });
    return payload;
  }, [projectID]);

  useEffect(() => {
    messageListRef.current = messages;
  }, [messages]);

  useEffect(() => {
    sendingAbortRef.current?.abort();
    sendingAbortRef.current = null;
    setSending(false);
    setOptimisticUserMessage(null);
    setStreamingAssistantMessages([]);
    didInitialAutoScrollRef.current = false;
  }, [projectID]);

  useEffect(() => {
    return () => {
      sendingAbortRef.current?.abort();
      sendingAbortRef.current = null;
    };
  }, []);

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

  const displayMessages = useMemo(() => {
    const persisted = messages
      .map(mapToDisplayMessage)
      .filter((message) => message.text.length > 0);

    const messageMap = new Map<string, DisplayMessage>();
    for (const message of persisted) {
      messageMap.set(message.id, message);
    }
    if (optimisticUserMessage) {
      messageMap.set(optimisticUserMessage.id, optimisticUserMessage);
    }
    for (const message of streamingAssistantMessages) {
      messageMap.set(message.id, message);
    }

    return Array.from(messageMap.values()).sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return a.id > b.id ? 1 : -1;
    });
  }, [messages, optimisticUserMessage, streamingAssistantMessages]);

  useEffect(() => {
    if (loading || didInitialAutoScrollRef.current) return;
    didInitialAutoScrollRef.current = true;
    scrollToBottom();
  }, [displayMessages.length, loading, scrollToBottom]);

  useEffect(() => {
    if (!sending) return;
    scrollToBottom();
  }, [displayMessages, scrollToBottom, sending]);

  const status = sending ? "busy" : "idle";

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    const now = Date.now();
    const localUserID = `local-user-${now}`;
    const localAssistantID = `local-assistant-${now}`;
    const lastMessageID = messageListRef.current.at(-1)?.info.id;
    const controller = new AbortController();

    sendingAbortRef.current = controller;
    setInputValue("");
    setSending(true);
    setError(null);
    setOptimisticUserMessage({
      id: localUserID,
      role: "user",
      text,
      createdAt: now,
      pending: true,
    });
    setStreamingAssistantMessages([
      {
        id: localAssistantID,
        role: "assistant",
        text: "",
        createdAt: now,
        pending: true,
      },
    ]);
    scrollToBottom();

    const onStreamEvent = (event: MessageStreamEvent) => {
      if (event.type === "user_ack") {
        setSessionID(event.sessionID);
        setOptimisticUserMessage((previous) => {
          if (!previous) return previous;
          if (previous.id !== localUserID && previous.id !== event.userMessageID) {
            return previous;
          }
          return {
            ...previous,
            id: event.userMessageID,
            createdAt: event.createdAt,
          };
        });
        return;
      }

      if (event.type === "assistant_start") {
        setSessionID(event.sessionID);
        setStreamingAssistantMessages((previous) => {
          const next = previous.filter((message) => message.id !== localAssistantID);
          const existingIndex = next.findIndex((message) => message.id === event.assistantMessageID);
          if (existingIndex === -1) {
            next.push({
              id: event.assistantMessageID,
              role: "assistant",
              text: "",
              createdAt: event.createdAt,
              pending: true,
            });
            return next;
          }
          const existing = next[existingIndex];
          next[existingIndex] = {
            ...existing,
            createdAt: event.createdAt,
            pending: true,
          };
          return next;
        });
        return;
      }

      if (event.type === "text_delta") {
        setSessionID(event.sessionID);
        setStreamingAssistantMessages((previous) => {
          const next = previous.filter((message) => message.id !== localAssistantID);
          const existingIndex = next.findIndex((message) => message.id === event.assistantMessageID);
          if (existingIndex === -1) {
            next.push({
              id: event.assistantMessageID,
              role: "assistant",
              text: event.delta,
              createdAt: Date.now(),
              pending: true,
            });
            return next;
          }
          const existing = next[existingIndex];
          next[existingIndex] = {
            ...existing,
            text: existing.text + event.delta,
            pending: true,
            kind: "text",
          };
          return next;
        });
        return;
      }

      if (event.type === "assistant_finish") {
        setSessionID(event.sessionID);
        setStreamingAssistantMessages((previous) => {
          const next = previous.filter((message) => message.id !== localAssistantID);
          const existingIndex = next.findIndex((message) => message.id === event.assistantMessageID);
          if (existingIndex === -1) {
            next.push({
              id: event.assistantMessageID,
              role: "assistant",
              text: TOOL_STEP_HINT,
              createdAt: event.completedAt,
              pending: false,
              kind: "tool",
            });
            return next;
          }
          const existing = next[existingIndex];
          const hasText = existing.text.trim().length > 0;
          next[existingIndex] = {
            ...existing,
            text: hasText ? existing.text : TOOL_STEP_HINT,
            createdAt: existing.createdAt || event.completedAt,
            pending: false,
            kind: hasText ? "text" : "tool",
          };
          return next;
        });
        return;
      }

      if (event.type === "done") {
        setSessionID(event.sessionID);
        return;
      }

      if (event.type === "error") {
        setError(event.message);
      }
    };

    try {
      await sendMessageStream({
        projectID,
        text,
        signal: controller.signal,
        onEvent: onStreamEvent,
      });
      await refreshMessages(lastMessageID ? { lastMessageID } : undefined);
      setOptimisticUserMessage(null);
      setStreamingAssistantMessages([]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      try {
        await refreshMessages(lastMessageID ? { lastMessageID } : undefined);
      } catch {
        // Keep original error.
      }
      setOptimisticUserMessage(null);
      setStreamingAssistantMessages([]);
    } finally {
      if (sendingAbortRef.current === controller) {
        sendingAbortRef.current = null;
      }
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

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 scrollbar-hide bg-white">
        {loading && <div className="max-w-3xl mx-auto text-sm text-stone-400">Loading messages...</div>}
        {!loading && displayMessages.length === 0 && (
          <div className="max-w-3xl mx-auto text-sm text-stone-400">No messages yet.</div>
        )}
        {displayMessages.map((msg) => {
          if (msg.role === "user") {
            return <UserMessageBox key={msg.id} message={msg} />;
          }
          if (msg.kind === "tool") {
            return <ToolMessageBox key={msg.id} message={msg} />;
          }
          return <AssistantMessageBox key={msg.id} message={msg} />;
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
