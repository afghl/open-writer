
import React from "react";
import { X, FileCode2, Pin, History } from "lucide-react";
import { FileNode } from "../types";

interface FilePreviewPanelProps {
  file: FileNode | null;
  onClose: () => void;
}

export function FilePreviewPanel({ file, onClose }: FilePreviewPanelProps) {
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
                {Array.from({length: 20}).map((_, i) => <div key={i}>{i+1}</div>)}
            </div>
            {/* Code */}
            <div className="flex-1 py-4 px-5 whitespace-pre-wrap">
                <span className="text-purple-600">import</span> React <span className="text-purple-600">from</span> <span className="text-green-600">&apos;react&apos;</span>;
                {'\n\n'}
                <span className="text-purple-600">export const</span> <span className="text-blue-600">Button</span> = ({'{'} children {'}'}) ={'>'} {'{'}
                {'\n'}
                {'  '}return (
                {'\n'}
                {'    '}&lt;<span className="text-red-600">button</span> className=<span className="text-green-600">&quot;px-4 py-2 bg-blue-500 rounded&quot;</span>&gt;
                {'\n'}
                {'      '}{'{'}children{'}'}
                {'\n'}
                {'    '}&lt;/<span className="text-red-600">button</span>&gt;
                {'\n'}
                {'  '});
                {'\n'}
                {'}'};
            </div>
        </div>
      </div>
    </div>
  );
}
