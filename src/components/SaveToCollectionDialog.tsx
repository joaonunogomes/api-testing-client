"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import type { RequestFile } from "@/lib/types";

interface SaveToCollectionDialogProps {
  open: boolean;
  onClose: () => void;
  request: RequestFile;
  tabId: string;
}

export function SaveToCollectionDialog({
  open,
  onClose,
  request,
  tabId,
}: SaveToCollectionDialogProps) {
  const { collections, fetchCollections } = useAppStore();
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [requestName, setRequestName] = useState(request.meta.name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"existing" | "new">(
    collections.length > 0 ? "existing" : "new",
  );

  if (!open) return null;

  const handleSave = async () => {
    if (!requestName.trim()) return;
    setIsSaving(true);
    setError(null);

    try {
      let collectionId = selectedCollectionId;

      // Create new collection if needed
      if (mode === "new") {
        if (!newCollectionName.trim()) return;
        const res = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCollectionName.trim() }),
        });
        if (!res.ok) throw new Error("Failed to create collection");
        const col = await res.json();
        collectionId = col.id;
      }

      if (!collectionId) {
        setError("Please select a collection");
        setIsSaving(false);
        return;
      }

      // Build the request ID from the name
      const requestId = requestName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Save the request with the updated name
      const requestToSave: RequestFile = {
        ...request,
        meta: { ...request.meta, name: requestName.trim() },
      };

      const res = await fetch(
        `/api/collections/${collectionId}/requests/${requestId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestToSave),
        },
      );
      if (!res.ok) throw new Error("Failed to save request");

      await fetchCollections();

      // Replace the temporary tab with the saved one
      const newTabId = `${collectionId}/${requestId}`;
      useAppStore.setState((s) => ({
        openTabs: s.openTabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                id: newTabId,
                collectionId,
                requestId,
                label: requestName.trim(),
                isDirty: false,
              }
            : t,
        ),
        activeTabId: s.activeTabId === tabId ? newTabId : s.activeTabId,
      }));

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
    setIsSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-primary border border-border rounded-lg w-[420px] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">
            Save to Collection
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-lg leading-none px-1"
          >
            x
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Request name */}
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Request Name
            </label>
            <input
              type="text"
              value={requestName}
              onChange={(e) => setRequestName(e.target.value)}
              placeholder="My Request"
              autoFocus
              className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>

          {/* Collection selection */}
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Collection
            </label>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setMode("existing")}
                disabled={collections.length === 0}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  mode === "existing"
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border text-text-muted hover:text-text-secondary"
                } ${collections.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Existing
              </button>
              <button
                onClick={() => setMode("new")}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  mode === "new"
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border text-text-muted hover:text-text-secondary"
                }`}
              >
                New Collection
              </button>
            </div>

            {mode === "existing" ? (
              <select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="">Select a collection...</option>
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.meta.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="New Collection Name"
                className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            )}
          </div>

          {error && (
            <div className="bg-error/10 border border-error/30 rounded p-2 text-xs text-error">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary border border-border rounded hover:border-border-light transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              isSaving ||
              !requestName.trim() ||
              (mode === "existing" && !selectedCollectionId) ||
              (mode === "new" && !newCollectionName.trim())
            }
            className="bg-accent text-bg-primary px-4 py-1.5 rounded text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
