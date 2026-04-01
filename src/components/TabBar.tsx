"use client";

import { useCallback } from "react";
import { useAppStore, type OpenTab } from "@/stores/app-store";
import { useConfirm } from "./ConfirmDialog";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-method-get",
  POST: "text-method-post",
  PUT: "text-method-put",
  PATCH: "text-method-patch",
  DELETE: "text-method-delete",
  OPTIONS: "text-method-options",
  HEAD: "text-method-head",
};

function Tab({ tab, isActive }: { tab: OpenTab; isActive: boolean }) {
  const { setActiveTab, closeTab } = useAppStore();
  const confirm = useConfirm();

  const handleClose = useCallback(async () => {
    if (tab.isDirty) {
      const ok = await confirm({
        title: "Unsaved Changes",
        message: `"${tab.label}" has unsaved changes that will be lost.`,
        confirmLabel: "Close Anyway",
        variant: "danger",
      });
      if (!ok) return;
    }
    closeTab(tab.id);
  }, [tab.id, tab.isDirty, tab.label, closeTab, confirm]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      handleClose();
    }
  };

  return (
    <div
      onClick={() => setActiveTab(tab.id)}
      onMouseDown={handleMouseDown}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-border select-none group transition-colors min-w-0 max-w-48 ${
        isActive
          ? "bg-bg-primary text-text-primary"
          : "bg-bg-tertiary text-text-muted hover:bg-bg-secondary hover:text-text-secondary"
      }`}
    >
      <span
        className={`text-[9px] font-bold flex-shrink-0 ${METHOD_COLORS[tab.method] || "text-text-muted"}`}
      >
        {tab.method}
      </span>
      <span className="truncate">{tab.label}</span>
      {tab.isDirty && !tab.isExecuting && (
        <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
      )}
      {tab.isExecuting && (
        <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 hover:text-error transition-all text-[10px] leading-none w-4 h-4 flex items-center justify-center rounded hover:bg-bg-hover"
      >
        x
      </button>
    </div>
  );
}

export function TabBar() {
  const { openTabs, activeTabId, openNewTab } = useAppStore();

  if (openTabs.length === 0) return null;

  return (
    <div className="flex bg-bg-tertiary border-b border-border overflow-x-auto">
      {openTabs.map((tab) => (
        <Tab key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
      ))}
      <button
        onClick={openNewTab}
        className="flex items-center justify-center w-8 h-8 my-auto text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors rounded flex-shrink-0 mx-1 text-sm"
        title="New Request"
      >
        +
      </button>
    </div>
  );
}
