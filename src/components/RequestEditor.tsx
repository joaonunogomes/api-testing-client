"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { KeyValueEditor } from "./KeyValueEditor";
import { BodyEditor } from "./BodyEditor";
import { AuthEditor } from "./AuthEditor";
import { ScriptsEditor } from "./ScriptsEditor";
import { VariableInput } from "./VariableHighlight";
import { SaveToCollectionDialog } from "./SaveToCollectionDialog";
import type { RequestFile, KeyValuePair } from "@/lib/types";
import { normalizeKVPairs } from "@/lib/types";
import { parseCurl } from "@/lib/curl-parser";
import { Select } from "./Select";
import { MocksEditor } from "./MocksEditor";

/** Split a URL string at the first '?' into [baseUrl, queryString]. */
function splitUrlAtQuery(url: string): [string, string] {
  const idx = url.indexOf("?");
  if (idx === -1) return [url, ""];
  return [url.substring(0, idx), url.substring(idx + 1)];
}

/** Parse a raw query string into KeyValuePair[]. */
function parseQueryString(qs: string): KeyValuePair[] {
  if (!qs) return [];
  return qs.split("&").map((part) => {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) return { key: part, value: "", enabled: true };
    return {
      key: part.substring(0, eqIdx),
      value: part.substring(eqIdx + 1),
      enabled: true,
    };
  });
}

/** Build a query string from enabled params (no encoding — preserves variables). */
function buildQueryString(params: KeyValuePair[]): string {
  return params
    .filter((p) => p.enabled !== false && p.key)
    .map((p) => `${p.key}=${p.value}`)
    .join("&");
}

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

type Tab = "params" | "headers" | "body" | "auth" | "scripts" | "mocks";

