
import React from "react";
import { Hash, Zap, Plus, Paperclip, ArrowUp, Bot } from "lucide-react";
import { MOCK_MESSAGES, MOCK_SESSION } from "../mock/data";
import { TaskCard } from "./TaskCard";
import { cn } from "../lib/utils";

export function ChatPanel() {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Header */}
      <div className="h-[52px] border-b border-stone-100 flex items-center justify-between px-6 shrink-0 bg-white/80 backdrop-blur-sm z-10 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-stone-100 text-stone-500 flex items-center justify-center">
            <Hash size={12} />
          </div>
          <span className="font-semibold text-sm text-stone-700">{MOCK_SESSION.title}</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 bg-stone-50 rounded border border-stone-100">
           <div className={cn("w-1.5 h-1.5 rounded-full", MOCK_SESSION.status === "idle" ? "bg-stone-400" : "bg-green-500 animate-pulse")} />
           <span className="text-[10px] text-stone-500 font-medium uppercase tracking-wide">{MOCK_SESSION.status}</span>
        </div>
      </div>

      {/* Chat Timeline */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 scrollbar-hide bg-white">
        {MOCK_MESSAGES.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div 
              key={msg.id} 
              className={cn(
                "flex w-full max-w-3xl mx-auto", // Center the container
                isUser ? "justify-end" : "justify-start"
              )}
            >
              <div className={cn(
                "flex gap-4 w-full",
                isUser ? "flex-row-reverse" : "flex-row"
              )}>
                
                {/* Avatar */}
                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm mt-1",
                    !isUser ? "bg-white border-stone-200 text-orange-600" : "bg-stone-800 border-stone-800 text-white"
                )}>
                    {!isUser ? <Zap size={16} fill="currentColor" /> : <span className="text-xs font-bold">U</span>}
                </div>

                {/* Content Area */}
                <div className={cn("flex flex-col gap-1 min-w-0 flex-1", isUser && "items-end")}>
                    <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-stone-700">{isUser ? "You" : "OpenWrite Agent"}</span>
                        <span className="text-xs text-stone-300">{new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    
                    <div className={cn(
                      "leading-7 text-base md:text-lg", // Increased font size 1-2 steps
                      isUser 
                        ? "px-5 py-3 rounded-2xl bg-[#FAFAF9] border border-stone-200 text-stone-800 rounded-tr-sm shadow-sm" // User Bubble
                        : "px-0 py-0 text-stone-800" // Assistant: No bubble, plain text
                    )}>
                      {msg.content}
                    </div>
                    
                    {/* Task Card Attachment */}
                    {msg.taskRun && (
                      <div className="w-full max-w-[400px] mt-2">
                         <TaskCard task={msg.taskRun} />
                      </div>
                    )}
                </div>
              </div>
            </div>
          );
        })}
        {/* Spacer */}
        <div className="h-4" /> 
      </div>

      {/* Composer Area */}
      <div className="p-4 md:p-6 pb-8 bg-white border-t border-stone-100">
        <div className="max-w-3xl mx-auto w-full relative">
            <div className="relative bg-[#FAFAF9] rounded-xl border border-stone-200 shadow-sm transition-all focus-within:shadow-md focus-within:border-orange-200 focus-within:bg-white group">
                <textarea 
                    className="w-full bg-transparent border-0 focus:ring-0 p-4 pl-4 pr-12 min-h-[50px] max-h-[200px] resize-none text-base text-stone-800 placeholder:text-stone-400 outline-none rounded-xl"
                    placeholder="Ask OpenWrite to edit code or run a task..."
                    rows={1}
                />
                
                {/* Bottom Actions */}
                <div className="flex items-center justify-between px-2 pb-2">
                    <div className="flex items-center gap-1">
                        <button className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-lg transition-colors" aria-label="Add attachment">
                            <Plus size={16} />
                        </button>
                        <button className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-lg transition-colors" aria-label="Attach file">
                             <Paperclip size={16} />
                        </button>
                    </div>
                    
                    <button className="flex items-center justify-center w-8 h-8 bg-stone-900 hover:bg-black text-white rounded-lg shadow-sm transition-all transform active:scale-95">
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
