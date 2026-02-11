
"use client";

import React, { useState } from "react";
import { Folder, FolderOpen, FileCode2, File, ChevronRight, ChevronDown } from "lucide-react";
import { FileNode } from "../types";
import { cn } from "../lib/utils";
import { MOCK_FILE_TREE } from "../mock/data";

const FileIcon = ({ name }: { name: string }) => {
    if (name.endsWith('tsx') || name.endsWith('ts')) return <FileCode2 size={16} className="text-blue-500" />;
    if (name.endsWith('json')) return <File size={16} className="text-yellow-600" />;
    if (name.endsWith('md')) return <File size={16} className="text-stone-400" />;
    return <File size={16} className="text-stone-400" />;
}

const TreeNode = ({ node, level, onSelect, selectedId }: { node: FileNode, level: number, onSelect: (n: FileNode) => void, selectedId?: string }) => {
  const [isOpen, setIsOpen] = useState(true);
  const isSelected = selectedId === node.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === "folder") {
      setIsOpen(!isOpen);
    } else {
      onSelect(node);
    }
  };

  return (
    <div className="select-none">
      <div 
        onClick={handleClick}
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 mx-2 rounded-md cursor-pointer transition-all duration-200 text-sm font-medium group",
          isSelected ? "bg-white shadow-sm ring-1 ring-stone-200 text-stone-900" : "hover:bg-stone-200/50 text-stone-500 hover:text-stone-700"
        )}
        style={{ paddingLeft: `${level * 14 + 10}px` }}
      >
        <span className="shrink-0 text-stone-400 group-hover:text-stone-500">
          {node.type === "folder" ? (
             <span className="flex items-center justify-center w-4 h-4">
                 {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
             </span>
          ) : (
             <span className="w-4 h-4 flex items-center justify-center opacity-0" />
          )}
        </span>
        
        <span className="shrink-0">
            {node.type === "folder" ? (
                isOpen ? <FolderOpen size={16} className="text-orange-400/80" /> : <Folder size={16} className="text-orange-400/80" />
            ) : (
                <FileIcon name={node.name} />
            )}
        </span>
        
        <span className="truncate">{node.name}</span>
      </div>
      {node.type === "folder" && isOpen && node.children && (
        <div className="relative">
             {/* Simple visual guide line could go here */}
          {node.children.map((child) => (
            <TreeNode 
              key={child.id} 
              node={child} 
              level={level + 1} 
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function WorkspaceTree({ onSelect, selectedId }: { onSelect: (node: FileNode) => void, selectedId?: string }) {
  return (
    <div className="mt-1 pb-10">
      {MOCK_FILE_TREE.map((node) => (
        <TreeNode key={node.id} node={node} level={0} onSelect={onSelect} selectedId={selectedId} />
      ))}
    </div>
  );
}