export function RequestEditor() {
  const {
    openTabs,
    activeTabId,
    collections,
    updateTabRequest,
    executeTab,
    cancelTab,
    saveTab,
  } = useAppStore();

  const [activeEditorTab, setActiveEditorTab] = useState<Tab>("params");
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const tab = openTabs.find((t) => t.id === activeTabId);
  const localRequest = tab?.request ?? null;
  const tabId = tab?.id ?? "";

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

  // On first load, if the stored URL contains query params, extract them into params list
  const requestUrl = localRequest?.request.url ?? "";
  const requestParams = localRequest?.request.params;
  useEffect(() => {
    if (!localRequest) return;
    const [base, qs] = splitUrlAtQuery(requestUrl);
    if (qs) {
      const urlParams = parseQueryString(qs);
      const existing = normalizeKVPairs(requestParams);
      const updated = {
        ...localRequest,
        request: { ...localRequest.request, url: base, params: [...existing, ...urlParams] },
      };
      updateTabRequest(tabId, updated);
    }
    // Only run on mount (or when tab changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Local state for URL bar — only syncs to params on blur
  const [urlBarValue, setUrlBarValue] = useState<string | null>(null);
  const isUrlFocused = urlBarValue !== null;

  const paramPairs = useMemo(() => normalizeKVPairs(localRequest?.request.params), [localRequest?.request.params]);

  // Compute the full display URL = base + query string from enabled params
  const displayUrl = useMemo(() => {
    const base = splitUrlAtQuery(requestUrl)[0];
    const qs = buildQueryString(paramPairs);
    return qs ? `${base}?${qs}` : base;
  }, [requestUrl, paramPairs]);

  if (!tab || !localRequest) {
    return null;
  }

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

  const handlePasteCurl = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    const parsed = parseCurl(text);
    if (parsed) {
      e.preventDefault();
      updateRequest({
        request: {
          ...localRequest.request,
          method: parsed.method,
          url: parsed.url,
          ...(parsed.params ? { params: parsed.params } : {}),
          ...(parsed.headers
            ? {
                headers: [
                  ...normalizeKVPairs(localRequest.request.headers),
                  ...parsed.headers,
                ],
              }
            : {}),
          ...(parsed.body ? { body: parsed.body } : {}),
          ...(parsed.auth ? { auth: parsed.auth } : {}),
        },
      });
    }
  };

  const isTemporary = !tab.collectionId;
  const handleSave = () => {
    if (isTemporary) {
      setShowSaveDialog(true);
    } else {
      saveTab(tab.id);
    }
  };
  const handleSend = () => executeTab(tab.id);

  const headerPairs = normalizeKVPairs(localRequest.request.headers);

  // When URL bar gains focus, initialize local state with the display URL
  const handleUrlFocus = () => {
    setUrlBarValue(displayUrl);
  };

  // When URL bar loses focus, sync typed URL to params
  const handleUrlBlur = () => {
    if (urlBarValue !== null) {
      const [newBase, qs] = splitUrlAtQuery(urlBarValue);
      const urlParams = parseQueryString(qs);
      const disabledParams = paramPairs.filter((p) => p.enabled === false);
      updateRequestDef({ url: newBase, params: [...urlParams, ...disabledParams] });
      setUrlBarValue(null);
    }
  };

  // While focused, just update local state (no sync on every keystroke)
  const handleUrlChange = (newUrl: string) => {
    setUrlBarValue(newUrl);
  };

  // When user edits the params list, just update params (displayUrl auto-updates)
  const handleParamsChange = (newParams: KeyValuePair[]) => {
    updateRequestDef({ params: newParams });
  };

  const mockCount = localRequest.mocks?.length || 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "params", label: "Params", count: paramPairs.length },
    { id: "headers", label: "Headers", count: headerPairs.length },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
    { id: "scripts", label: "Scripts" },
    { id: "mocks", label: "Mocks", count: mockCount },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* URL Bar */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Select
          value={localRequest.request.method}
          onChange={(v) => updateRequestDef({ method: v })}
          options={METHODS.map((m) => ({ value: m, label: m }))}
          className={`w-28 font-bold ${METHOD_COLORS[localRequest.request.method] || ""}`}
        />

        <VariableInput
          value={isUrlFocused ? urlBarValue : displayUrl}
          onChange={handleUrlChange}
          placeholder="https://api.example.com/endpoint"
          collectionId={tab.collectionId}
          wrapperClassName="flex-1"
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent font-mono"
          onPaste={handlePasteCurl}
          onFocus={handleUrlFocus}
          onBlur={handleUrlBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleUrlBlur();
              handleSend();
            }
          }}
        />

        {tab.isExecuting ? (
          <button
            onClick={() => cancelTab(tab.id)}
            className="bg-error text-white px-5 py-2 rounded text-sm font-semibold hover:bg-error/80 transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleSend}
            className="bg-accent text-bg-primary px-5 py-2 rounded text-sm font-semibold hover:bg-accent-hover transition-colors whitespace-nowrap"
          >
            Send
          </button>
        )}

        <button
          onClick={handleSave}
          className="text-text-muted hover:text-text-primary px-3 py-2 text-sm border border-border rounded hover:border-border-light transition-colors"
          title={isTemporary ? "Save to collection" : "Save (without sending)"}
        >
          {isTemporary ? "Save to..." : "Save"}
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
            onChange={handleParamsChange}
            collectionId={tab.collectionId}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
          />
        )}

        {activeEditorTab === "headers" && (
          <KeyValueEditor
            pairs={headerPairs}
            onChange={(pairs) => {
              updateRequestDef({ headers: pairs });
            }}
            collectionId={tab.collectionId}
          />
        )}

        {activeEditorTab === "body" && (
          <BodyEditor
            body={localRequest.request.body}
            onChange={(body) => updateRequestDef({ body })}
            collectionId={tab.collectionId}
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

        {activeEditorTab === "mocks" && (
          <MocksEditor
            mocks={localRequest.mocks || []}
            onChange={(mocks) => updateRequest({ mocks })}
          />
        )}
      </div>

      {showSaveDialog && localRequest && (
        <SaveToCollectionDialog
          open={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          request={localRequest}
          tabId={tab.id}
        />
      )}
    </div>
  );
}

