
import React from "react";
import { createRoot } from "react-dom/client";
import AppShell from "./components/AppShell";

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AppShell />
    </React.StrictMode>
  );
}
