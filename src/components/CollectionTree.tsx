"use client";

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

function TreeNodeItem({
  node,
  depth,
  collectionId,
  isLinked,
  isMockRunning,
}: {
  node: TreeNode;
  depth: number;
  collectionId: string;
  isLinked?: boolean;
  isMockRunning?: boolean;
}) {
  const {
    expandedNodes,
    toggleNode,
    openRequest,
    openCollectionSettings,
    activeTabId,
  } = useAppStore();

  const isExpanded = expandedNodes.has(node.id);
  const isFolder = node.type === "collection" || node.type === "folder";
  const isSelected =
    node.type === "request" && activeTabId === node.id;
  const isCollectionSelected =
    node.type === "collection" && activeTabId === `__collection__${collectionId}`;

  const handleClick = () => {
    if (node.type === "collection") {
      openCollectionSettings(collectionId);
      // Also expand/collapse the tree
      toggleNode(node.id);
    } else if (isFolder) {
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
          isSelected || isCollectionSelected ? "bg-bg-hover text-text-primary" : "text-text-secondary"
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CollectionTree({ collection }: { collection: Collection }) {
  const { mockServers } = useAppStore();
  const isMockRunning = mockServers.some(
    (s) => s.collectionId === collection.id && s.running,
  );

  return (
    <TreeNodeItem
      node={collection.tree}
      depth={0}
      collectionId={collection.id}
      isLinked={!!collection.linkedPath}
      isMockRunning={isMockRunning}
    />
  );
}
