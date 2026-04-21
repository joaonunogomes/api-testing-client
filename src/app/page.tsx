"use client";

import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/stores/app-store";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { RequestEditor } from "@/components/RequestEditor";
import { ResponseViewer } from "@/components/ResponseViewer";
import { CollectionSettings } from "@/components/CollectionSettings";

export default function Home() {
  const { fetchCollections, fetchEnvironments, fetchMockServers, fetchHistory } = useAppStore();
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"shortcuts" | "scripting" | "settings">("shortcuts");

  const { theme, setTheme } = useAppStore();

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const isMac = typeof navigator !== "undefined" && navigator.platform?.includes("Mac");
  const mod = isMac ? "⌘" : "Ctrl";

  // Close shortcuts modal on Escape
  const handleShortcutsKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setShowShortcuts(false);
  }, []);
  useEffect(() => {
    if (showShortcuts) {
      window.addEventListener("keydown", handleShortcutsKeyDown);
      return () => window.removeEventListener("keydown", handleShortcutsKeyDown);
    }
  }, [showShortcuts, handleShortcutsKeyDown]);

  // Global keyboard shortcuts
  useEffect(() => {
    const closeActiveTab = () => {
      const tabId = useAppStore.getState().activeTabId;
      if (tabId) {
        useAppStore.getState().closeTab(tabId);
      }
    };

    const saveActiveTab = () => {
      const state = useAppStore.getState();
      const tab = state.openTabs.find((t) => t.id === state.activeTabId);
      if (!tab) return;

      if (tab.type === "collection-settings") {
        // Dispatch event for CollectionSettings to handle its own save
        window.dispatchEvent(new CustomEvent("app:save"));
      } else if (tab.collectionId && tab.request) {
        state.saveTab(tab.id);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        closeActiveTab();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveActiveTab();
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
      await Promise.all([fetchCollections(), fetchEnvironments(), fetchMockServers(), fetchHistory()]);
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
  }, [fetchCollections, fetchEnvironments, fetchMockServers, fetchHistory]);

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
          <button
            onClick={() => setShowShortcuts(true)}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            title="Keyboard shortcuts"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="14" height="9" rx="1.5" />
              <line x1="4" y1="7" x2="5" y2="7" />
              <line x1="7.5" y1="7" x2="8.5" y2="7" />
              <line x1="11" y1="7" x2="12" y2="7" />
              <line x1="5" y1="10" x2="11" y2="10" />
            </svg>
          </button>
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

      {/* Settings modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-bg-primary border border-border rounded-lg w-[520px] max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="text-sm font-semibold text-text-primary">Reference</h3>
              <button
                onClick={() => setShowShortcuts(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border shrink-0">
              {(["shortcuts", "scripting", "settings"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSettingsTab(tab)}
                  className={`px-4 py-2 text-sm transition-colors relative ${
                    settingsTab === tab
                      ? "text-text-primary"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {tab === "shortcuts" ? "Keyboard Shortcuts" : tab === "scripting" ? "Scripting API" : "Settings"}
                  {settingsTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-5 py-4">
              {settingsTab === "shortcuts" && (
                <div className="space-y-3">
                  {[
                    { keys: `${mod}+Enter`, description: "Send request" },
                    { keys: `${mod}+S`, description: "Save" },
                    { keys: `${mod}+W`, description: "Close tab" },
                    { keys: `${mod}+B`, description: "Beautify body" },
                    { keys: `${mod}+F`, description: "Search in editor" },
                  ].map((shortcut) => (
                    <div key={shortcut.keys} className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">{shortcut.description}</span>
                      <kbd className="px-2 py-0.5 bg-bg-secondary rounded border border-border text-xs text-text-muted font-mono">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              )}

              {settingsTab === "settings" && (
                <div className="space-y-5 text-sm">
                  <section>
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Theme</h4>
                    <div className="flex gap-3">
                      {(["dark", "light"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            theme === t
                              ? "border-accent bg-accent/10"
                              : "border-border hover:border-border-light"
                          }`}
                        >
                          <div
                            className={`w-16 h-10 rounded border ${
                              t === "dark"
                                ? "bg-[#1e1e2e] border-[#313244]"
                                : "bg-[#eff1f5] border-[#ccd0da]"
                            }`}
                          >
                            <div className={`m-1.5 h-1.5 w-8 rounded-sm ${t === "dark" ? "bg-[#45475a]" : "bg-[#bcc0cc]"}`} />
                            <div className={`mx-1.5 h-1.5 w-5 rounded-sm ${t === "dark" ? "bg-[#89b4fa]" : "bg-[#1e66f5]"}`} />
                          </div>
                          <span className={`text-xs capitalize ${theme === t ? "text-accent" : "text-text-secondary"}`}>
                            {t}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {settingsTab === "scripting" && (
                <div className="space-y-5 text-sm">
                  <p className="text-text-muted">
                    Available in <span className="text-accent">pre-request</span> and <span className="text-accent">post-response</span> scripts.
                  </p>

                  {/* ac.env */}
                  <section>
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Environment Variables</h4>
                    <div className="space-y-2">
                      <div>
                        <code className="text-accent text-xs font-mono">ac.env.get(name)</code>
                        <p className="text-text-muted text-xs mt-0.5">Get a session-scoped environment variable.</p>
                      </div>
                      <div>
                        <code className="text-accent text-xs font-mono">ac.env.set(name, value)</code>
                        <p className="text-text-muted text-xs mt-0.5">Set a session-scoped environment variable.</p>
                      </div>
                    </div>
                  </section>

                  {/* ac.var */}
                  <section>
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Collection Variables</h4>
                    <div className="space-y-2">
                      <div>
                        <code className="text-accent text-xs font-mono">ac.getVar(name)</code>
                        <p className="text-text-muted text-xs mt-0.5">Get a collection-scoped variable.</p>
                      </div>
                      <div>
                        <code className="text-accent text-xs font-mono">ac.setVar(name, value)</code>
                        <p className="text-text-muted text-xs mt-0.5">Set a collection-scoped variable.</p>
                      </div>
                    </div>
                  </section>

                  {/* Testing */}
                  <section>
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Testing</h4>
                    <div className="space-y-2">
                      <div>
                        <code className="text-accent text-xs font-mono">ac.test(name, fn)</code>
                        <p className="text-text-muted text-xs mt-0.5">Define a named test assertion.</p>
                      </div>
                      <div>
                        <code className="text-accent text-xs font-mono">ac.expect(value)</code>
                        <p className="text-text-muted text-xs mt-0.5">Create an assertion chain. Methods:</p>
                        <div className="ml-3 mt-1 space-y-0.5 text-xs text-text-muted font-mono">
                          <div>.toBe(expected)</div>
                          <div>.toEqual(expected)</div>
                          <div>.toBeDefined()</div>
                          <div>.toBeTruthy()</div>
                          <div>.toContain(substring)</div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Response — post-response only */}
                  <section>
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                      Response <span className="normal-case font-normal">(post-response only)</span>
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <code className="text-accent text-xs font-mono">res.status</code>
                        <p className="text-text-muted text-xs mt-0.5">HTTP status code.</p>
                      </div>
                      <div>
                        <code className="text-accent text-xs font-mono">res.headers</code>
                        <p className="text-text-muted text-xs mt-0.5">Response headers object.</p>
                      </div>
                      <div>
                        <code className="text-accent text-xs font-mono">res.body</code>
                        <p className="text-text-muted text-xs mt-0.5">Raw response body string.</p>
                      </div>
                      <div>
                        <code className="text-accent text-xs font-mono">res.json()</code>
                        <p className="text-text-muted text-xs mt-0.5">Parse response body as JSON.</p>
                      </div>
                    </div>
                  </section>

                  {/* Console */}
                  <section>
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Console</h4>
                    <div className="space-y-2">
                      <div>
                        <code className="text-accent text-xs font-mono">console.log(...args)</code>
                        <p className="text-text-muted text-xs mt-0.5">Log output to the Console tab.</p>
                      </div>
                      <div>
                        <code className="text-accent text-xs font-mono">console.warn(...args)</code>
                        <p className="text-text-muted text-xs mt-0.5">Log a warning with [warn] prefix.</p>
                      </div>
                      <div>
                        <code className="text-accent text-xs font-mono">console.error(...args)</code>
                        <p className="text-text-muted text-xs mt-0.5">Log an error with [error] prefix.</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
