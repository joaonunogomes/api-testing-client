"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/stores/app-store";

/**
 * Collect all available variables (name -> value) from the active collection + environment.
 */
function useAvailableVars(collectionId: string | null): Map<string, string> {
  const { collections, environments, selectedEnvironmentId } = useAppStore();

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

    // Built-in dynamic variables
    vars.set("$guid", "(generated UUID)");
    vars.set("$timestamp", "(unix timestamp)");
    vars.set("$isoTimestamp", "(ISO datetime)");
    vars.set("$randomInt", "(random 0-999999)");
    vars.set("$randomCompanyName", "(random name)");

    return vars;
  }, [collections, environments, collectionId, selectedEnvironmentId]);
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
  const hasVars = value.includes("{{");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showOverlay = hasVars && !focused;

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
    </div>
  );
}
