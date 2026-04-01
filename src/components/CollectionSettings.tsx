"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/stores/app-store";
import { KeyValueEditor } from "./KeyValueEditor";
import { AuthEditor } from "./AuthEditor";
import { ScriptCodeEditor } from "./ScriptCodeEditor";
import { useConfirm } from "./ConfirmDialog";
import type { AuthConfig, Collection } from "@/lib/types";

type Tab = "variables" | "defaults" | "auth" | "scripts" | "storage";

interface CollectionFormState {
  name: string;
  description: string;
  variables: { key: string; value: string; enabled: boolean }[];
  defaultHeaders: { key: string; value: string; enabled: boolean }[];
  auth: AuthConfig | undefined;
  preRequestScript: string;
  postResponseScript: string;
}

export function CollectionSettings({ collectionId }: { collectionId: string }) {
  const { collections, fetchCollections, closeTab } = useAppStore();
  const collection = collections.find((c) => c.id === collectionId);
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<Tab>("variables");
  const [isSaving, setIsSaving] = useState(false);
  const [repoPath, setRepoPath] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isLinkingToRepo, setIsLinkingToRepo] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [form, setForm] = useState<CollectionFormState>({
    name: "",
    description: "",
    variables: [],
    defaultHeaders: [],
    auth: undefined,
    preRequestScript: "",
    postResponseScript: "",
  });

  const loadFromCollection = useCallback((col: Collection) => {
    setForm({
      name: col.meta.name,
      description: col.meta.description || "",
      variables: Object.entries(col.variables || {}).map(([key, value]) => ({
        key,
        value,
        enabled: true,
      })),
      defaultHeaders: Object.entries(col.defaults?.headers || {}).map(
        ([key, value]) => ({ key, value, enabled: true }),
      ),
      auth: col.defaults?.auth,
      preRequestScript: col.scripts?.["pre-request"] || "",
      postResponseScript: col.scripts?.["post-response"] || "",
    });
  }, []);

  useEffect(() => {
    if (collection) loadFromCollection(collection);
  }, [collection, loadFromCollection]);

  if (!collection) return null;

  const handleSave = async () => {
    setIsSaving(true);

    const variables: Record<string, string> = {};
    for (const v of form.variables) {
      if (v.enabled && v.key) variables[v.key] = v.value;
    }

    const headers: Record<string, string> = {};
    for (const h of form.defaultHeaders) {
      if (h.enabled && h.key) headers[h.key] = h.value;
    }

    const collectionData = {
      meta: {
        name: form.name,
        version: collection.meta.version || 1,
        ...(form.description ? { description: form.description } : {}),
      },
      ...(Object.keys(variables).length > 0 ? { variables } : {}),
      defaults: {
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(form.auth ? { auth: form.auth } : {}),
      },
      ...(form.preRequestScript || form.postResponseScript
        ? {
            scripts: {
              ...(form.preRequestScript
                ? { "pre-request": form.preRequestScript }
                : {}),
              ...(form.postResponseScript
                ? { "post-response": form.postResponseScript }
                : {}),
            },
          }
        : {}),
    };

    await fetch(`/api/collections/${collection.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectionData),
    });

    await fetchCollections();
    setIsSaving(false);
  };

  const handleLinkToRepo = async () => {
    if (!repoPath.trim()) return;

    const ok = await confirm({
      title: "Link to Local Repo",
      message: `This will copy all files from "${collection.meta.name}" into "${repoPath}" and use that folder as the source of truth from now on. The original local copy will be removed.`,
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
          id: collection.id,
          path: repoPath.trim(),
          copyFrom: collection.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchCollections();
      setRepoPath("");
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Link failed");
    }
    setIsLinkingToRepo(false);
  };

  const handleUnlink = async () => {
    const ok = await confirm({
      title: "Unlink Collection",
      message: `Stop using "${collection.linkedPath}" as the source? The files will remain in that folder but the collection will no longer appear in the app.`,
      confirmLabel: "Unlink",
      variant: "danger",
    });
    if (!ok) return;

    setUnlinking(true);
    try {
      await fetch("/api/links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: collection.id }),
      });
      await fetchCollections();
      closeTab(`__collection__${collection.id}`);
    } catch {
      // ignore
    }
    setUnlinking(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete Collection",
      message: collection.linkedPath
        ? `This will unlink "${collection.meta.name}". The files in "${collection.linkedPath}" will not be deleted.`
        : `Are you sure you want to delete "${collection.meta.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await fetch(`/api/collections/${collection.id}`, { method: "DELETE" });
    await fetchCollections();
    closeTab(`__collection__${collection.id}`);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "variables", label: "Variables" },
    { id: "defaults", label: "Default Headers" },
    { id: "auth", label: "Auth" },
    { id: "scripts", label: "Scripts" },
    { id: "storage", label: "Storage" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div className="flex-1 mr-4">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-transparent text-text-primary text-base font-semibold outline-none border-b border-transparent focus:border-accent w-full"
          />
          <input
            type="text"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="Description (optional)"
            className="bg-transparent text-text-muted text-xs outline-none border-b border-transparent focus:border-accent w-full mt-1"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0">
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "variables" && (
          <KeyValueEditor
            pairs={form.variables}
            onChange={(pairs) =>
              setForm({
                ...form,
                variables: pairs.map((p) => ({
                  ...p,
                  enabled: p.enabled !== false,
                })),
              })
            }
            keyPlaceholder="Variable"
            valuePlaceholder="Value"
            collectionId={collectionId}
          />
        )}

        {activeTab === "defaults" && (
          <KeyValueEditor
            pairs={form.defaultHeaders}
            onChange={(pairs) =>
              setForm({
                ...form,
                defaultHeaders: pairs.map((p) => ({
                  ...p,
                  enabled: p.enabled !== false,
                })),
              })
            }
            collectionId={collectionId}
          />
        )}

        {activeTab === "auth" && (
          <AuthEditor
            auth={form.auth}
            collectionAuth={undefined}
            onChange={(auth) => setForm({ ...form, auth })}
          />
        )}

        {activeTab === "scripts" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">
                Collection Pre-request Script
              </label>
              <ScriptCodeEditor
                value={form.preRequestScript}
                onChange={(val) =>
                  setForm({ ...form, preRequestScript: val })
                }
                placeholder="// Runs before every request in this collection"
                isPostResponse={false}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">
                Collection Post-response Script
              </label>
              <ScriptCodeEditor
                value={form.postResponseScript}
                onChange={(val) =>
                  setForm({ ...form, postResponseScript: val })
                }
                placeholder="// Runs after every response in this collection"
                isPostResponse={true}
              />
            </div>
          </div>
        )}

        {activeTab === "storage" && (
          <div className="space-y-4">
            {collection.linkedPath ? (
              <>
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
                    {collection.linkedPath}
                  </code>
                  <p className="text-[10px] text-text-muted">
                    This folder is the source of truth. Manage version
                    control (git) yourself outside the app.
                  </p>
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="text-xs text-error/70 hover:text-error transition-colors"
                >
                  {unlinking ? "Unlinking..." : "Unlink this collection"}
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-text-muted">
                  This collection is stored locally in the workspace. Link
                  it to a local folder (e.g. a git repo) to make that
                  folder the source of truth. All files will be copied
                  there.
                </p>

                <div>
                  <label className="block text-xs text-text-muted mb-1">
                    Local Folder Path
                  </label>
                  <input
                    type="text"
                    value={repoPath}
                    onChange={(e) => setRepoPath(e.target.value)}
                    placeholder="/Users/you/repos/my-api-collection"
                    className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent font-mono"
                  />
                  <p className="text-[10px] text-text-muted mt-1">
                    The folder should already exist (e.g. a cloned git
                    repo). Files will be copied into it.
                  </p>
                </div>

                <button
                  onClick={handleLinkToRepo}
                  disabled={!repoPath.trim() || isLinkingToRepo}
                  className="bg-accent text-bg-primary px-4 py-1.5 rounded text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {isLinkingToRepo
                    ? "Copying & Linking..."
                    : "Copy Files & Link"}
                </button>

                {linkError && (
                  <div className="bg-error/10 border border-error/30 rounded p-2 text-xs text-error">
                    {linkError}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border flex-shrink-0">
        <button
          onClick={handleDelete}
          className="text-xs text-error/70 hover:text-error transition-colors"
        >
          Delete Collection
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-accent text-bg-primary px-4 py-1.5 rounded text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
