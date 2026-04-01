"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/stores/app-store";
import { useConfirm } from "./ConfirmDialog";
import type { Environment } from "@/lib/types";

interface EnvVar {
  key: string;
  value: string;
  isSecret: boolean;
}

interface EnvironmentEditorProps {
  open: boolean;
  onClose: () => void;
}

export function EnvironmentEditor({ open, onClose }: EnvironmentEditorProps) {
  const {
    environments,
    selectedEnvironmentId,
    fetchEnvironments,
    setSelectedEnvironmentId,
  } = useAppStore();
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [envName, setEnvName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newEnvName, setNewEnvName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isLinkingToRepo, setIsLinkingToRepo] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const loadEnvironment = useCallback((env: Environment) => {
    setEditingEnvId(env.id);
    setEnvName(env.meta.name);

    const allVars: EnvVar[] = [];
    for (const [key, value] of Object.entries(env.variables)) {
      allVars.push({ key, value, isSecret: false });
    }
    for (const [key, value] of Object.entries(env.secrets)) {
      allVars.push({ key, value, isSecret: true });
    }
    setVars(allVars);
  }, []);

  // Load selected environment when dialog opens
  useEffect(() => {
    if (open && selectedEnvironmentId) {
      const env = environments.find((e) => e.id === selectedEnvironmentId);
      if (env) loadEnvironment(env);
    } else if (open && environments.length > 0) {
      loadEnvironment(environments[0]);
    }
  }, [open, selectedEnvironmentId, environments, loadEnvironment]);

  const confirmAction = useConfirm();
  const editingEnv = environments.find((e) => e.id === editingEnvId);

  if (!open) return null;

  const updateVar = (index: number, field: keyof EnvVar, val: string | boolean) => {
    const updated = [...vars];
    updated[index] = { ...updated[index], [field]: val };
    setVars(updated);
  };

  const removeVar = (index: number) => {
    setVars(vars.filter((_, i) => i !== index));
  };

  const addVar = () => {
    setVars([...vars, { key: "", value: "", isSecret: false }]);
  };

  const handleSave = async () => {
    if (!editingEnvId) return;
    setIsSaving(true);

    const variables: Record<string, string> = {};
    const secrets: Record<string, string> = {};

    for (const v of vars) {
      if (!v.key) continue;
      if (v.isSecret) {
        secrets[v.key] = v.value;
      } else {
        variables[v.key] = v.value;
      }
    }

    await fetch(`/api/environments/${editingEnvId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta: { name: envName },
        variables,
        secrets,
      }),
    });

    await fetchEnvironments();
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!editingEnvId) return;
    const ok = await confirmAction({
      title: editingEnv?.linkedPath ? "Unlink Environment" : "Delete Environment",
      message: editingEnv?.linkedPath
        ? `This will unlink "${envName}". The files in "${editingEnv.linkedPath}" will not be deleted.`
        : `Are you sure you want to delete "${envName}"? This cannot be undone.`,
      confirmLabel: editingEnv?.linkedPath ? "Unlink" : "Delete",
      variant: "danger",
    });
    if (!ok) return;

    await fetch(`/api/environments/${editingEnvId}`, { method: "DELETE" });

    if (selectedEnvironmentId === editingEnvId) {
      setSelectedEnvironmentId(null);
    }

    await fetchEnvironments();
    setEditingEnvId(null);
    setVars([]);
    setEnvName("");
  };

  const handleLinkToRepo = async () => {
    if (!repoPath.trim() || !editingEnvId) return;
    const ok = await confirmAction({
      title: "Link to Local Repo",
      message: `This will copy the environment files for "${envName}" into "${repoPath}" and use that folder as the source of truth from now on. The original local copies will be removed.`,
      confirmLabel: "Copy & Link",
    });
    if (!ok) return;

    setIsLinkingToRepo(true);
    setLinkError(null);

    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEnvId,
          path: repoPath.trim(),
          copyFrom: editingEnvId,
          type: "environment",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchEnvironments();
      setRepoPath("");
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Link failed");
    }
    setIsLinkingToRepo(false);
  };

  const handleUnlinkEnv = async () => {
    if (!editingEnvId || !editingEnv?.linkedPath) return;
    const ok = await confirmAction({
      title: "Unlink Environment",
      message: `Stop using "${editingEnv.linkedPath}" as the source? The files will remain in that folder but the environment will no longer appear in the app.`,
      confirmLabel: "Unlink",
      variant: "danger",
    });
    if (!ok) return;

    setUnlinking(true);
    try {
      await fetch("/api/links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingEnvId, type: "environment" }),
      });
      await fetchEnvironments();
      setEditingEnvId(null);
      setVars([]);
      setEnvName("");
    } catch {
      // ignore
    }
    setUnlinking(false);
  };

  const handleCreate = async () => {
    if (!newEnvName.trim()) return;

    const res = await fetch("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newEnvName.trim() }),
    });

    const env = await res.json();
    await fetchEnvironments();
    setIsCreating(false);
    setNewEnvName("");
    loadEnvironment(env);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-primary border border-border rounded-lg w-[700px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-text-primary">
            Environments
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-lg leading-none px-1"
          >
            x
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Environment list */}
          <div className="w-48 border-r border-border flex flex-col flex-shrink-0">
            <div className="flex-1 overflow-y-auto">
              {environments.map((env) => (
                <button
                  key={env.id}
                  onClick={() => loadEnvironment(env)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    editingEnvId === env.id
                      ? "bg-bg-hover text-text-primary"
                      : "text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {env.meta.name}
                    {env.linkedPath && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-accent/15 text-accent leading-none">
                        linked
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="p-2 border-t border-border">
              {isCreating ? (
                <input
                  type="text"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setIsCreating(false);
                  }}
                  placeholder="Name..."
                  autoFocus
                  className="w-full bg-bg-primary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                />
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full text-xs text-text-muted hover:text-accent transition-colors py-1"
                >
                  + New Environment
                </button>
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {editingEnvId ? (
              <>
                {/* Env name */}
                <div className="px-4 py-3 border-b border-border flex-shrink-0">
                  <input
                    type="text"
                    value={envName}
                    onChange={(e) => setEnvName(e.target.value)}
                    className="bg-transparent text-text-primary text-sm font-medium outline-none border-b border-transparent focus:border-accent w-full"
                  />
                </div>

                {/* Storage section */}
                <div className="px-4 py-3 border-b border-border flex-shrink-0 space-y-2">
                  {editingEnv?.linkedPath ? (
                    <div className="bg-bg-tertiary border border-border rounded p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                          linked
                        </span>
                        <span className="text-xs text-text-secondary">
                          Reading/writing files from:
                        </span>
                      </div>
                      <code className="block text-xs text-text-primary font-mono bg-bg-primary rounded px-2 py-1.5 break-all">
                        {editingEnv.linkedPath}
                      </code>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-text-muted">
                          This folder is the source of truth. Manage version
                          control (git) yourself outside the app.
                        </p>
                        <button
                          onClick={handleUnlinkEnv}
                          disabled={unlinking}
                          className="text-xs text-error/70 hover:text-error transition-colors whitespace-nowrap ml-2"
                        >
                          {unlinking ? "Unlinking..." : "Unlink"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-bg-tertiary border border-border rounded p-3 space-y-2">
                      <p className="text-xs text-text-muted">
                        Stored locally. Link to a folder (e.g. a git repo)
                        to make it the source of truth.
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={repoPath}
                          onChange={(e) => setRepoPath(e.target.value)}
                          placeholder="/path/to/git/repo"
                          className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent font-mono"
                        />
                        <button
                          onClick={handleLinkToRepo}
                          disabled={!repoPath.trim() || isLinkingToRepo}
                          className="bg-accent text-bg-primary px-3 py-1 rounded text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {isLinkingToRepo ? "Linking..." : "Copy & Link"}
                        </button>
                      </div>
                      {linkError && (
                        <div className="bg-error/10 border border-error/30 rounded p-1.5 text-xs text-error">
                          {linkError}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Variables table */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="text-sm">
                    <div className="grid grid-cols-[1fr_1fr_60px_30px] gap-0 border border-border rounded overflow-hidden">
                      {/* Header */}
                      <div className="bg-bg-tertiary px-2 py-1.5 text-text-muted text-xs font-medium border-b border-border">
                        Variable
                      </div>
                      <div className="bg-bg-tertiary px-2 py-1.5 text-text-muted text-xs font-medium border-b border-l border-border">
                        Value
                      </div>
                      <div className="bg-bg-tertiary px-2 py-1.5 text-text-muted text-xs font-medium border-b border-l border-border text-center">
                        Secret
                      </div>
                      <div className="bg-bg-tertiary border-b border-l border-border" />

                      {/* Rows */}
                      {vars.map((v, i) => (
                        <div key={i} className="contents group">
                          <input
                            type="text"
                            value={v.key}
                            onChange={(e) => updateVar(i, "key", e.target.value)}
                            placeholder="key"
                            className="bg-transparent px-2 py-1.5 outline-none border-b border-border text-text-primary"
                          />
                          <input
                            type={v.isSecret ? "password" : "text"}
                            value={v.value}
                            onChange={(e) =>
                              updateVar(i, "value", e.target.value)
                            }
                            placeholder="value"
                            className="bg-transparent px-2 py-1.5 outline-none border-b border-l border-border text-text-primary font-mono"
                          />
                          <div className="flex items-center justify-center border-b border-l border-border">
                            <input
                              type="checkbox"
                              checked={v.isSecret}
                              onChange={(e) =>
                                updateVar(i, "isSecret", e.target.checked)
                              }
                              className="accent-accent"
                            />
                          </div>
                          <button
                            onClick={() => removeVar(i)}
                            className="border-b border-l border-border text-text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity text-center"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={addVar}
                      className="mt-2 text-xs text-text-muted hover:text-accent transition-colors"
                    >
                      + Add Variable
                    </button>
                  </div>

                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0">
                  <button
                    onClick={handleDelete}
                    className="text-xs text-error/70 hover:text-error transition-colors"
                  >
                    Delete Environment
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-accent text-bg-primary px-4 py-1.5 rounded text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
                Select an environment to edit
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
