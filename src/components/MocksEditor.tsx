"use client";

import { useState } from "react";
import type { MockResponse } from "@/lib/types";

interface MocksEditorProps {
  mocks: MockResponse[];
  onChange: (mocks: MockResponse[]) => void;
}

function MockForm({
  mock,
  onSave,
  onCancel,
}: {
  mock?: MockResponse;
  onSave: (mock: MockResponse) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(mock?.name || "");
  const [status, setStatus] = useState(mock?.response.status ?? 200);
  const [statusText, setStatusText] = useState(mock?.response.statusText || "");
  const [headers, setHeaders] = useState(
    mock?.response.headers
      ? Object.entries(mock.response.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")
      : "Content-Type: application/json",
  );
  const [body, setBody] = useState(mock?.response.body || "");
  const [isDefault, setIsDefault] = useState(mock?.isDefault || false);

  const handleSave = () => {
    if (!name.trim()) return;

    const parsedHeaders: Record<string, string> = {};
    for (const line of headers.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        parsedHeaders[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }

    onSave({
      name: name.trim(),
      isDefault,
      response: {
        status,
        ...(statusText ? { statusText } : {}),
        ...(Object.keys(parsedHeaders).length > 0
          ? { headers: parsedHeaders }
          : {}),
        ...(body ? { body } : {}),
      },
    });
  };

  return (
    <div className="border border-border rounded p-3 space-y-3 bg-bg-secondary">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-text-muted mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Success, Not Found, Error"
            className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          />
        </div>
        <div className="w-24">
          <label className="block text-xs text-text-muted mb-1">Status</label>
          <input
            type="number"
            value={status}
            onChange={(e) => setStatus(Number(e.target.value))}
            className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          />
        </div>
        <div className="w-32">
          <label className="block text-xs text-text-muted mb-1">
            Status Text
          </label>
          <input
            type="text"
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
            placeholder="OK"
            className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-text-muted mb-1">
          Headers (one per line, Key: Value)
        </label>
        <textarea
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          rows={2}
          className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent font-mono resize-y"
        />
      </div>

      <div>
        <label className="block text-xs text-text-muted mb-1">
          Response Body
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder='{"id": 1, "name": "Example"}'
          className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent font-mono resize-y"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="accent-accent"
          />
          Default mock
        </label>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="bg-accent text-bg-primary px-3 py-1.5 rounded text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {mock ? "Update" : "Add"} Mock
          </button>
        </div>
      </div>
    </div>
  );
}

export function MocksEditor({ mocks, onChange }: MocksEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAdd = (mock: MockResponse) => {
    // If this is default, clear other defaults
    let updated = [...mocks];
    if (mock.isDefault) {
      updated = updated.map((m) => ({ ...m, isDefault: false }));
    }
    // If first mock and not explicitly set, make it default
    if (updated.length === 0 && !mock.isDefault) {
      mock.isDefault = true;
    }
    updated.push(mock);
    onChange(updated);
    setIsAdding(false);
  };

  const handleUpdate = (index: number, mock: MockResponse) => {
    let updated = [...mocks];
    if (mock.isDefault) {
      updated = updated.map((m) => ({ ...m, isDefault: false }));
    }
    updated[index] = mock;
    onChange(updated);
    setEditingIndex(null);
  };

  const handleDelete = (index: number) => {
    const updated = mocks.filter((_, i) => i !== index);
    // If we deleted the default, make the first one default
    if (updated.length > 0 && !updated.some((m) => m.isDefault)) {
      updated[0].isDefault = true;
    }
    onChange(updated);
  };

  const handleSetDefault = (index: number) => {
    const updated = mocks.map((m, i) => ({
      ...m,
      isDefault: i === index,
    }));
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {mocks.length === 0 && !isAdding && (
        <p className="text-sm text-text-muted">
          No mocks defined. Add a mock response to use with the mock server.
        </p>
      )}

      {mocks.map((mock, index) =>
        editingIndex === index ? (
          <MockForm
            key={index}
            mock={mock}
            onSave={(m) => handleUpdate(index, m)}
            onCancel={() => setEditingIndex(null)}
          />
        ) : (
          <div
            key={index}
            className="flex items-center gap-3 border border-border rounded px-3 py-2 bg-bg-secondary group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary truncate">
                  {mock.name}
                </span>
                {mock.isDefault && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent shrink-0">
                    default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`text-xs font-mono ${
                    mock.response.status >= 200 && mock.response.status < 300
                      ? "text-success"
                      : mock.response.status >= 400
                        ? "text-error"
                        : "text-warning"
                  }`}
                >
                  {mock.response.status}
                </span>
                {mock.response.body && (
                  <span className="text-xs text-text-muted truncate max-w-60">
                    {mock.response.body.slice(0, 60)}
                    {mock.response.body.length > 60 ? "..." : ""}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {!mock.isDefault && (
                <button
                  onClick={() => handleSetDefault(index)}
                  className="text-xs text-text-muted hover:text-accent transition-colors px-1.5 py-1"
                  title="Set as default"
                >
                  Set default
                </button>
              )}
              <button
                onClick={() => setEditingIndex(index)}
                className="text-xs text-text-muted hover:text-text-primary transition-colors px-1.5 py-1"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(index)}
                className="text-xs text-text-muted hover:text-error transition-colors px-1.5 py-1"
              >
                Delete
              </button>
            </div>
          </div>
        ),
      )}

      {isAdding ? (
        <MockForm onSave={handleAdd} onCancel={() => setIsAdding(false)} />
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          + Add Mock
        </button>
      )}
    </div>
  );
}
