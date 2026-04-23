"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import type CodeMirrorType from "@uiw/react-codemirror";

type ResponseTab = "body" | "headers" | "tests" | "console";

function formatBody(body: string, contentType?: string): string {
  if (contentType?.includes("json") || body.startsWith("{") || body.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return "text-success";
  if (status >= 300 && status < 400) return "text-warning";
  if (status >= 400) return "text-error";
  return "text-text-muted";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResponseViewer() {
  const { openTabs, activeTabId, updateTabRequest, theme: appTheme } = useAppStore();
  const responseTabsRef = useRef<Record<string, ResponseTab>>({});
  const [, forceRender] = useState(0);
  const activeTab = responseTabsRef.current[activeTabId ?? ""] ?? "body";
  const setActiveTab = (tab: ResponseTab) => {
    responseTabsRef.current[activeTabId ?? ""] = tab;
    forceRender((n) => n + 1);
  };
  useEffect(() => { forceRender((n) => n + 1); }, [activeTabId]);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [savedMock, setSavedMock] = useState(false);

  const [CodeMirror, setCodeMirror] = useState<typeof CodeMirrorType | null>(null);
  const [cmExtensions, setCmExtensions] = useState<
    { oneDark: unknown; json: () => unknown; xml: () => unknown; search: () => unknown } | null
  >(null);

  useEffect(() => {
    Promise.all([
      import("@uiw/react-codemirror"),
      import("@codemirror/theme-one-dark"),
      import("@codemirror/lang-json"),
      import("@codemirror/lang-xml"),
      import("@codemirror/search"),
    ]).then(([cm, theme, jsonMod, xmlMod, searchMod]) => {
      setCodeMirror(() => cm.default);
      setCmExtensions({
        oneDark: theme.oneDark,
        json: jsonMod.json,
        xml: xmlMod.xml,
        search: searchMod.search,
      });
    });
  }, []);

  const tab = openTabs.find((t) => t.id === activeTabId);
  const response = tab?.response ?? null;
  const isExecuting = tab?.isExecuting ?? false;

  if (isExecuting) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>Sending request...</span>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Send a request to see the response
      </div>
    );
  }

  const contentType = response.headers["content-type"] || "";
  const formattedBody = formatBody(response.body, contentType);
  const isJson = contentType.includes("json") || formattedBody.startsWith("{") || formattedBody.startsWith("[");

  const tabs: { id: ResponseTab; label: string; badge?: string }[] = [
    { id: "body", label: "Body" },
    {
      id: "headers",
      label: "Headers",
      badge: String(Object.keys(response.headers).length),
    },
  ];

  if (response.testResults && response.testResults.length > 0) {
    const passed = response.testResults.filter((t) => t.passed).length;
    const total = response.testResults.length;
    tabs.push({
      id: "tests",
      label: "Tests",
      badge: `${passed}/${total}`,
    });
  }

  // Always show Console tab
  tabs.push({ id: "console", label: "Console" });

  const handleCopyCurl = async () => {
    if (!response.curl) return;
    await navigator.clipboard.writeText(response.curl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleSaveAsMock = () => {
    if (!tab?.request || !activeTabId) return;
    const existingMocks = tab.request.mocks || [];
    const mockName = `${response.status} Response`;
    // Avoid duplicate names
    let name = mockName;
    let counter = 1;
    while (existingMocks.some((m) => m.name === name)) {
      counter++;
      name = `${mockName} (${counter})`;
    }
    const isFirst = existingMocks.length === 0;
    const newMock = {
      name,
      isDefault: isFirst,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: { ...response.headers },
        body: response.body,
      },
    };
    updateTabRequest(activeTabId, {
      ...tab.request,
      mocks: [...existingMocks, newMock],
    });
    setSavedMock(true);
    setTimeout(() => setSavedMock(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border text-sm">
        <span className={`font-semibold ${getStatusColor(response.status)}`}>
          {response.status} {response.statusText}
        </span>
        <span className="text-text-muted">{response.time} ms</span>
        <span className="text-text-muted">{formatSize(response.size)}</span>
        <div className="ml-auto">
          <button
            onClick={handleSaveAsMock}
            className="text-xs text-text-muted hover:text-accent transition-colors"
          >
            {savedMock ? "Saved!" : "Save as Mock"}
          </button>
        </div>
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
            {tab.badge && (
              <span className="ml-1.5 text-xs text-accent">({tab.badge})</span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "body" && (
          CodeMirror && cmExtensions ? (
            <CodeMirror
              value={formattedBody}
              readOnly
              theme={appTheme === "dark" ? cmExtensions.oneDark as import("@codemirror/state").Extension : "light"}
              extensions={[
                isJson
                  ? (cmExtensions.json as () => import("@codemirror/state").Extension)()
                  : contentType.includes("xml")
                    ? (cmExtensions.xml as () => import("@codemirror/state").Extension)()
                    : [],
                (cmExtensions.search as () => import("@codemirror/state").Extension)(),
              ].flat()}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: false,
              }}
              style={{
                fontSize: "13px",
                height: "100%",
              }}
            />
          ) : (
            <pre className="p-3 text-sm font-mono text-text-primary whitespace-pre-wrap break-words">{formattedBody}</pre>
          )
        )}

        {activeTab === "headers" && (
          <div className="p-3">
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(response.headers).map(([key, value]) => (
                  <tr
                    key={key}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-1.5 pr-4 text-accent font-mono whitespace-nowrap">
                      {key}
                    </td>
                    <td className="py-1.5 text-text-secondary font-mono break-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "tests" && response.testResults && (
          <div className="p-3 space-y-1">
            {response.testResults.map((test, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded ${
                  test.passed ? "text-success" : "text-error"
                }`}
              >
                <span>{test.passed ? "PASS" : "FAIL"}</span>
                <span className="text-text-primary">{test.name}</span>
                {test.error && (
                  <span className="text-text-muted text-xs">
                    — {test.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "console" && (
          <div className="p-3 space-y-4">
            {/* Curl section */}
            {response.curl && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                    cURL
                  </span>
                  <button
                    onClick={handleCopyCurl}
                    className="text-xs text-text-muted hover:text-accent transition-colors"
                  >
                    {copiedCurl ? "Copied!" : "Copy"}
                  </button>
                </div>
                <pre className="text-sm font-mono text-text-secondary bg-bg-tertiary border border-border rounded p-3 whitespace-pre-wrap break-all">
                  {response.curl}
                </pre>
              </div>
            )}

            {/* Logs section */}
            {response.consoleOutput && response.consoleOutput.length > 0 && (
              <div>
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1.5">
                  Logs
                </span>
                <pre className="text-sm font-mono text-text-secondary bg-bg-tertiary border border-border rounded p-3 whitespace-pre-wrap">
                  {response.consoleOutput.join("\n")}
                </pre>
              </div>
            )}

            {!response.curl && (!response.consoleOutput || response.consoleOutput.length === 0) && (
              <div className="text-sm text-text-muted">
                No console output
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
