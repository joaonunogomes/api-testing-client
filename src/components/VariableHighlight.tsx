"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/stores/app-store";
import { generators } from "@/lib/variables";

/**
 * Collect all available variables (name -> value) from the active collection + environment.
 */
function useAvailableVars(collectionId: string | null): Map<string, string> {
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
      for (const [k, v] of Object.entries(env.secrets)) vars.set(k, v ? "••••••" : "(empty)");
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

function Tooltip({
  anchor,
  children,
}: {
  anchor: DOMRect;
  children: React.ReactNode;
}) {
  const top = anchor.bottom + 6;
  const left = anchor.left + anchor.width / 2;

  return createPortal(
    <div
      className="fixed z-[300] pointer-events-none"
      style={{ top, left, transform: "translateX(-50%)" }}
    >
      <div className="bg-bg-tertiary border border-border-light rounded px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap">
        {children}
      </div>
    </div>,
    document.body,
  );
}

function VarToken({
  part,
}: {
  part: { text: string; resolved: boolean; value?: string; varName?: string };
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const handleEnter = useCallback(() => {
    if (ref.current) {
      setRect(ref.current.getBoundingClientRect());
      setHovered(true);
    }
  }, []);

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setHovered(false)}
        className={`cursor-default ${
          part.resolved
            ? "text-success font-semibold"
            : "text-warning font-semibold"
        }`}
      >
        {part.text}
      </span>
      {hovered && rect && (
        <Tooltip anchor={rect}>
          {part.resolved ? (
            <>
              <span className="text-text-muted">{part.varName}</span>
              <span className="text-text-muted mx-1">=</span>
              <span className="text-text-primary font-mono">{part.value}</span>
            </>
          ) : (
            <>
              <span className="text-warning">{part.varName}</span>
              <span className="text-text-muted ml-1">not set</span>
            </>
          )}
        </Tooltip>
      )}
    </>
  );
}

/**
 * Renders text with {{variables}} highlighted.
 * Green = variable exists, Orange = variable not found.
 */
