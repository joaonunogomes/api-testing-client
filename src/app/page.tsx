"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { RequestEditor } from "@/components/RequestEditor";
import { ResponseViewer } from "@/components/ResponseViewer";
import { CollectionSettings } from "@/components/CollectionSettings";

export default function Home() {
  const { fetchCollections, fetchEnvironments, fetchMockServers } = useAppStore();
  const [responseHeight, setResponseHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [electronPlatform, setElectronPlatform] = useState<string | null>(null);
  useEffect(() => {
    const api = (window as unknown as { electron?: { platform?: string } }).electron;
    if (api?.platform) setElectronPlatform(api.platform);
  }, []);
  const electronApi = typeof window !== "undefined" ? (window as unknown as { electron?: { platform?: string; windowMinimize?: () => void; windowMaximize?: () => void; windowClose?: () => void } }).electron : undefined;
  const isElectronMac = electronPlatform === "darwin";
  const isElectronNonMac = !!electronPlatform && electronPlatform !== "darwin";

  const { closeTab, activeTabId, openTabs } = useAppStore();
  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const isCollectionSettings = activeTab?.type === "collection-settings";

  // Cmd+W / Ctrl+W closes the active tab instead of the window
  useEffect(() => {
    const closeActiveTab = () => {
      const tabId = useAppStore.getState().activeTabId;
      if (tabId) {
        useAppStore.getState().closeTab(tabId);
      }
    };

    // Handle from keyboard directly (works in browser/dev mode)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        closeActiveTab();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // Handle from Electron menu IPC (packaged app)
    const electron = (window as unknown as { electron?: { onCloseTab?: (cb: () => void) => void } }).electron;
    electron?.onCloseTab?.(() => closeActiveTab());

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchCollections(), fetchEnvironments(), fetchMockServers()]);
      // Restore tabs and environment after data is loaded
      await useAppStore.getState().restoreSession();
    };
    init();

    // SSE for live reload
    const eventSource = new EventSource("/api/events");
    eventSource.onmessage = () => {
      fetchCollections();
      fetchEnvironments();
    };

    // Poll mock server statuses periodically
    const mockInterval = setInterval(fetchMockServers, 10000);

    return () => {
      eventSource.close();
      clearInterval(mockInterval);
    };
  }, [fetchCollections, fetchEnvironments, fetchMockServers]);

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
      {/* Top bar — draggable as window title bar on Electron */}
      <header
        className="flex items-center justify-between pr-4 border-b border-border bg-bg-tertiary"
        style={{
          paddingTop: isElectronMac ? 10 : 8,
          paddingBottom: isElectronMac ? 10 : 8,
          paddingLeft: isElectronMac ? 96 : 16,
          ...(electronPlatform ? { WebkitAppRegion: "drag" } : {}),
        } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-text-primary tracking-wide">
            API Client
          </h1>
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-border">
              Ctrl+Enter
            </kbd>
            <span>to send</span>
          </div>
          {isElectronNonMac && (
            <div className="flex items-center ml-4">
              <button
                onClick={() => electronApi?.windowMinimize?.()}
                className="w-8 h-8 flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors rounded"
              >
                <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
              </button>
              <button
                onClick={() => electronApi?.windowMaximize?.()}
                className="w-8 h-8 flex items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors rounded"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>
              </button>
              <button
                onClick={() => electronApi?.windowClose?.()}
                className="w-8 h-8 flex items-center justify-center text-text-muted hover:bg-error hover:text-white transition-colors rounded"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main id="main-content" className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <TabBar />

          {isCollectionSettings ? (
            <div className="flex-1 overflow-hidden">
              <CollectionSettings collectionId={activeTab.collectionId} />
            </div>
          ) : (
            <>
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
