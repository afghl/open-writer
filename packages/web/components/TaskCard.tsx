
"use client";

import React, { useState } from "react";
import { CheckCircle2, Circle, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { TaskRun, TaskStep } from "../types";
import { cn } from "../lib/utils";

const StatusIcon = ({ status }: { status: TaskStep['status'] }) => {
  switch (status) {
    case 'done': return <CheckCircle2 size={14} className="text-green-500" />;
    case 'running': return <Loader2 size={14} className="text-blue-500 animate-spin" />;
    case 'error': return <AlertCircle size={14} className="text-red-500" />;
    default: return <Circle size={14} className="text-stone-300" />;
  }
};

export function TaskCard({ task }: { task: TaskRun }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-stone-200 rounded-lg bg-white overflow-hidden shadow-sm my-2 w-full">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-stone-50 transition-colors bg-white"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
           <div className="w-6 h-6 rounded bg-stone-100 flex items-center justify-center border border-stone-200 text-stone-500">
             <Loader2 size={12} className={cn(task.status === 'running' && "animate-spin")} />
           </div>
           <div>
             <div className="font-semibold text-xs text-stone-800">{task.title}</div>
             <div className="text-[10px] text-stone-400 font-mono">{task.status} • {task.steps.length} steps</div>
           </div>
        </div>
        <div className="text-stone-400">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Steps Body */}
      {expanded && (
        <div className="border-t border-stone-100 bg-[#FAFAF9] p-1.5">
          {task.steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-3 p-2 rounded hover:bg-white hover:shadow-sm transition-all group">
              <div className="mt-0.5"><StatusIcon status={step.status} /></div>
              <div className="flex-1 min-w-0">
                <div className={cn("text-xs", step.status === 'done' ? "text-stone-500" : "text-stone-800 font-medium")}>
                  {step.title}
                </div>
                {step.detail && (
                  <div className="text-[10px] text-stone-400 mt-0.5 font-mono truncate bg-white/50 px-1 rounded inline-block border border-stone-100">{step.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
