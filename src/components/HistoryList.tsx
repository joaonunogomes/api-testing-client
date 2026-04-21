"use client";

import { useAppStore } from "@/stores/app-store";
import type { HistoryEntry } from "@/lib/types";

const methodColors: Record<string, string> = {
  GET: "text-green-400",
  POST: "text-yellow-400",
  PUT: "text-blue-400",
  PATCH: "text-orange-400",
  DELETE: "text-red-400",
  HEAD: "text-purple-400",
  OPTIONS: "text-teal-400",
};

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "text-green-400";
  if (status >= 300 && status < 400) return "text-blue-400";
  if (status >= 400 && status < 500) return "text-yellow-400";
  return "text-red-400";
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function groupByDate(entries: HistoryEntry[]): { label: string; entries: HistoryEntry[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  const groups: { label: string; entries: HistoryEntry[] }[] = [];
  let currentLabel = "";
  let currentGroup: HistoryEntry[] = [];

  for (const entry of entries) {
    let label: string;
    if (entry.timestamp >= today) {
      label = "Today";
    } else if (entry.timestamp >= yesterday) {
      label = "Yesterday";
    } else {
      label = new Date(entry.timestamp).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }

    if (label !== currentLabel) {
      if (currentGroup.length > 0) {
        groups.push({ label: currentLabel, entries: currentGroup });
      }
      currentLabel = label;
      currentGroup = [entry];
    } else {
      currentGroup.push(entry);
    }
  }

  if (currentGroup.length > 0) {
    groups.push({ label: currentLabel, entries: currentGroup });
  }

  return groups;
}

export function HistoryList() {
  const { history, openHistoryEntry, clearHistory } = useAppStore();

  if (history.length === 0) {
    return (
      <p className="text-text-muted text-xs px-3 py-4 text-center">
        No history yet
      </p>
    );
  }

  const groups = groupByDate(history);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto py-1">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-text-muted tracking-wider">
              {group.label}
            </div>
            {group.entries.map((entry) => {
              const displayUrl = entry.url.replace(/^https?:\/\//, "").slice(0, 50);
              return (
                <button
                  key={entry.id}
                  onClick={() => openHistoryEntry(entry)}
                  className="w-full text-left px-3 py-1.5 hover:bg-bg-hover transition-colors group"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-mono font-semibold text-[10px] w-10 shrink-0 ${methodColors[entry.method] || "text-text-muted"}`}>
                      {entry.method}
                    </span>
                    <span className={`text-[10px] font-mono ${statusColor(entry.status)}`}>
                      {entry.status}
                    </span>
                    <span className="text-text-muted text-[10px] ml-auto shrink-0">
                      {entry.time}ms
                    </span>
                  </div>
                  <div className="text-[11px] text-text-secondary truncate mt-0.5" title={entry.url}>
                    {displayUrl}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {formatTime(entry.timestamp)}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-border px-3 py-2">
        <button
          onClick={clearHistory}
          className="text-[10px] text-text-muted hover:text-red-400 transition-colors"
        >
          Clear history
        </button>
      </div>
    </div>
  );
}
