"use client";

import { useMemo, useState, useEffect } from "react";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  autocompletion,
  type CompletionContext,
  type Completion,
} from "@codemirror/autocomplete";
import type CodeMirrorType from "@uiw/react-codemirror";

interface ScriptCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: string;
  isPostResponse?: boolean;
}

// Completion definitions for the scripting API
const acCompletions: Completion[] = [
  {
    label: "ac.env.set",
    type: "function",
    detail: "(name, value)",
    info: "Set an environment variable (session-scoped)",
    apply: 'ac.env.set("", "")',
  },
  {
    label: "ac.env.get",
    type: "function",
    detail: "(name)",
    info: "Get an environment variable",
    apply: 'ac.env.get("")',
  },
  {
    label: "ac.setVar",
    type: "function",
    detail: "(name, value)",
    info: "Set a collection-scoped variable",
    apply: 'ac.setVar("", "")',
  },
  {
    label: "ac.getVar",
    type: "function",
    detail: "(name)",
    info: "Get a collection-scoped variable",
    apply: 'ac.getVar("")',
  },
  {
    label: "ac.test",
    type: "function",
    detail: "(name, fn)",
    info: "Define a test assertion",
    apply: 'ac.test("", function() {\n  \n});',
  },
  {
    label: "ac.expect",
    type: "function",
    detail: "(value)",
    info: "Create an assertion chain: .toBe(), .toEqual(), .toBeDefined(), .toBeTruthy(), .toContain()",
    apply: "ac.expect()",
  },
];

const envCompletions: Completion[] = [
  {
    label: "set",
    type: "function",
    detail: "(name, value)",
    info: "Set an environment variable (session-scoped)",
    apply: 'set("", "")',
  },
  {
    label: "get",
    type: "function",
    detail: "(name)",
    info: "Get an environment variable",
    apply: 'get("")',
  },
];

const resCompletions: Completion[] = [
  {
    label: "res.status",
    type: "property",
    detail: "number",
    info: "HTTP status code (e.g. 200)",
  },
  {
    label: "res.headers",
    type: "property",
    detail: "Record<string, string>",
    info: "Response headers object",
  },
  {
    label: "res.body",
    type: "property",
    detail: "string",
    info: "Raw response body string",
  },
  {
    label: "res.json",
    type: "function",
    detail: "()",
    info: "Parse response body as JSON",
    apply: "res.json()",
  },
];

const expectCompletions: Completion[] = [
  {
    label: "toBe",
    type: "function",
    detail: "(expected)",
    info: "Strict equality check (===)",
    apply: "toBe()",
  },
  {
    label: "toEqual",
    type: "function",
    detail: "(expected)",
    info: "Deep equality check (JSON comparison)",
    apply: "toEqual()",
  },
  {
    label: "toBeDefined",
    type: "function",
    detail: "()",
    info: "Check value is not undefined",
    apply: "toBeDefined()",
  },
  {
    label: "toBeTruthy",
    type: "function",
    detail: "()",
    info: "Check value is truthy",
    apply: "toBeTruthy()",
  },
  {
    label: "toContain",
    type: "function",
    detail: "(expected)",
    info: "Check string contains substring",
    apply: "toContain()",
  },
];

const consoleCompletions: Completion[] = [
  {
    label: "console.log",
    type: "function",
    detail: "(...args)",
    info: "Log output (shown in Console tab)",
    apply: "console.log()",
  },
  {
    label: "console.warn",
    type: "function",
    detail: "(...args)",
    info: "Log a warning",
    apply: "console.warn()",
  },
  {
    label: "console.error",
    type: "function",
    detail: "(...args)",
    info: "Log an error",
    apply: "console.error()",
  },
];

// Top-level completions when typing from scratch
const topLevelCompletions: Completion[] = [
  { label: "ac", type: "variable", detail: "API Client scripting object", boost: 2 },
  { label: "console", type: "variable", detail: "Console output" },
  { label: "var", type: "keyword" },
  { label: "const", type: "keyword" },
  { label: "let", type: "keyword" },
  { label: "function", type: "keyword" },
  { label: "if", type: "keyword" },
];

const topLevelWithRes: Completion[] = [
  ...topLevelCompletions,
  { label: "res", type: "variable", detail: "Response object", boost: 1 },
];

function scriptCompletions(isPostResponse: boolean) {
  return (context: CompletionContext) => {
    // Get the text before the cursor on the current line
    const line = context.state.doc.lineAt(context.pos);
    const textBefore = line.text.slice(0, context.pos - line.from);

    // After .toBe(), .toEqual(), etc. pattern: expect(...).<cursor>
    const expectChainMatch = textBefore.match(/\.expect\([^)]*\)\.\w*$/);
    if (expectChainMatch) {
      const word = context.matchBefore(/\w*/);
      return {
        from: word?.from ?? context.pos,
        options: expectCompletions,
        validFor: /^\w*$/,
      };
    }

    // After "ac.env."
    if (textBefore.match(/ac\.env\.\w*$/)) {
      const word = context.matchBefore(/\w*/);
      return {
        from: word?.from ?? context.pos,
        options: envCompletions,
        validFor: /^\w*$/,
      };
    }

    // After "ac."
    if (textBefore.match(/ac\.\w*$/)) {
      const word = context.matchBefore(/ac\.\w*/);
      return {
        from: word?.from ?? context.pos,
        options: acCompletions,
        validFor: /^ac\.\w*$/,
      };
    }

    // After "res."
    if (isPostResponse && textBefore.match(/res\.\w*$/)) {
      const word = context.matchBefore(/res\.\w*/);
      return {
        from: word?.from ?? context.pos,
        options: resCompletions,
        validFor: /^res\.\w*$/,
      };
    }

    // After "console."
    if (textBefore.match(/console\.\w*$/)) {
      const word = context.matchBefore(/console\.\w*/);
      return {
        from: word?.from ?? context.pos,
        options: consoleCompletions,
        validFor: /^console\.\w*$/,
      };
    }

    // Top-level: beginning of expression or after whitespace/semicolon/newline
    const word = context.matchBefore(/\w+/);
    if (word) {
      return {
        from: word.from,
        options: isPostResponse ? topLevelWithRes : topLevelCompletions,
        validFor: /^\w*$/,
      };
    }

    // Explicit completion request (Ctrl+Space)
    if (context.explicit) {
      return {
        from: context.pos,
        options: isPostResponse ? topLevelWithRes : topLevelCompletions,
      };
    }

    return null;
  };
}

export function ScriptCodeEditor({
  value,
  onChange,
  placeholder,
  height = "128px",
  isPostResponse = false,
}: ScriptCodeEditorProps) {
  const [CodeMirror, setCodeMirror] = useState<typeof CodeMirrorType | null>(null);

  useEffect(() => {
    import("@uiw/react-codemirror").then((mod) => setCodeMirror(() => mod.default));
  }, []);

  const extensions = useMemo(
    () => [
      javascript(),
      autocompletion({
        override: [scriptCompletions(isPostResponse)],
        activateOnTyping: true,
        icons: true,
      }),
    ],
    [isPostResponse],
  );

  if (!CodeMirror) {
    return (
      <div
        className="bg-bg-primary border border-border rounded p-3 text-sm text-text-muted font-mono"
        style={{ height }}
      >
        Loading editor...
      </div>
    );
  }

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      height={height}
      theme={oneDark}
      extensions={extensions}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
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
  );
}
