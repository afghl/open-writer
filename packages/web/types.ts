
export type Project = { id: string; name: string };
export type Session = { id: string; projectId: string; title: string; status: "idle" | "busy" };
export type FileType = "file" | "folder";
export type FileNode = {
  id: string;
  name: string;
  type: FileType;
  path: string;
  preview?: {
    kind: "text" | "youtube" | "pdf";
    sourceType?: "file" | "youtube";
    sourceURL?: string;
  };
  children?: FileNode[];
};
export type FileContent = { path: string; content: string; updatedAt: string };
export type MessageRole = "user" | "assistant";
export type TaskStep = { title: string; status: "pending" | "running" | "done" | "error"; detail?: string };
export type TaskRun = {
  id: string;
  title: string;
  steps: TaskStep[];
  status: "running" | "done" | "error";
};
export type Message = {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  taskRun?: TaskRun;
  createdAt: string;
};
export type ProjectProgress = {
  projectId: string;
  completionRate: number;
  openTasks: number;
  doneTasks: number;
  lastUpdated: string;
};

export type FsEventType = "fs.created" | "fs.updated" | "fs.deleted" | "fs.moved";
export type FsEventKind = "file" | "dir";
export type FsEventSource = "agent_tool" | "api" | "external_upload";

export type FsEvent = {
  token: number;
  type: FsEventType;
  projectID: string;
  path: string;
  kind: FsEventKind;
  source: FsEventSource;
  time: number;
  oldPath?: string;
};
