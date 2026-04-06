"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  autocompletion,
  type CompletionContext,
  type Completion,
} from "@codemirror/autocomplete";
import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  hoverTooltip,
  keymap,
} from "@codemirror/view";
import { type Extension, RangeSetBuilder, Facet } from "@codemirror/state";
import { search, openSearchPanel } from "@codemirror/search";
import type CodeMirrorType from "@uiw/react-codemirror";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { RequestBody } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import { generators } from "@/lib/variables";

// ── Variable resolution helpers ──────────────────────────────────────

type VarMap = Map<string, string>;

function useAvailableVars(collectionId: string | null): VarMap {
  const { collections, environments, selectedEnvironmentId, sessionRuntimeVars, sessionEnvOverrides } = useAppStore();

  return useMemo(() => {
    const vars = new Map<string, string>();

    const col = collections.find((c) => c.id === collectionId);
    if (col?.variables) {
      for (const [k, v] of Object.entries(col.variables)) vars.set(k, v);
    }

    const env = environments.find((e) => e.id === selectedEnvironmentId);
    if (env) {
      for (const [k, v] of Object.entries(env.variables)) vars.set(k, v);
      for (const [k, v] of Object.entries(env.secrets))
        vars.set(k, v ? "••••••" : "(empty)");
    }

    // Session-scoped variables set by scripts (ac.env.set / ac.setVar)
    for (const [k, v] of Object.entries(sessionEnvOverrides)) vars.set(k, v);
    for (const [k, v] of Object.entries(sessionRuntimeVars)) vars.set(k, v);

    // Generator functions — {{generate 'type'}}
    for (const [type, gen] of Object.entries(generators)) {
      vars.set(`generate '${type}'`, gen.description);
    }

    return vars;
  }, [collections, environments, collectionId, selectedEnvironmentId, sessionRuntimeVars, sessionEnvOverrides]);
}

// ── CodeMirror facet to pass variable map into extensions ────────────

const varMapFacet = Facet.define<VarMap, VarMap>({
  combine: (values) => values[0] ?? new Map(),
});

// ── Variable highlight decorations ──────────────────────────────────

const resolvedMark = Decoration.mark({
  class: "cm-var-resolved",
});

const unresolvedMark = Decoration.mark({
  class: "cm-var-unresolved",
});

function buildVarDecorations(view: EditorView): DecorationSet {
  const vars = view.state.facet(varMapFacet);
  const builder = new RangeSetBuilder<Decoration>();
  const regex = /\{\{([^}]+)\}\}/g;

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      const varName = match[1].trim();
      const isResolved = vars.has(varName);
      builder.add(start, end, isResolved ? resolvedMark : unresolvedMark);
    }
  }

  return builder.finish();
}

const varHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildVarDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildVarDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// ── Variable hover tooltip ──────────────────────────────────────────

function varHoverTooltip(view: EditorView, pos: number) {
  const vars = view.state.facet(varMapFacet);
  const line = view.state.doc.lineAt(pos);
  const lineText = line.text;
  const regex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = regex.exec(lineText)) !== null) {
    const start = line.from + match.index;
    const end = start + match[0].length;
    if (pos >= start && pos <= end) {
      const varName = match[1].trim();
      const value = vars.get(varName);
      return {
        pos: start,
        end,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "cm-var-tooltip";
          if (value !== undefined) {
            dom.innerHTML = `<span class="cm-var-tooltip-name">${varName}</span><span class="cm-var-tooltip-eq"> = </span><span class="cm-var-tooltip-value">${value}</span>`;
          } else {
            dom.innerHTML = `<span class="cm-var-tooltip-unresolved">${varName}</span><span class="cm-var-tooltip-notset"> not set</span>`;
          }
          return { dom };
        },
      };
    }
  }
  return null;
}

// ── Variable autocomplete ───────────────────────────────────────────

function varCompletions(context: CompletionContext) {
  const vars = context.state.facet(varMapFacet);
  // Find `{{` before cursor with optional prefix
  const before = context.state.doc.sliceString(0, context.pos);
  const openIdx = before.lastIndexOf("{{");
  if (openIdx === -1) return null;
  const afterOpen = before.slice(openIdx + 2);
  if (afterOpen.includes("}}")) return null;

  const prefix = afterOpen.trim().toLowerCase();
  const from = openIdx + 2;

  const options: Completion[] = [];
  for (const [name, val] of vars) {
    if (name.toLowerCase().includes(prefix)) {
      options.push({
        label: name,
        type: "variable",
        detail: val,
        apply: `${name}}}`,
        boost: name.toLowerCase().startsWith(prefix) ? 1 : 0,
      });
    }
  }

  if (options.length === 0) return null;

  return {
    from,
    options: options.slice(0, 20),
    validFor: /^[^}]*$/,
  };
}

// ── Variable extensions bundle ──────────────────────────────────────

function varExtensions(vars: VarMap): Extension[] {
  return [
    varMapFacet.of(vars),
    varHighlightPlugin,
    hoverTooltip(varHoverTooltip, { hideOnChange: true }),
    autocompletion({
      override: [varCompletions],
      activateOnTyping: true,
      icons: true,
    }),
  ];
}

