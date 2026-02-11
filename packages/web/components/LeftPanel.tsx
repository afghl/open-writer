
import React from "react";
import { FolderGit2, ChevronLeft, ChevronRight, LayoutGrid, Settings, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { WorkspaceTree } from "./WorkspaceTree";
import { MOCK_PROGRESS, MOCK_PROJECTS } from "../mock/data";
import { FileNode } from "../types";

interface LeftPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFileSelect: (file: FileNode) => void;
  selectedFileId?: string;
}

export function LeftPanel({ collapsed, onToggleCollapse, onFileSelect, selectedFileId }: LeftPanelProps) {
  return (
    <div className="flex flex-col h-full w-full bg-[#FAFAF9]">
      
      {/* Row A1: Project List */}
      <div className="h-[76px] border-b border-stone-200 flex flex-col justify-center px-4 shrink-0">
        <div className="flex items-center justify-between">
           {!collapsed && (
               <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-stone-200/50 cursor-pointer transition-colors flex-1 mr-2">
                    <div className="w-8 h-8 rounded bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center text-orange-600 border border-orange-200/50 shrink-0">
                        <FolderGit2 size={18} />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-bold text-stone-800 leading-tight mb-0.5 truncate">{MOCK_PROJECTS[0].name}</span>
                        <span className="text-xs text-stone-400 leading-none truncate">main • updated 2h ago</span>
                    </div>
               </div>
           )}
           <button 
             onClick={onToggleCollapse}
             className={cn(
               "p-1.5 rounded-md text-stone-400 hover:bg-stone-200 hover:text-stone-600 transition-colors",
               collapsed && "mx-auto"
             )}
           >
             {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
           </button>
        </div>
      </div>

      {/* Row A2: Progress Summary */}
      <div className={cn("border-b border-stone-200 shrink-0 transition-all overflow-hidden", collapsed ? "h-0 opacity-0 p-0 border-0" : "h-[110px] p-4")}>
        <div className="flex flex-col h-full justify-center space-y-3 bg-white border border-stone-100 rounded-xl p-3.5 shadow-sm">
             <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-blue-400" /> Sprint Status
                </span>
                <span className="text-sm font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{MOCK_PROGRESS.completionRate}%</span>
             </div>
             <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${MOCK_PROGRESS.completionRate}%` }} />
             </div>
             <div className="flex justify-between text-xs text-stone-500 font-medium">
                <span>{MOCK_PROGRESS.doneTasks} done</span>
                <span className="text-stone-400">{MOCK_PROGRESS.openTasks} remaining</span>
             </div>
        </div>
      </div>

      {/* Row A3: Workspace Tree */}
      <div className="flex-1 overflow-y-auto pt-3 scrollbar-hide">
        {!collapsed && (
          <>
            <div className="px-5 py-2 text-xs font-bold text-stone-400 uppercase tracking-wider flex justify-between items-center mb-1">
              <span>Files</span>
              <LayoutGrid size={14} className="cursor-pointer hover:text-stone-600"/>
            </div>
            <WorkspaceTree onSelect={onFileSelect} selectedId={selectedFileId} />
          </>
        )}
        {collapsed && (
           <div className="flex flex-col items-center gap-4 mt-6 text-stone-400">
             <div className="w-9 h-9 rounded-lg hover:bg-stone-200 flex items-center justify-center cursor-pointer"><LayoutGrid size={20} /></div>
             <div className="w-9 h-9 rounded-lg hover:bg-stone-200 flex items-center justify-center cursor-pointer"><Settings size={20} /></div>
           </div>
        )}
      </div>
      
      {/* Bottom User/Settings Mock */}
      {!collapsed && (
          <div className="h-14 border-t border-stone-200 flex items-center px-5 gap-3 text-sm font-medium text-stone-700 bg-[#FAFAF9]">
             <div className="w-7 h-7 rounded-full bg-stone-200 border border-stone-300"></div>
             <span>Senior Engineer</span>
          </div>
      )}
    </div>
  );
}
