"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { EnvironmentEditor } from "./EnvironmentEditor";

export function EnvironmentSelector() {
  const { environments, selectedEnvironmentId, setSelectedEnvironmentId } =
    useAppStore();
  const [showEditor, setShowEditor] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <select
          value={selectedEnvironmentId || ""}
          onChange={(e) => setSelectedEnvironmentId(e.target.value || null)}
          className="flex-1 bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent appearance-none cursor-pointer"
        >
          <option value="">No Environment</option>
          {environments.map((env) => (
            <option key={env.id} value={env.id}>
              {env.meta.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowEditor(true)}
          className="text-text-muted hover:text-accent px-1.5 py-1.5 rounded hover:bg-bg-hover transition-colors flex-shrink-0"
          title="Manage environments"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <EnvironmentEditor
        open={showEditor}
        onClose={() => setShowEditor(false)}
      />
    </>
  );
}