// ── Styles (injected via CodeMirror theme) ──────────────────────────

const varTheme = EditorView.theme({
  ".cm-var-resolved": {
    color: "var(--color-success)",
    fontWeight: "600",
  },
  ".cm-var-unresolved": {
    color: "var(--color-warning)",
    fontWeight: "600",
  },
  ".cm-tooltip.cm-tooltip-hover": {
    backgroundColor: "var(--color-bg-tertiary)",
    border: "1px solid var(--color-border-light)",
    borderRadius: "4px",
    padding: "4px 8px",
    fontSize: "12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  },
  ".cm-var-tooltip-name": {
    color: "var(--color-text-muted)",
  },
  ".cm-var-tooltip-eq": {
    color: "var(--color-text-muted)",
    margin: "0 2px",
  },
  ".cm-var-tooltip-value": {
    color: "var(--color-text-primary)",
    fontFamily: "monospace",
  },
  ".cm-var-tooltip-unresolved": {
    color: "var(--color-warning)",
  },
  ".cm-var-tooltip-notset": {
    color: "var(--color-text-muted)",
    marginLeft: "4px",
  },
});

// ── Main component ──────────────────────────────────────────────────

interface BodyEditorProps {
  body: RequestBody | undefined;
  onChange: (body: RequestBody) => void;
  collectionId: string | null;
}

export function BodyEditor({ body, onChange, collectionId }: BodyEditorProps) {
  const bodyType = body?.type || "none";
  const availableVars = useAvailableVars(collectionId);

  const cmRef = useRef<ReactCodeMirrorRef>(null);

  const [CodeMirror, setCodeMirror] = useState<typeof CodeMirrorType | null>(
    null,
  );

  useEffect(() => {
    import("@uiw/react-codemirror").then((mod) =>
      setCodeMirror(() => mod.default),
    );
  }, []);

  const formatBody = useCallback(
    (view: EditorView): boolean => {
      const content = view.state.doc.toString();
      let formatted: string | null = null;
      if (bodyType === "json") {
        try {
          formatted = JSON.stringify(JSON.parse(content), null, 2);
        } catch {
          // invalid JSON — do nothing
        }
      } else if (bodyType === "xml") {
        // Basic XML indent
        formatted = content
          .replace(/>\s*</g, ">\n<")
          .split("\n")
          .reduce(
            (acc, line) => {
              const trimmed = line.trim();
              if (trimmed.startsWith("</")) acc.indent--;
              acc.lines.push("  ".repeat(Math.max(0, acc.indent)) + trimmed);
              if (
                trimmed.startsWith("<") &&
                !trimmed.startsWith("</") &&
                !trimmed.endsWith("/>") &&
                !trimmed.startsWith("<?")
              )
                acc.indent++;
              return acc;
            },
            { indent: 0, lines: [] as string[] },
          )
          .lines.join("\n");
      }
      if (formatted && formatted !== content) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: formatted },
        });
      }
      return true;
    },
    [bodyType],
  );

  const extensions = useMemo(() => {
    const langExt =
      bodyType === "json"
        ? [json()]
        : bodyType === "xml"
          ? [xml()]
          : bodyType === "form"
            ? [html()]
            : [];

    return [
      ...langExt,
      ...varExtensions(availableVars),
      varTheme,
      search(),
      keymap.of([
        {
          key: "Mod-b",
          run: formatBody,
        },
      ]),
    ];
  }, [bodyType, availableVars, formatBody]);

  const handleBeautify = useCallback(() => {
    const view = cmRef.current?.view;
    if (view) formatBody(view);
  }, [formatBody]);

  const handleChange = useCallback(
    (value: string) => {
      onChange({ type: bodyType, content: value });
    },
    [bodyType, onChange],
  );

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
        {(bodyType === "json" || bodyType === "xml") && (
          <div className="relative group ml-auto">
            <button
              onClick={handleBeautify}
              className="text-xs text-text-muted hover:text-accent transition-colors"
            >
              Beautify
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 text-xs text-text-primary bg-bg-tertiary border border-border rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+B
            </div>
          </div>
        )}
      </div>

      {bodyType !== "none" &&
        (CodeMirror ? (
          <CodeMirror
            ref={cmRef}
            value={body?.content || ""}
            onChange={handleChange}
            height="256px"
            theme={oneDark}
            extensions={extensions}
            placeholder={
              bodyType === "json"
                ? '{\n  "key": "value"\n}'
                : "Request body..."
            }
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              bracketMatching: true,
              closeBrackets: true,
              indentOnInput: true,
            }}
            style={{
              fontSize: "13px",
              borderRadius: "6px",
              overflow: "hidden",
              border: "1px solid var(--color-border)",
            }}
          />
        ) : (
          <div
            className="bg-bg-primary border border-border rounded p-3 text-sm text-text-muted font-mono"
            style={{ height: "256px" }}
          >
            Loading editor...
          </div>
        ))}
    </div>
  );
}
