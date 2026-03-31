"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { KeyValueEditor } from "./KeyValueEditor";
import { BodyEditor } from "./BodyEditor";
import { AuthEditor } from "./AuthEditor";
import { ScriptsEditor } from "./ScriptsEditor";
import { VariableInput } from "./VariableHighlight";
import type { RequestFile } from "@/lib/types";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

const METHOD_COLORS: Record<string, string> = {
  GET: "text-method-get",
  POST: "text-method-post",
  PUT: "text-method-put",
  PATCH: "text-method-patch",
  DELETE: "text-method-delete",
  OPTIONS: "text-method-options",
  HEAD: "text-method-head",
};

type Tab = "params" | "headers" | "body" | "auth" | "scripts";

export function RequestEditor() {
  const {
    openTabs,
    activeTabId,
    collections,
    updateTabRequest,
    executeTab,
    saveTab,
  } = useAppStore();

  const [activeEditorTab, setActiveEditorTab] = useState<Tab>("params");

  const tab = openTabs.find((t) => t.id === activeTabId);

  // Open an example tab when nothing is open
  useEffect(() => {
    if (openTabs.length === 0) {
      const { openTabs: tabs } = useAppStore.getState();
      if (tabs.length === 0) {
        useAppStore.setState({
          openTabs: [
            {
              id: "__example__",
              collectionId: "",
              requestId: "",
              label: "Example Request",
              method: "GET",
              request: {
                meta: { name: "Example Request" },
                request: {
                  method: "GET",
                  url: "https://httpbin.org/get",
                },
              },
              response: null,
              isExecuting: false,
              isDirty: false,
            },
          ],
          activeTabId: "__example__",
        });
      }
    }
  }, [openTabs.length]);

  if (!tab || !tab.request) {
    return null;
  }

  const localRequest = tab.request;
  const collection = collections.find((c) => c.id === tab.collectionId);

  const updateRequest = (updates: Partial<RequestFile>) => {
    const updated = { ...localRequest, ...updates };
    updateTabRequest(tab.id, updated);
  };

  const updateRequestDef = (
    updates: Partial<RequestFile["request"]>,
  ) => {
    updateRequest({
      request: { ...localRequest.request, ...updates },
    });
  };

  const handleSave = () => saveTab(tab.id);
  const handleSend = () => executeTab(tab.id);

  const paramPairs = Object.entries(localRequest.request.params || {}).map(
    ([key, value]) => ({ key, value, enabled: true }),
  );
  const headerPairs = Object.entries(localRequest.request.headers || {}).map(
    ([key, value]) => ({ key, value, enabled: true }),
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "params", label: "Params", count: paramPairs.length },
    { id: "headers", label: "Headers", count: headerPairs.length },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
    { id: "scripts", label: "Scripts" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* URL Bar */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <select
          value={localRequest.request.method}
          onChange={(e) => updateRequestDef({ method: e.target.value })}
          className={`bg-bg-secondary border border-border rounded px-2 py-2 text-sm font-bold outline-none focus:border-accent w-28 ${METHOD_COLORS[localRequest.request.method] || ""}`}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <VariableInput
          value={localRequest.request.url}
          onChange={(v) => updateRequestDef({ url: v })}
          placeholder="https://api.example.com/endpoint"
          collectionId={tab.collectionId}
          wrapperClassName="flex-1"
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSend();
            }
          }}
        />

        <button
          onClick={handleSend}
          disabled={tab.isExecuting}
          className="bg-accent text-bg-primary px-5 py-2 rounded text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {tab.isExecuting ? "Sending..." : "Send"}
        </button>

        <button
          onClick={handleSave}
          className="text-text-muted hover:text-text-primary px-3 py-2 text-sm border border-border rounded hover:border-border-light transition-colors"
          title="Save (without sending)"
        >
          Save
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveEditorTab(t.id)}
            className={`px-4 py-2 text-sm transition-colors relative ${
              activeEditorTab === t.id
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 text-xs text-accent">({t.count})</span>
            )}
            {activeEditorTab === t.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeEditorTab === "params" && (
          <KeyValueEditor
            pairs={paramPairs}
            onChange={(pairs) => {
              const params: Record<string, string> = {};
              pairs
                .filter((p) => p.enabled !== false && p.key)
                .forEach((p) => {
                  params[p.key] = p.value;
                });
              updateRequestDef({ params });
            }}
            collectionId={tab.collectionId}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
          />
        )}

        {activeEditorTab === "headers" && (
          <KeyValueEditor
            pairs={headerPairs}
            onChange={(pairs) => {
              const headers: Record<string, string> = {};
              pairs
                .filter((p) => p.enabled !== false && p.key)
                .forEach((p) => {
                  headers[p.key] = p.value;
                });
              updateRequestDef({ headers });
            }}
            collectionId={tab.collectionId}
          />
        )}

        {activeEditorTab === "body" && (
          <BodyEditor
            body={localRequest.request.body}
            onChange={(body) => updateRequestDef({ body })}
          />
        )}

        {activeEditorTab === "auth" && (
          <AuthEditor
            auth={localRequest.request.auth}
            collectionAuth={collection?.defaults?.auth}
            onChange={(auth) => updateRequestDef({ auth })}
          />
        )}

        {activeEditorTab === "scripts" && (
          <ScriptsEditor
            scripts={localRequest.scripts}
            onChange={(scripts) => updateRequest({ scripts })}
          />
        )}
      </div>
    </div>
  );
}

