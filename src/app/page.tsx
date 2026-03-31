"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { RequestEditor } from "@/components/RequestEditor";
import { ResponseViewer } from "@/components/ResponseViewer";

export default function Home() {
  const { fetchCollections, fetchEnvironments } = useAppStore();
  const [responseHeight, setResponseHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    fetchCollections();
    fetchEnvironments();

    // SSE for live reload
    const eventSource = new EventSource("/api/events");
    eventSource.onmessage = () => {
      fetchCollections();
      fetchEnvironments();
    };

    return () => eventSource.close();
  }, [fetchCollections, fetchEnvironments]);

  // Handle vertical resize
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const mainArea = document.getElementById("main-content");
      if (!mainArea) return;
      const rect = mainArea.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY;
      setResponseHeight(Math.max(100, Math.min(newHeight, rect.height - 200)));
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-tertiary">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-text-primary tracking-wide">
            API Client
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-border">
            Ctrl+Enter
          </kbd>
          <span>to send</span>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main id="main-content" className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <TabBar />

          {/* Request editor */}
          <div className="flex-1 overflow-hidden" style={{ minHeight: 200 }}>
            <RequestEditor />
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={() => setIsDragging(true)}
            className={`h-1 cursor-row-resize border-t border-border hover:bg-accent/20 transition-colors ${isDragging ? "bg-accent/30" : ""}`}
          />

          {/* Response viewer */}
          <div
            className="overflow-hidden bg-bg-secondary"
            style={{ height: responseHeight }}
          >
            <ResponseViewer />
          </div>
        </main>
      </div>
    </div>
  );
}
