"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { CollectionEditor } from "./CollectionEditor";
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

function TreeNodeItem({
  node,
  depth,
  collectionId,
  isLinked,
  onEditCollection,
}: {
  node: TreeNode;
  depth: number;
  collectionId: string;
  isLinked?: boolean;
  onEditCollection?: () => void;
  onGitOpen?: () => void;
}) {
  const {
    expandedNodes,
    toggleNode,
    openRequest,
    activeTabId,
  } = useAppStore();

  const isExpanded = expandedNodes.has(node.id);
  const isFolder = node.type === "collection" || node.type === "folder";
  const isSelected =
    node.type === "request" && activeTabId === node.id;

  const handleClick = () => {
    if (isFolder) {
      toggleNode(node.id);
    } else {
      const requestId = node.id.replace(`${collectionId}/`, "");
      openRequest(collectionId, requestId);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-sm hover:bg-bg-hover transition-colors group ${
          isSelected ? "bg-bg-hover text-text-primary" : "text-text-secondary"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
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

        {node.type === "collection" && isLinked && (
          <span
            className="text-[9px] text-accent/60 flex-shrink-0"
            title="Linked to local folder"
          >
            linked
          </span>
        )}

        {node.type === "collection" && onEditCollection && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditCollection();
            }}
            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent transition-all px-0.5 flex-shrink-0"
            title="Settings"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CollectionTree({ collection }: { collection: Collection }) {
  const [showEditor, setShowEditor] = useState(false);

  return (
    <>
      <TreeNodeItem
        node={collection.tree}
        depth={0}
        collectionId={collection.id}
        isLinked={!!collection.linkedPath}
        onEditCollection={() => setShowEditor(true)}
      />
      <CollectionEditor
        collection={collection}
        open={showEditor}
        onClose={() => setShowEditor(false)}
      />
    </>
  );
}
