"use client";

import { useState, useMemo } from "react";
import { VariableInput } from "./VariableHighlight";

interface KeyValuePair {
  key: string;
  value: string;
  enabled?: boolean;
}

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  collectionId?: string | null;
  allowBulkEdit?: boolean;
}

function pairsToRawText(pairs: KeyValuePair[]): string {
  return pairs
    .filter((p) => p.enabled !== false)
    .map((p) => `${p.key}: ${p.value}`)
    .join("\n");
}

function rawTextToPairs(text: string): KeyValuePair[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return { key: line.trim(), value: "", enabled: true };
      return {
        key: line.substring(0, colonIdx).trim(),
        value: line.substring(colonIdx + 1).trim(),
        enabled: true,
      };
    });
}

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  collectionId = null,
  allowBulkEdit = false,
}: KeyValueEditorProps) {
  const [bulkEdit, setBulkEdit] = useState(false);
  const [rawText, setRawText] = useState("");

  const updatePair = (index: number, field: "key" | "value", val: string) => {
    const updated = [...pairs];
    updated[index] = { ...updated[index], [field]: val };
    onChange(updated);
  };

  const togglePair = (index: number) => {
    const updated = [...pairs];
    updated[index] = {
      ...updated[index],
      enabled: !updated[index].enabled,
    };
    onChange(updated);
  };

  const removePair = (index: number) => {
    onChange(pairs.filter((_, i) => i !== index));
  };

  const addPair = () => {
    onChange([...pairs, { key: "", value: "", enabled: true }]);
  };

  const enterBulkEdit = () => {
    setRawText(pairsToRawText(pairs));
    setBulkEdit(true);
  };

  const applyBulkEdit = () => {
    const disabledPairs = pairs.filter((p) => p.enabled === false);
    onChange([...rawTextToPairs(rawText), ...disabledPairs]);
    setBulkEdit(false);
  };

  const cancelBulkEdit = () => {
    setBulkEdit(false);
  };

  if (bulkEdit) {
    return (
      <div className="text-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted">One header per line, format: <code className="text-accent">Key: Value</code></span>
          <div className="flex gap-2">
            <button
              onClick={cancelBulkEdit}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={applyBulkEdit}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          className="w-full h-64 bg-bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-accent resize-y"
          placeholder={`${keyPlaceholder}: ${valuePlaceholder}\nContent-Type: application/json`}
          spellCheck={false}
        />
        {pairs.some((p) => p.enabled === false) && (
          <p className="mt-1 text-xs text-text-muted">
            Disabled entries are preserved and not shown in bulk edit.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="text-sm overflow-x-auto">
      {allowBulkEdit && (
        <div className="flex justify-end mb-1">
          <button
            onClick={enterBulkEdit}
            className="text-xs text-text-muted hover:text-accent transition-colors"
          >
            Bulk Edit
          </button>
        </div>
      )}
      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-0 border border-border rounded overflow-hidden min-w-[500px]">
        <div className="bg-bg-tertiary px-2 py-1.5 text-text-muted text-xs font-medium border-b border-border" />
        <div className="bg-bg-tertiary px-2 py-1.5 text-text-muted text-xs font-medium border-b border-l border-border">
          {keyPlaceholder}
        </div>
        <div className="bg-bg-tertiary px-2 py-1.5 text-text-muted text-xs font-medium border-b border-l border-border">
          {valuePlaceholder}
        </div>
        <div className="bg-bg-tertiary px-2 py-1.5 border-b border-l border-border" />

        {pairs.map((pair, i) => (
          <div key={i} className="contents group">
            <div className="flex items-center justify-center px-2 border-b border-border">
              <input
                type="checkbox"
                checked={pair.enabled !== false}
                onChange={() => togglePair(i)}
                className="accent-accent"
              />
            </div>
            <VariableInput
              value={pair.key}
              onChange={(v) => updatePair(i, "key", v)}
              placeholder={keyPlaceholder}
              collectionId={collectionId}
              className={`bg-transparent px-2 py-1.5 outline-none border-b border-l border-border text-sm font-mono ${pair.enabled === false ? "opacity-40" : ""}`}
            />
            <VariableInput
              value={pair.value}
              onChange={(v) => updatePair(i, "value", v)}
              placeholder={valuePlaceholder}
              collectionId={collectionId}
              className={`bg-transparent px-2 py-1.5 outline-none border-b border-l border-border text-sm font-mono ${pair.enabled === false ? "opacity-40" : ""}`}
            />
            <button
              onClick={() => removePair(i)}
              className="px-2 border-b border-l border-border text-text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
            >
              x
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addPair}
        className="mt-2 text-xs text-text-muted hover:text-accent transition-colors"
      >
        + Add
      </button>
    </div>
  );
}
