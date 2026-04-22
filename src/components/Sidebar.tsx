"use client";

import { useAppStore } from "@/stores/app-store";
import { CollectionTree } from "./CollectionTree";
import { EnvironmentSelector } from "./EnvironmentSelector";
import { HistoryList } from "./HistoryList";
import { ImportDialog } from "./ImportDialog";
import { useState, useCallback, useEffect, useRef } from "react";


export function Sidebar() {
  const { collections, sidebarWidth, setSidebarWidth, fetchCollections, fetchHistory } =
    useAppStore();
  const [sidebarTab, setSidebarTab] = useState<"collections" | "history">("collections");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      startWidth.current = sidebarWidth;
      setIsResizing(true);
    },
    [sidebarWidth]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth.current + (e.clientX - startX.current);
      setSidebarWidth(Math.min(500, Math.max(200, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName("");
    setIsCreating(false);
    fetchCollections();
  };

  const handleCollectionReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      const ordered = collections.map((c) => c.id);
      const [moved] = ordered.splice(fromIndex, 1);
      ordered.splice(toIndex, 0, moved);
      // Optimistic update
      const reordered = ordered.map((id) => collections.find((c) => c.id === id)!);
      useAppStore.setState({ collections: reordered });
      // Persist
      fetch("/api/collections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collections: ordered }),
      });
    },
    [collections],
  );

  return (
    <>
      <aside
        className="flex flex-col border-r border-border bg-bg-secondary h-full"
        style={{ width: sidebarWidth, minWidth: 200, maxWidth: 500 }}
      >
        <div className="p-3 border-b border-border">
          <EnvironmentSelector />
        </div>

        <div className="flex items-center border-b border-border">
          <button
            onClick={() => setSidebarTab("collections")}
            className={`flex-1 text-xs font-semibold uppercase tracking-wider py-2 transition-colors relative ${
              sidebarTab === "collections" ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Collections
            {sidebarTab === "collections" && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent" />
            )}
          </button>
          <button
            onClick={() => { setSidebarTab("history"); fetchHistory(); }}
            className={`flex-1 text-xs font-semibold uppercase tracking-wider py-2 transition-colors relative ${
              sidebarTab === "history" ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            History
            {sidebarTab === "history" && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent" />
            )}
          </button>
          {sidebarTab === "collections" && (
            <div className="flex items-center gap-1 pr-2">
              <button
                onClick={() => setShowImport(true)}
                className="text-text-muted hover:text-accent text-xs px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors"
                title="Import from Postman or link a local repo"
              >
                Import
              </button>
              <button
                onClick={() => setIsCreating(!isCreating)}
                className="text-text-muted hover:text-text-primary text-lg leading-none px-1"
                title="New collection"
              >
                +
              </button>
            </div>
          )}
        </div>

        {sidebarTab === "collections" ? (
          <>
            {isCreating && (
              <div className="p-2 border-b border-border">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setIsCreating(false);
                  }}
                  placeholder="Collection name..."
                  autoFocus
                  className="w-full bg-bg-primary border border-border rounded px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-1">
              {collections.map((collection, index) => (
                <CollectionTree
                  key={collection.id}
                  collection={collection}
                  index={index}
                  onCollectionReorder={handleCollectionReorder}
                />
              ))}
              {collections.length === 0 && (
                <p className="text-text-muted text-xs px-3 py-4 text-center">
                  No collections found
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <HistoryList />
          </div>
        )}
      </aside>

      <div
        onMouseDown={handleMouseDown}
        className={`w-1 cursor-col-resize border-r border-border hover:bg-accent/20 transition-colors ${isResizing ? "bg-accent/30" : ""}`}
      />

      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}

      <ImportDialog open={showImport} onClose={() => setShowImport(false)} />
    </>
  );
}
