"use client";

import { useRef, useState, useCallback } from "react";
import { useAppStore } from "@/stores/app-store";
import type { Collection, TreeNode } from "@/lib/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-method-get",
  POST: "text-method-post",
  PUT: "text-method-put",
  PATCH: "text-method-patch",
  DELETE: "text-method-delete",
  OPTIONS: "text-method-options",
  HEAD: "text-method-head",
};

type DropPosition = "before" | "after" | "inside";

interface DragState {
  /** The tree node being dragged */
  sourceNode: TreeNode;
  /** Collection that owns the dragged node */
  collectionId: string;
}

// Module-level drag state so all TreeNodeItems can access it
let activeDrag: DragState | null = null;

function getParentPath(nodeId: string, collectionId: string): string {
  // nodeId is like "collectionId/folder/subfolder/request-name"
  const rel = nodeId.replace(`${collectionId}/`, "");
  const parts = rel.split("/");
  parts.pop(); // remove the item itself
  return parts.join("/");
}

function getBaseName(nodeId: string, collectionId: string): string {
  const rel = nodeId.replace(`${collectionId}/`, "");
  const parts = rel.split("/");
  return parts[parts.length - 1];
}

function getRelativePath(nodeId: string, collectionId: string): string {
  return nodeId.replace(`${collectionId}/`, "");
}

