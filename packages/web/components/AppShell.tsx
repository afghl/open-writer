
"use client";

import React, { useState } from "react";
import { LeftPanel } from "./LeftPanel";
import { FilePreviewPanel } from "./FilePreviewPanel";
import { ChatPanel } from "./ChatPanel";
import { FileNode } from "../types";
import { cn } from "../lib/utils";

export default function AppShell() {
  // --- Layout State ---
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  
  // File Preview State (Column B)
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState(true);

  // --- Handlers ---
  const handleFileSelect = (file: FileNode) => {
    if (file.type === "folder") return;
    
    // If clicking same file, just ensure it's open
    if (selectedFile?.id === file.id) {
        setPreviewCollapsed(false);
        return;
    }
    
    setSelectedFile(file);
    setPreviewCollapsed(false);
  };

  const handleClosePreview = () => {
    setPreviewCollapsed(true);
  };

  return (
    <div className="flex h-screen w-full bg-[#FAFAF9] overflow-hidden text-base font-sans antialiased">
      
      {/* --- Column A: Left Panel --- */}
      <aside
        className={cn(
          "flex flex-col border-r border-stone-200 bg-[#FAFAF9] transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] relative z-20",
          leftPanelCollapsed ? "w-[60px]" : "w-[280px]" // Increased expanded width slightly for larger font
        )}
      >
        <LeftPanel 
          collapsed={leftPanelCollapsed} 
          onToggleCollapse={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
          onFileSelect={handleFileSelect}
          selectedFileId={selectedFile?.id}
        />
      </aside>

      {/* --- Column B: File Preview --- */}
      <div
        className={cn(
          "flex flex-col border-r border-stone-200 bg-white transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] overflow-hidden shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10",
          previewCollapsed ? "w-0 opacity-0 border-none" : "w-[45%] lg:w-[40%] opacity-100"
        )}
      >
        <FilePreviewPanel 
          file={selectedFile} 
          onClose={handleClosePreview} 
        />
      </div>

      {/* --- Column C: Chat Workspace --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative z-0">
        <ChatPanel />
      </main>

    </div>
  );
}
