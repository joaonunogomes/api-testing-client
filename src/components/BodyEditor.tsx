"use client";

import type { RequestBody } from "@/lib/types";

interface BodyEditorProps {
  body: RequestBody | undefined;
  onChange: (body: RequestBody) => void;
}

export function BodyEditor({ body, onChange }: BodyEditorProps) {
  const bodyType = body?.type || "none";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {(["none", "json", "text", "xml", "form"] as const).map((type) => (
          <label key={type} className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="bodyType"
              value={type}
              checked={bodyType === type}
              onChange={() => onChange({ type, content: body?.content || "" })}
              className="accent-accent"
            />
            <span className="text-text-secondary capitalize">{type}</span>
          </label>
        ))}
      </div>

      {bodyType !== "none" && (
        <textarea
          value={body?.content || ""}
          onChange={(e) =>
            onChange({ type: bodyType, content: e.target.value })
          }
          placeholder={
            bodyType === "json"
              ? '{\n  "key": "value"\n}'
              : "Request body..."
          }
          spellCheck={false}
          className="w-full h-64 bg-bg-primary border border-border rounded p-3 text-sm text-text-primary outline-none focus:border-accent font-mono resize-y"
        />
      )}
    </div>
  );
}
