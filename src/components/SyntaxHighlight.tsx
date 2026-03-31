"use client";

import { useMemo } from "react";

interface Token {
  text: string;
  type: "key" | "string" | "number" | "boolean" | "null" | "brace" | "plain";
}

function tokenizeJson(json: string): Token[] {
  const tokens: Token[] = [];
  const regex =
    /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|([-+]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],])|([^\s])/g;

  let match;
  let lastIndex = 0;

  while ((match = regex.exec(json)) !== null) {
    // Whitespace between tokens
    if (match.index > lastIndex) {
      tokens.push({ text: json.slice(lastIndex, match.index), type: "plain" });
    }

    if (match[1]) {
      // Key: "key":
      tokens.push({ text: match[1], type: "key" });
    } else if (match[2]) {
      tokens.push({ text: match[2], type: "string" });
    } else if (match[3]) {
      tokens.push({ text: match[3], type: "number" });
    } else if (match[4]) {
      tokens.push({ text: match[4], type: "boolean" });
    } else if (match[5]) {
      tokens.push({ text: match[5], type: "null" });
    } else if (match[6]) {
      tokens.push({ text: match[6], type: "brace" });
    } else if (match[7]) {
      tokens.push({ text: match[7], type: "plain" });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < json.length) {
    tokens.push({ text: json.slice(lastIndex), type: "plain" });
  }

  return tokens;
}

const TYPE_CLASSES: Record<Token["type"], string> = {
  key: "text-accent",
  string: "text-success",
  number: "text-method-patch",
  boolean: "text-method-post",
  null: "text-text-muted",
  brace: "text-text-muted",
  plain: "text-text-primary",
};

export function JsonHighlight({ code }: { code: string }) {
  const tokens = useMemo(() => tokenizeJson(code), [code]);

  return (
    <pre className="p-3 text-sm font-mono whitespace-pre-wrap break-words">
      {tokens.map((token, i) => (
        <span key={i} className={TYPE_CLASSES[token.type]}>
          {token.text}
        </span>
      ))}
    </pre>
  );
}
