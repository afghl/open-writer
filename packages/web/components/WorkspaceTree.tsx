
"use client";

import React, { useEffect, useState } from "react";
import { Folder, FolderOpen, FileCode2, File, ChevronRight, ChevronDown } from "lucide-react";
import { FileNode, type FsEvent } from "../types";
import { cn } from "../lib/utils";
import { fetchFileTree, type OpenwriteFsNode } from "@/lib/openwrite-client";

const FileIcon = ({ name }: { name: string }) => {
    if (name.endsWith('tsx') || name.endsWith('ts')) return <FileCode2 size={16} className="text-blue-500" />;
    if (name.endsWith('json')) return <File size={16} className="text-yellow-600" />;
    if (name.endsWith('md')) return <File size={16} className="text-stone-400" />;
    return <File size={16} className="text-stone-400" />;
}

function highlightClassForPath(nodePath: string, event: FsEvent | null) {
  if (!event) return "";
  if (event.type === "fs.moved" && event.oldPath === nodePath) {
    return "ow-tree-flash-moved-old";
  }
  if (event.path !== nodePath) {
    return "";
  }
  if (event.type === "fs.created") return "ow-tree-flash-created";
  if (event.type === "fs.updated") return "ow-tree-flash-updated";
  if (event.type === "fs.deleted") return "ow-tree-flash-deleted";
  return "ow-tree-flash-moved";
}

function highlightTokenForPath(nodePath: string, event: FsEvent | null) {
  if (!event) return 0;
  if (event.path === nodePath) return event.token;
  if (event.type === "fs.moved" && event.oldPath === nodePath) return event.token;
  return 0;
}

const TreeNode = ({
  node,
  level,
  onSelect,
  selectedId,
  fsEvent,
}: {
  node: FileNode
  level: number
  onSelect: (n: FileNode) => void
  selectedId?: string
  fsEvent: FsEvent | null
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const isSelected = selectedId === node.id;
  const highlightClass = highlightClassForPath(node.path, fsEvent);

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
          isSelected ? "bg-white shadow-sm ring-1 ring-stone-200 text-stone-900" : "hover:bg-stone-200/50 text-stone-500 hover:text-stone-700",
          highlightClass,
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
              key={`${child.id}:${highlightTokenForPath(child.path, fsEvent)}`}
              node={child} 
              level={level + 1} 
              onSelect={onSelect}
              selectedId={selectedId}
              fsEvent={fsEvent}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function mapFsNode(node: OpenwriteFsNode): FileNode {
  return {
    id: node.path,
    name: node.name,
    type: node.kind === "dir" ? "folder" : "file",
    path: node.path,
    preview: node.preview
      ? {
        kind: node.preview.kind,
        ...(node.preview.source_type ? { sourceType: node.preview.source_type } : {}),
        ...(node.preview.source_url ? { sourceURL: node.preview.source_url } : {}),
      }
      : undefined,
    children: node.children?.map(mapFsNode),
  };
}

export function WorkspaceTree({
  projectID,
  onSelect,
  selectedId,
  fsRefreshTick,
  fsEvent,
}: {
  projectID: string | null
  onSelect: (node: FileNode) => void
  selectedId?: string
  fsRefreshTick: number
  fsEvent: FsEvent | null
}) {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!projectID) {
      setNodes([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const loadTree = async () => {
      setLoading(true);
      setError(null);
      try {
        const root = await fetchFileTree({ projectID, depth: 6 });
        if (!active) return;
        const children = root.children?.map(mapFsNode) ?? [];
        setNodes(children);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadTree();
    return () => {
      active = false;
    };
  }, [projectID, fsRefreshTick]);

  return (
    <div className="mt-1 pb-10">
      {!projectID && <div className="px-5 py-3 text-xs text-stone-400">Waiting for project...</div>}
      {projectID && loading && <div className="px-5 py-3 text-xs text-stone-400">Loading files...</div>}
      {projectID && error && <div className="px-5 py-3 text-xs text-red-500">Failed to load files: {error}</div>}
      {projectID && !loading && !error && nodes.length === 0 && (
        <div className="px-5 py-3 text-xs text-stone-400">Workspace is empty.</div>
      )}
      {nodes.map((node) => (
        <TreeNode
          key={`${node.id}:${highlightTokenForPath(node.path, fsEvent)}`}
          node={node}
          level={0}
          onSelect={onSelect}
          selectedId={selectedId}
          fsEvent={fsEvent}
        />
      ))}
    </div>
  );
}
