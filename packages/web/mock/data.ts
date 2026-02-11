
import { FileNode, Message, Project, ProjectProgress, Session } from "../types";

export const MOCK_PROJECTS: Project[] = [
  { id: "p-1", name: "OpenWrite Web App" },
  { id: "p-2", name: "Marketing Site" },
];

export const MOCK_SESSION: Session = {
  id: "s-1",
  projectId: "p-1",
  title: "Implement File Tree Component",
  status: "idle",
};

export const MOCK_PROGRESS: ProjectProgress = {
  projectId: "p-1",
  completionRate: 65,
  openTasks: 12,
  doneTasks: 24,
  lastUpdated: "10m ago",
};

export const MOCK_FILE_TREE: FileNode[] = [
  {
    id: "root",
    name: "src",
    type: "folder",
    path: "/src",
    children: [
      {
        id: "f-1", name: "components", type: "folder", path: "/src/components", children: [
          { id: "file-1", name: "Button.tsx", type: "file", path: "/src/components/Button.tsx" },
          { id: "file-2", name: "Header.tsx", type: "file", path: "/src/components/Header.tsx" },
        ]
      },
      { id: "file-3", name: "App.tsx", type: "file", path: "/src/App.tsx" },
      { id: "file-4", name: "utils.ts", type: "file", path: "/src/utils.ts" },
    ],
  },
  { id: "file-5", name: "package.json", type: "file", path: "/package.json" },
  { id: "file-6", name: "README.md", type: "file", path: "/README.md" },
];

export const MOCK_MESSAGES: Message[] = [
  {
    id: "m-1",
    sessionId: "s-1",
    role: "user",
    content: "Please help me organize the component structure for the file tree.",
    createdAt: "2026-02-11T14:36:00.000Z",
  },
  {
    id: "m-2",
    sessionId: "s-1",
    role: "assistant",
    content: "I can help with that. Based on your current stack, I recommend a recursive component approach. Here is the plan:",
    createdAt: "2026-02-11T14:37:00.000Z",
    taskRun: {
      id: "t-1",
      title: "Analyzing Project Structure",
      status: "done",
      steps: [
        { title: "Reading file system", status: "done" },
        { title: "Identifying component patterns", status: "done" },
        { title: "Drafting hierarchy", status: "done" },
      ],
    },
  },
  {
    id: "m-3",
    sessionId: "s-1",
    role: "assistant",
    content: "Should I proceed with generating the `FileNode` type definition first?",
    createdAt: "2026-02-11T14:38:00.000Z",
  },
];

export const MOCK_FILE_CONTENT = `import React from 'react';

export const Button = ({ children }) => {
  return (
    <button className="px-4 py-2 bg-blue-500 text-white rounded">
      {children}
    </button>
  );
};
`;
