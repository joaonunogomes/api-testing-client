"use client";

import { useAppStore } from "@/stores/app-store";
import { CollectionTree } from "./CollectionTree";
import { EnvironmentSelector } from "./EnvironmentSelector";
import { ImportDialog } from "./ImportDialog";
import type { Collection, TreeNode } from "@/lib/types";
import { useState, useCallback, useEffect, useRef } from "react";

interface FlatNode {
  id: string;
  type: TreeNode["type"];
  parentId: string | null;
  collectionId: string;
}

function flattenVisible(
  collections: Collection[],
  expanded: Set<string>,
): FlatNode[] {
  const result: FlatNode[] = [];
  const visit = (
    node: TreeNode,
    parentId: string | null,
    collectionId: string,
  ) => {
    result.push({ id: node.id, type: node.type, parentId, collectionId });
    const isFolder = node.type === "collection" || node.type === "folder";
    if (isFolder && expanded.has(node.id) && node.children) {
      for (const child of node.children) visit(child, node.id, collectionId);
    }
  };
  for (const c of collections) visit(c.tree, null, c.id);
  return result;
}

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable;
}

export function Sidebar() {
  const { collections, sidebarWidth, setSidebarWidth, fetchCollections, openHistoryTab, focusedNodeId } =
    useAppStore();
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(document.activeElement)) return;

      const navKeys = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"];
      if (!navKeys.includes(e.key)) return;

      const state = useAppStore.getState();
      const flat = flattenVisible(state.collections, state.expandedNodes);
      if (flat.length === 0) return;

      const idx = state.focusedNodeId
        ? flat.findIndex((n) => n.id === state.focusedNodeId)
        : -1;

      if (idx === -1) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          state.setFocusedNodeId(flat[0].id);
        }
        return;
      }

      const node = flat[idx];
      const isFolder = node.type === "collection" || node.type === "folder";

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = Math.min(idx + 1, flat.length - 1);
        state.setFocusedNodeId(flat[nextIdx].id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = Math.max(idx - 1, 0);
        state.setFocusedNodeId(flat[prevIdx].id);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!isFolder) return;
        if (!state.expandedNodes.has(node.id)) {
          state.toggleNode(node.id);
        } else if (idx + 1 < flat.length && flat[idx + 1].parentId === node.id) {
          state.setFocusedNodeId(flat[idx + 1].id);
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (isFolder && state.expandedNodes.has(node.id)) {
          state.toggleNode(node.id);
        } else if (node.parentId) {
          state.setFocusedNodeId(node.parentId);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (node.type === "collection") {
          state.openCollectionSettings(node.collectionId);
          state.toggleNode(node.id);
        } else if (node.type === "folder") {
          state.toggleNode(node.id);
        } else {
          const requestId = node.id.replace(`${node.collectionId}/`, "");
          state.openRequest(node.collectionId, requestId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!focusedNodeId) return;
    const el = document.querySelector(
      `[data-node-id="${CSS.escape(focusedNodeId)}"]`,
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedNodeId]);

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

        <div className="flex items-center border-b border-border pl-3 pr-2">
          <span className="flex-1 text-xs font-semibold uppercase tracking-wider py-2 text-text-primary">
            Collections
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={openHistoryTab}
              className="text-text-muted hover:text-accent text-xs px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors flex items-center gap-1"
              title="Open history"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
              History
            </button>
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
        </div>

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