function TreeNodeItem({
  node,
  depth,
  collectionId,
  isLinked,
  isMockRunning,
  onReorder,
  collectionIndex,
  onCollectionReorder,
}: {
  node: TreeNode;
  depth: number;
  collectionId: string;
  isLinked?: boolean;
  isMockRunning?: boolean;
  onReorder: (
    collectionId: string,
    parentPath: string,
    children: string[],
  ) => void;
  collectionIndex?: number;
  onCollectionReorder?: (fromIndex: number, toIndex: number) => void;
}) {
  const {
    expandedNodes,
    toggleNode,
    openRequest,
    openCollectionSettings,
    activeTabId,
    focusedNodeId,
    setFocusedNodeId,
  } = useAppStore();

  const [dropIndicator, setDropIndicator] = useState<DropPosition | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const isExpanded = expandedNodes.has(node.id);
  const isFolder = node.type === "collection" || node.type === "folder";
  const isSelected = node.type === "request" && activeTabId === node.id;
  const isCollectionSelected =
    node.type === "collection" &&
    activeTabId === `__collection__${collectionId}`;
  const isFocused = focusedNodeId === node.id;

  const handleClick = () => {
    setFocusedNodeId(node.id);
    if (node.type === "collection") {
      openCollectionSettings(collectionId);
      toggleNode(node.id);
    } else if (isFolder) {
      toggleNode(node.id);
    } else {
      const requestId = node.id.replace(`${collectionId}/`, "");
      openRequest(collectionId, requestId);
    }
  };

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (node.type === "collection") {
        if (collectionIndex === undefined || !onCollectionReorder) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("collection-index", String(collectionIndex));
        e.dataTransfer.effectAllowed = "move";
        return;
      }
      e.stopPropagation();
      activeDrag = { sourceNode: node, collectionId };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", node.id);
      // Add a slight delay so the drag image renders
      const el = rowRef.current;
      if (el) {
        el.style.opacity = "0.5";
        requestAnimationFrame(() => {
          el.style.opacity = "";
        });
      }
    },
    [node, collectionId, collectionIndex, onCollectionReorder],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      // Handle collection-level reorder
      if (node.type === "collection" && e.dataTransfer.types.includes("collection-index")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = rowRef.current?.getBoundingClientRect();
        if (!rect) return;
        const y = e.clientY - rect.top;
        setDropIndicator(y < rect.height / 2 ? "before" : "after");
        return;
      }

      if (!activeDrag || activeDrag.sourceNode.id === node.id) return;
      // Don't allow dropping a node onto its own descendant
      if (node.id.startsWith(activeDrag.sourceNode.id + "/")) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const y = e.clientY - rect.top;
      const height = rect.height;

      if (isFolder && y > height * 0.25 && y < height * 0.75) {
        setDropIndicator("inside");
      } else if (y < height / 2) {
        setDropIndicator("before");
      } else {
        setDropIndicator("after");
      }
    },
    [node.id, node.type, isFolder],
  );

  const handleDragLeave = useCallback(() => {
    setDropIndicator(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropIndicator(null);

      // Handle collection-level reorder
      if (node.type === "collection" && e.dataTransfer.types.includes("collection-index")) {
        const fromIndex = parseInt(e.dataTransfer.getData("collection-index"), 10);
        if (isNaN(fromIndex) || collectionIndex === undefined || !onCollectionReorder) return;
        if (fromIndex === collectionIndex) return;
        const rect = rowRef.current?.getBoundingClientRect();
        if (!rect) return;
        const y = e.clientY - rect.top;
        const toIndex = y < rect.height / 2 ? collectionIndex : collectionIndex + 1;
        onCollectionReorder(fromIndex, toIndex > fromIndex ? toIndex - 1 : toIndex);
        return;
      }

      if (!activeDrag || activeDrag.sourceNode.id === node.id) return;
      if (activeDrag.collectionId !== collectionId) return; // cross-collection not supported

      const source = activeDrag.sourceNode;
      const sourceParent = getParentPath(source.id, collectionId);
      const targetParent = getParentPath(node.id, collectionId);
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const y = e.clientY - rect.top;
      const height = rect.height;

      // Determine drop position
      let dropPos: DropPosition;
      if (isFolder && y > height * 0.25 && y < height * 0.75) {
        dropPos = "inside";
      } else if (y < height / 2) {
        dropPos = "before";
      } else {
        dropPos = "after";
      }

      if (dropPos === "inside" && isFolder) {
        // Move item into this folder
        const destPath = node.type === "collection" ? "" : getRelativePath(node.id, collectionId);
        const sourcePath = getRelativePath(source.id, collectionId);

        if (sourceParent === destPath) return; // Already in this folder

        fetch(`/api/collections/${collectionId}/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move",
            sourcePath,
            destParentPath: destPath,
          }),
        }).then(() => {
          useAppStore.getState().fetchCollections();
        });
        return;
      }

      // Reorder within the same parent
      if (sourceParent !== targetParent) {
        // Moving between different parents — do a move + reorder
        const destParent = targetParent;
        const sourcePath = getRelativePath(source.id, collectionId);

        fetch(`/api/collections/${collectionId}/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move",
            sourcePath,
            destParentPath: destParent,
          }),
        }).then(() => {
          useAppStore.getState().fetchCollections();
        });
        return;
      }

      // Same parent — reorder
      const parent = node.type === "collection"
        ? node
        : findParentNode(
            useAppStore.getState().collections.find((c) => c.id === collectionId)?.tree,
            node.id,
          );

      if (!parent?.children) return;

      const children = parent.children.map((c) => getBaseName(c.id, collectionId));
      const sourceBaseName = getBaseName(source.id, collectionId);
      const targetBaseName = getBaseName(node.id, collectionId);

      // Remove source from list
      const filtered = children.filter((c) => c !== sourceBaseName);
      // Find target index
      const targetIdx = filtered.indexOf(targetBaseName);
      // Insert at correct position
      const insertIdx = dropPos === "before" ? targetIdx : targetIdx + 1;
      filtered.splice(insertIdx, 0, sourceBaseName);

      onReorder(collectionId, targetParent, filtered);
    },
    [node, collectionId, isFolder, onReorder, collectionIndex, onCollectionReorder],
  );

  const handleDragEnd = useCallback(() => {
    activeDrag = null;
    setDropIndicator(null);
  }, []);

  const indicatorClass =
    dropIndicator === "inside"
      ? "ring-1 ring-accent ring-inset bg-accent/10"
      : "";

  return (
    <div>
      <div
        ref={rowRef}
        data-node-id={node.id}
        onClick={handleClick}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        className={`relative flex items-center gap-1.5 px-2 py-1 cursor-pointer text-sm hover:bg-bg-hover transition-colors group ${
          isSelected || isCollectionSelected
            ? "bg-bg-hover text-text-primary"
            : "text-text-secondary"
        } ${isFocused ? "ring-1 ring-accent ring-inset" : ""} ${indicatorClass}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {dropIndicator === "before" && (
          <div className="absolute top-0 left-2 right-2 h-0.5 bg-accent rounded" />
        )}
        {dropIndicator === "after" && (
          <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded" />
        )}

        {isFolder && (
          <span className="text-text-muted text-[10px] w-3 flex-shrink-0">
            {isExpanded ? "▼" : "▶"}
          </span>
        )}
        {!isFolder && <span className="w-3 flex-shrink-0" />}

        {node.type === "request" && node.method && (
          <span
            className={`text-[10px] font-bold w-10 flex-shrink-0 ${METHOD_COLORS[node.method] || "text-text-muted"}`}
          >
            {node.method}
          </span>
        )}

        <span className="truncate flex-1">{node.name}</span>

        {node.type === "collection" && isMockRunning && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0"
            title="Mock server running"
          />
        )}
        {node.type === "collection" && isLinked && (
          <span
            className="text-[9px] text-accent/60 flex-shrink-0"
            title="Linked to local folder"
          >
            linked
          </span>
        )}
      </div>

      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              collectionId={collectionId}
              onReorder={onReorder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function findParentNode(
  root: TreeNode | undefined,
  childId: string,
): TreeNode | null {
  if (!root?.children) return null;
  for (const child of root.children) {
    if (child.id === childId) return root;
    if (child.children) {
      const found = findParentNode(child, childId);
      if (found) return found;
    }
  }
  return null;
}

export function CollectionTree({
  collection,
  index,
  onCollectionReorder,
}: {
  collection: Collection;
  index?: number;
  onCollectionReorder?: (fromIndex: number, toIndex: number) => void;
}) {
  const { mockServers, fetchCollections } = useAppStore();
  const isMockRunning = mockServers.some(
    (s) => s.collectionId === collection.id && s.running,
  );

  const handleReorder = useCallback(
    (collectionId: string, parentPath: string, children: string[]) => {
      fetch(`/api/collections/${collectionId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPath, children }),
      }).then(() => {
        fetchCollections();
      });
    },
    [fetchCollections],
  );

  return (
    <TreeNodeItem
      node={collection.tree}
      depth={0}
      collectionId={collection.id}
      isLinked={!!collection.linkedPath}
      isMockRunning={isMockRunning}
      onReorder={handleReorder}
      collectionIndex={index}
      onCollectionReorder={onCollectionReorder}
    />
  );
}
