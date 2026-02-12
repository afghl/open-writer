"use client";

import React from "react";
import { Zap } from "lucide-react";
import { cn } from "../lib/utils";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

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
  code({ className, children, ...props }) {
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

function MessageTime({ timestamp }: { timestamp: number }) {
  return (
    <span className="text-xs text-stone-300">
      {timeFormatter.format(new Date(timestamp))}
    </span>
  );
}

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  pending?: boolean;
  kind?: "text" | "tool";
};

export function UserMessageBox({ message }: { message: DisplayMessage }) {
  return (
    <div className="flex w-full max-w-3xl mx-auto justify-end">
      <div className="flex gap-4 w-full flex-row-reverse">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm mt-1 bg-stone-800 border-stone-800 text-white">
          <span className="text-xs font-bold">U</span>
        </div>

        <div className="flex flex-col gap-1 min-w-0 flex-1 items-end">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-stone-700">You</span>
            <MessageTime timestamp={message.createdAt} />
          </div>

          <div className="leading-7 text-base md:text-medium px-5 py-3 rounded-2xl bg-[#FAFAF9] border border-stone-200 text-stone-800 rounded-tr-sm shadow-sm">
            {message.text}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssistantMessageBox({ message }: { message: DisplayMessage }) {
  return (
    <div className="flex w-full max-w-3xl mx-auto justify-start">
      <div className="flex gap-4 w-full flex-row">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm mt-1 bg-white border-stone-200 text-orange-600">
          <Zap size={16} fill="currentColor" />
        </div>

        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-stone-700">Assistant</span>
            <MessageTime timestamp={message.createdAt} />
          </div>

          <div className="leading-7 text-base md:text-medium px-0 py-0 text-stone-800">
            {message.text.length === 0 ? (
              <span className="text-stone-400">Thinking...</span>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.text}
              </ReactMarkdown>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToolMessageBox({ message }: { message: DisplayMessage }) {
  return (
    <div className="flex w-full max-w-3xl mx-auto justify-start">
      <div className="flex gap-4 w-full flex-row">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm mt-1 bg-white border-stone-200 text-orange-600">
          <Zap size={16} fill="currentColor" />
        </div>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-stone-600">Tool</span>
            <MessageTime timestamp={message.createdAt} />
          </div>
          <div className="self-start block w-fit max-w-full py-0 text-[13px] leading-5 text-stone-400">
            <span>{message.text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
