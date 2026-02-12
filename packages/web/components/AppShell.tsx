
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LeftPanel } from "./LeftPanel";
import { FilePreviewPanel } from "./FilePreviewPanel";
import { ChatPanel } from "./ChatPanel";
import { FileNode } from "../types";
import { cn } from "../lib/utils";
import { createProject, listProjects, type OpenwriteProject } from "@/lib/openwrite-client";

type AppShellProps = {
  projectSlug?: string | null
}

export default function AppShell({ projectSlug }: AppShellProps) {
  const router = useRouter();

  // --- Layout State ---
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);

  // File Preview State (Column B)
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState(true);
  const [project, setProject] = useState<OpenwriteProject | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [emptyProjects, setEmptyProjects] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [fsRefreshTick, setFsRefreshTick] = useState(0);
  const projectID = project?.id ?? null;
  const projectTitle = project?.title ?? "OpenWrite Project";

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      setProjectLoading(true);
      setProjectError(null);
      setEmptyProjects(false);
      try {
        const projects = await listProjects();
        if (!active) return;

        if (projects.length === 0) {
          setProject(null);
          setEmptyProjects(true);
          return;
        }

        const incomingSlug = (projectSlug ?? "").trim();
        const matched = incomingSlug
          ? projects.find((item) => item.project_slug === incomingSlug)
          : undefined;
        const resolved = matched ?? projects[0];
        setProject(resolved);
        setEmptyProjects(false);

        if (!incomingSlug || !matched) {
          router.replace(`/projects/${resolved.project_slug}`);
        }
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setProject(null);
        setProjectError(message);
      } finally {
        if (active) {
          setProjectLoading(false);
        }
      }
    };
    void bootstrap();
    return () => {
      active = false;
    };
  }, [projectSlug, router]);

  useEffect(() => {
    setSelectedFile(null);
    setPreviewCollapsed(true);
  }, [projectID]);

  useEffect(() => {
    if (!projectID) return;

    const source = new EventSource(`/events?project_id=${encodeURIComponent(projectID)}`);
    const onFsChange = () => {
      setFsRefreshTick((tick) => tick + 1);
    };
    const fsEventNames = ["fs.created", "fs.updated", "fs.deleted", "fs.moved"];

    for (const eventName of fsEventNames) {
      source.addEventListener(eventName, onFsChange);
    }

    return () => {
      for (const eventName of fsEventNames) {
        source.removeEventListener(eventName, onFsChange);
      }
      source.close();
    };
  }, [projectID]);

  const handleCreateProject = async () => {
    if (creatingProject) return;
    setCreatingProject(true);
    setProjectError(null);
    try {
      const nextProject = await createProject();
      setProject(nextProject);
      setEmptyProjects(false);
      router.replace(`/projects/${nextProject.project_slug}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProjectError(message);
    } finally {
      setCreatingProject(false);
    }
  };

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
          projectID={projectID}
          projectTitle={projectTitle}
          projectLoading={projectLoading}
          projectError={projectError}
          fsRefreshTick={fsRefreshTick}
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
          projectID={projectID}
          fsRefreshTick={fsRefreshTick}
          file={selectedFile} 
          onClose={handleClosePreview} 
        />
      </div>

      {/* --- Column C: Chat Workspace --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative z-0">
        {emptyProjects ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-stone-800">No projects yet</h2>
              <p className="mt-2 text-sm text-stone-500">
                Create your first project to start browsing files and chatting with the agent.
              </p>
              <button
                type="button"
                className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleCreateProject}
                disabled={creatingProject}
              >
                {creatingProject ? "Creating..." : "Create project"}
              </button>
              {projectError && <p className="mt-3 text-xs text-red-500">{projectError}</p>}
            </div>
          </div>
        ) : projectLoading || !projectID ? (
          <div className="flex h-full items-center justify-center text-sm text-stone-500">
            Loading project...
          </div>
        ) : (
          <ChatPanel projectID={projectID} />
        )}
      </main>

    </div>
  );
}