export function VariableText({
  text,
  collectionId,
}: {
  text: string;
  collectionId: string | null;
}) {
  const availableVars = useAvailableVars(collectionId);

  const parts = useMemo(() => {
    const result: { text: string; isVar: boolean; resolved: boolean; value?: string; varName?: string }[] = [];
    const regex = /(\{\{[^}]+\}\})/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ text: text.slice(lastIndex, match.index), isVar: false, resolved: false });
      }
      const varName = match[1].slice(2, -2).trim();
      const value = availableVars.get(varName);
      result.push({
        text: match[1],
        isVar: true,
        resolved: value !== undefined,
        value,
        varName,
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), isVar: false, resolved: false });
    }

    return result;
  }, [text, availableVars]);

  return (
    <span>
      {parts.map((part, i) =>
        part.isVar ? (
          <VarToken key={i} part={part} />
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}

/**
 * An input that shows a highlighted overlay for {{variables}}.
 * The actual editing happens in a regular input underneath.
 */
/**
 * Extract the variable prefix being typed at the cursor position.
 * Returns { start, prefix } if the cursor is inside `{{prefix` (no closing `}}`), null otherwise.
 */
function getVarPrefixAtCursor(
  value: string,
  cursorPos: number,
): { start: number; prefix: string } | null {
  const before = value.slice(0, cursorPos);
  // Find the last `{{` before the cursor that isn't already closed
  const openIdx = before.lastIndexOf("{{");
  if (openIdx === -1) return null;
  const afterOpen = before.slice(openIdx + 2);
  // If there's a `}}` between the `{{` and cursor, it's already closed
  if (afterOpen.includes("}}")) return null;
  return { start: openIdx, prefix: afterOpen.trim() };
}

function AutocompleteDropdown({
  items,
  selectedIndex,
  onSelect,
  anchorRef,
}: {
  items: { name: string; value: string }[];
  selectedIndex: number;
  onSelect: (name: string) => void;
  anchorRef: React.RefObject<HTMLInputElement | null>;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!anchorRef.current || items.length === 0) return null;
  const rect = anchorRef.current.getBoundingClientRect();

  return createPortal(
    <div
      ref={listRef}
      className="fixed z-[400] bg-bg-secondary border border-border rounded shadow-lg max-h-48 overflow-y-auto min-w-[200px]"
      style={{ top: rect.bottom + 4, left: rect.left }}
    >
      {items.map((item, i) => (
        <button
          key={item.name}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item.name);
          }}
          className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between gap-3 ${
            i === selectedIndex
              ? "bg-accent/15 text-accent"
              : "text-text-primary hover:bg-bg-tertiary"
          }`}
        >
          <span className="font-mono truncate">{`{{${item.name}}}`}</span>
          <span className="text-text-muted truncate max-w-[120px] text-[10px]">
            {item.value}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function VariableInput({
  value,
  onChange,
  placeholder,
  collectionId,
  className = "",
  onKeyDown,
  onPaste,
  wrapperClassName = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  collectionId: string | null;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  wrapperClassName?: string;
}) {
  const availableVars = useAvailableVars(collectionId);
  const hasVars = value.includes("{{");
  const [focused, setFocused] = useState(false);
  const [acState, setAcState] = useState<{ prefix: string; start: number } | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const showOverlay = hasVars && !focused;

  const filteredVars = useMemo(() => {
    if (!acState) return [];
    const q = acState.prefix.toLowerCase();
    const items: { name: string; value: string }[] = [];
    for (const [name, val] of availableVars) {
      if (name.toLowerCase().includes(q)) {
        items.push({ name, value: val });
      }
    }
    return items.slice(0, 20);
  }, [acState, availableVars]);

  const updateAutocomplete = useCallback(
    (newValue: string, cursorPos: number) => {
      const result = getVarPrefixAtCursor(newValue, cursorPos);
      if (result) {
        setAcState(result);
        setSelectedIdx(0);
      } else {
        setAcState(null);
      }
    },
    [],
  );

  const completeVar = useCallback(
    (varName: string) => {
      if (!acState || !inputRef.current) return;
      // Replace from `{{` to cursor with `{{varName}}`
      const before = value.slice(0, acState.start);
      const after = value.slice(inputRef.current.selectionStart ?? value.length);
      const completed = `${before}{{${varName}}}${after}`;
      onChange(completed);
      setAcState(null);
      // Move cursor after the closing `}}`
      const newPos = acState.start + varName.length + 4;
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(newPos, newPos);
      });
    },
    [acState, value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (acState && filteredVars.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filteredVars.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        completeVar(filteredVars[selectedIdx].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAcState(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    onChange(newVal);
    updateAutocomplete(newVal, e.target.selectionStart ?? newVal.length);
  };

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onFocus={() => {
          setFocused(true);
          if (inputRef.current) {
            updateAutocomplete(value, inputRef.current.selectionStart ?? value.length);
          }
        }}
        onBlur={() => {
          setFocused(false);
          setAcState(null);
        }}
        className={`w-full ${className} ${showOverlay ? "text-transparent caret-text-primary" : ""}`}
        spellCheck={false}
      />
      {showOverlay && (
        <div
          onClick={() => inputRef.current?.focus()}
          className={`absolute inset-0 flex items-center overflow-hidden whitespace-nowrap cursor-text ${className.includes("px-3") ? "px-3" : "px-2"} ${className.includes("py-2") ? "py-2" : "py-1.5"} text-sm font-mono`}
        >
          <VariableText text={value} collectionId={collectionId} />
        </div>
      )}
      {focused && acState && filteredVars.length > 0 && (
        <AutocompleteDropdown
          items={filteredVars}
          selectedIndex={selectedIdx}
          onSelect={completeVar}
          anchorRef={inputRef}
        />
      )}
    </div>
  );
}
