"use client";

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
}

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  collectionId = null,
}: KeyValueEditorProps) {
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

  return (
    <div className="text-sm">
      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-0 border border-border rounded overflow-hidden">
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
