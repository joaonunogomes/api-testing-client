"use client";

import { useState, useRef, useCallback } from "react";
import { useAppStore } from "@/stores/app-store";

interface ImportResult {
  type: "collection" | "environment";
  id: string;
  name: string;
  requestCount?: number;
  variableCount?: number;
  warnings: string[];
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "postman" | "repo";

function PostmanImport({
  onDone,
}: {
  onDone: () => void;
}) {
  const { fetchCollections, fetchEnvironments } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setError(null);
      setResult(null);

      try {
        const text = await file.text();
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(text);
        } catch {
          setError("Invalid JSON file. Please export from Postman as JSON.");
          setIsImporting(false);
          return;
        }

        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Import failed");
          setIsImporting(false);
          return;
        }

        setResult(data);
        fetchCollections();
        fetchEnvironments();
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      } finally {
        setIsImporting(false);
      }
    },
    [fetchCollections, fetchEnvironments, onDone],
  );

  return (
    <div className="space-y-4">
      <div
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleImport(file);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-accent bg-accent/10"
            : "border-border hover:border-border-light"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
          }}
          className="hidden"
        />
        {isImporting ? (
          <div className="flex items-center justify-center gap-2 text-text-secondary">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span>Importing...</span>
          </div>
        ) : (
          <>
            <p className="text-text-secondary text-sm">
              Drop a Postman export JSON here, or click to browse
            </p>
            <p className="text-text-muted text-xs mt-2">
              Supports Collection v2.1 and Environment exports
            </p>
          </>
        )}
      </div>

      <div className="text-xs text-text-muted space-y-1.5 bg-bg-secondary rounded p-3">
        <p className="font-semibold text-text-secondary mb-1">
          How to export from Postman:
        </p>
        <p>
          <strong>Collection:</strong> Right-click collection &rarr; Export
          &rarr; Collection v2.1
        </p>
        <p>
          <strong>Environment:</strong> Environments tab &rarr; &quot;...&quot;
          &rarr; Export
        </p>
        <p className="mt-2 text-text-secondary">
          Scripts using <code className="text-accent">pm.*</code> are
          automatically converted to{" "}
          <code className="text-accent">ac.*</code>
        </p>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/30 rounded p-3 text-sm text-error">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-success/10 border border-success/30 rounded p-3 text-sm space-y-2">
          <p className="text-success font-medium">
            {result.type === "collection"
              ? `Collection "${result.name}" imported with ${result.requestCount} requests`
              : `Environment "${result.name}" imported with ${result.variableCount} variables`}
          </p>
          {result.warnings.length > 0 && (
            <div className="mt-2">
              <p className="text-warning text-xs font-medium mb-1">
                Warnings ({result.warnings.length}):
              </p>
              <ul className="text-xs text-text-muted space-y-0.5 max-h-32 overflow-y-auto">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex gap-1">
                    <span className="text-warning flex-shrink-0">-</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RepoImport({ onDone }: { onDone: () => void }) {
  const { fetchCollections } = useAppStore();
  const [folderPath, setFolderPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [success, setSuccess] = useState(false);

  const deriveNameFromPath = (p: string) => {
    const parts = p.replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] || "";
  };

  const handleLink = async () => {
    if (!folderPath.trim()) return;
    setIsLinking(true);
    setError(null);

    const id = (name || deriveNameFromPath(folderPath))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, path: folderPath.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await fetchCollections();
      setSuccess(true);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link folder");
    }
    setIsLinking(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Point to a local git repo (or any folder) that contains YAML request
        files. You manage git yourself — the app reads and writes files there.
      </p>

      <div>
        <label className="block text-xs text-text-muted mb-1">
          Folder Path
        </label>
        <input
          type="text"
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder="/Users/you/repos/my-api-collection"
          className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent font-mono"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs text-text-muted mb-1">
          Collection Name
          <span className="text-text-muted/50 ml-1">
            (optional — derived from folder name)
          </span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={deriveNameFromPath(folderPath) || "my-collection"}
          className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        />
      </div>

      <button
        onClick={handleLink}
        disabled={!folderPath.trim() || isLinking}
        className="bg-accent text-bg-primary px-4 py-1.5 rounded text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
      >
        {isLinking ? "Linking..." : "Link Folder"}
      </button>

      {error && (
        <div className="bg-error/10 border border-error/30 rounded p-2 text-xs text-error">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success/30 rounded p-2 text-xs text-success">
          Collection linked successfully.
        </div>
      )}
    </div>
  );
}

export function ImportDialog({ open, onClose }: ImportDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>("postman");

  if (!open) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "postman", label: "From Postman" },
    { id: "repo", label: "From Local Repo" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-primary border border-border rounded-lg w-[520px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Import</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-lg leading-none px-1"
          >
            x
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm transition-colors relative ${
                activeTab === tab.id
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === "postman" && <PostmanImport onDone={() => {}} />}
          {activeTab === "repo" && <RepoImport onDone={() => {}} />}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary border border-border rounded hover:border-border-light transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
