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
        className={`${
          part.resolved
            ? "text-success"
            : "text-warning"
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
 * Extract the variable prefix being typed at the cursor position.
 * Returns { start, prefix } if the cursor is inside `{{prefix` (no closing `}}`), null otherwise.
 */
function getVarPrefixAtCursor(
  value: string,
  cursorPos: number,
): { start: number; prefix: string } | null {
  const before = value.slice(0, cursorPos);
  const openIdx = before.lastIndexOf("{{");
  if (openIdx === -1) return null;
  const afterOpen = before.slice(openIdx + 2);
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
  anchorRef: React.RefObject<HTMLElement | null>;
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

/** Build highlighted HTML string for contentEditable rendering. */
function buildHighlightedHTML(
  text: string,
  availableVars: Map<string, string>,
): string {
  const regex = /(\{\{[^}]+\}\})/g;
  let lastIndex = 0;
  let html = "";
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      html += escapeHTML(text.slice(lastIndex, match.index));
    }
    const varName = match[1].slice(2, -2).trim();
    const resolved = availableVars.has(varName);
    const colorClass = resolved ? "var(--color-success)" : "var(--color-warning)";
    const resolvedValue = resolved ? escapeHTML(availableVars.get(varName) || "") : "";
    html += `<span style="color:${colorClass}" data-var="${escapeHTML(varName)}" data-resolved="${resolved}" data-value="${resolvedValue}">${escapeHTML(match[1])}</span>`;
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    html += escapeHTML(text.slice(lastIndex));
  }

  return html || "<br>"; // <br> keeps the element height when empty
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Extract plain text from a contentEditable element. */
function getPlainText(el: HTMLElement): string {
  return el.textContent || "";
}

/** Save and restore cursor position in a contentEditable element. */
function saveCursorOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function restoreCursorOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  let remaining = offset;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const len = node.textContent?.length || 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
  }

  // If offset is past the end, place cursor at end
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function VariableInput({
  value,
  onChange,
  placeholder,
  collectionId,
  className = "",
  onKeyDown,
  onPaste,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  wrapperClassName = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  collectionId: string | null;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  wrapperClassName?: string;
}) {
  const availableVars = useAvailableVars(collectionId);
  const [focused, setFocused] = useState(false);
  const [acState, setAcState] = useState<{ prefix: string; start: number } | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [tooltip, setTooltip] = useState<{ varName: string; resolved: boolean; value: string; rect: DOMRect } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // Track last value we set via innerHTML to avoid re-rendering on our own changes
  const lastValueRef = useRef(value);

  // Track whether the last change was from user input (typing) vs external (prop change)
  const isUserInputRef = useRef(false);

  // Undo/redo stack
  const undoStackRef = useRef<{ value: string; cursor: number }[]>([{ value, cursor: 0 }]);
  const redoStackRef = useRef<{ value: string; cursor: number }[]>([]);
  const isUndoRedoRef = useRef(false);

  // Reset undo stack when value changes externally (e.g. tab switch)
  const prevExternalValueRef = useRef(value);
  if (!isUserInputRef.current && !isUndoRedoRef.current && value !== prevExternalValueRef.current) {
    const stack = undoStackRef.current;
    if (!stack.length || stack[stack.length - 1].value !== value) {
      undoStackRef.current = [{ value, cursor: 0 }];
      redoStackRef.current = [];
    }
  }
  prevExternalValueRef.current = value;

  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const varName = target.getAttribute?.("data-var");
    if (varName) {
      const rect = target.getBoundingClientRect();
      setTooltip({
        varName,
        resolved: target.getAttribute("data-resolved") === "true",
        value: target.getAttribute("data-value") || "",
        rect,
      });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const highlightedHTML = useMemo(
    () => buildHighlightedHTML(value, availableVars),
    [value, availableVars],
  );

  // Track the last highlighted HTML we applied so we only re-render when highlighting changes
  const lastHTMLRef = useRef("");
  // Debounce timer for re-highlighting after user stops typing
  const rehighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update innerHTML — skip during active user typing to preserve native undo
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const currentText = getPlainText(el);

    if (isUserInputRef.current && currentText === value) {
      // User is actively typing — don't clobber innerHTML (preserves undo stack)
      // Schedule a debounced re-highlight to update variable colors
      if (rehighlightTimerRef.current) clearTimeout(rehighlightTimerRef.current);
      rehighlightTimerRef.current = setTimeout(() => {
        const el2 = editorRef.current;
        if (!el2) return;
        const offset = saveCursorOffset(el2);
        el2.innerHTML = buildHighlightedHTML(getPlainText(el2), availableVars);
        lastHTMLRef.current = el2.innerHTML;
        restoreCursorOffset(el2, offset);
      }, 300);
      isUserInputRef.current = false;
      return;
    }

    // External value change or highlight change — apply immediately
    if (highlightedHTML !== lastHTMLRef.current || currentText !== value) {
      const offset = focused ? saveCursorOffset(el) : 0;
      el.innerHTML = highlightedHTML;
      lastHTMLRef.current = highlightedHTML;
      lastValueRef.current = value;
      if (focused) {
        restoreCursorOffset(el, Math.min(offset, value.length));
      }
    }

    isUserInputRef.current = false;
  }, [highlightedHTML, value, focused, availableVars]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (rehighlightTimerRef.current) clearTimeout(rehighlightTimerRef.current);
    };
  }, []);

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
      if (!acState || !editorRef.current) return;
      const cursorPos = saveCursorOffset(editorRef.current);
      const before = value.slice(0, acState.start);
      const after = value.slice(cursorPos);
      const completed = `${before}{{${varName}}}${after}`;
      onChange(completed);
      setAcState(null);
      lastValueRef.current = completed;
      // Move cursor after the closing `}}`
      const newPos = acState.start + varName.length + 4;
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = buildHighlightedHTML(completed, availableVars);
          restoreCursorOffset(editorRef.current, newPos);
        }
      });
    },
    [acState, value, onChange, availableVars],
  );

  const applyUndoRedo = useCallback((entry: { value: string; cursor: number }) => {
    isUndoRedoRef.current = true;
    lastValueRef.current = entry.value;
    onChange(entry.value);
    const el = editorRef.current;
    if (el) {
      el.innerHTML = buildHighlightedHTML(entry.value, availableVars);
      lastHTMLRef.current = el.innerHTML;
      restoreCursorOffset(el, entry.cursor);
    }
  }, [onChange, availableVars]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;

    // Undo: Ctrl/Cmd+Z
    if (mod && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      const stack = undoStackRef.current;
      if (stack.length > 1) {
        const current = stack.pop()!;
        redoStackRef.current.push(current);
        applyUndoRedo(stack[stack.length - 1]);
      }
      return;
    }

    // Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
    if (mod && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
      e.preventDefault();
      const redo = redoStackRef.current;
      if (redo.length > 0) {
        const entry = redo.pop()!;
        undoStackRef.current.push(entry);
        applyUndoRedo(entry);
      }
      return;
    }

    // Block Enter (no newlines in single-line input)
    if (e.key === "Enter" && !mod && !(acState && filteredVars.length > 0)) {
      e.preventDefault();
      return;
    }

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

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    const newVal = getPlainText(el);
    const cursorPos = saveCursorOffset(el);
    lastValueRef.current = newVal;
    isUserInputRef.current = true;
    // Push to undo stack (deduplicate consecutive identical values)
    const stack = undoStackRef.current;
    if (!stack.length || stack[stack.length - 1].value !== newVal) {
      stack.push({ value: newVal, cursor: cursorPos });
      // Cap stack size
      if (stack.length > 200) stack.shift();
    }
    redoStackRef.current = [];
    onChange(newVal);
    updateAutocomplete(newVal, cursorPos);
  }, [onChange, updateAutocomplete]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      // Check if the onPaste handler wants to handle it (e.g. curl paste)
      if (onPaste) {
        // Cast since onPaste expects HTMLInputElement but the event shape is the same
        onPaste(e as unknown as React.ClipboardEvent<HTMLInputElement>);
        if (e.defaultPrevented) return;
      }
      // Paste as plain text
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain").replace(/\n/g, " ");
      document.execCommand("insertText", false, text);
    },
    [onPaste],
  );

  const showPlaceholder = !value && placeholder;

  return (
    <div className={`relative ${wrapperClassName}`}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseOver={handleMouseOver}
        onMouseLeave={handleMouseLeave}
        onFocus={() => {
          setFocused(true);
          onFocusProp?.();
          if (editorRef.current) {
            const cursorPos = saveCursorOffset(editorRef.current);
            updateAutocomplete(value, cursorPos);
          }
        }}
        onBlur={() => {
          setFocused(false);
          setAcState(null);
          onBlurProp?.();
        }}
        style={{ scrollbarWidth: "none" }}
        className={`w-full whitespace-nowrap overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden ${className}`}
        spellCheck={false}
        role="textbox"
        data-placeholder={placeholder}
      />
      {showPlaceholder && (
        <div
          className="absolute inset-0 flex items-center pointer-events-none text-text-muted px-3 py-2 text-sm font-mono"
          onClick={() => editorRef.current?.focus()}
        >
          {placeholder}
        </div>
      )}
      {tooltip && (
        <Tooltip anchor={tooltip.rect}>
          {tooltip.resolved ? (
            <>
              <span className="text-text-muted">{tooltip.varName}</span>
              <span className="text-text-muted mx-1">=</span>
              <span className="text-text-primary font-mono">{tooltip.value}</span>
            </>
          ) : (
            <>
              <span className="text-warning">{tooltip.varName}</span>
              <span className="text-text-muted ml-1">not set</span>
            </>
          )}
        </Tooltip>
      )}
      {focused && acState && filteredVars.length > 0 && (
        <AutocompleteDropdown
          items={filteredVars}
          selectedIndex={selectedIdx}
          onSelect={completeVar}
          anchorRef={editorRef}
        />
      )}
    </div>
  );
}
