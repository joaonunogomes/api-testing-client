"use client";

import { useState } from "react";
import type { Scripts } from "@/lib/types";
import { ScriptCodeEditor } from "./ScriptCodeEditor";

interface ScriptsEditorProps {
  scripts: Scripts | undefined;
  onChange: (scripts: Scripts) => void;
}

function ScriptDocs() {
  return (
    <div className="text-xs text-text-secondary font-mono space-y-4 p-3 bg-bg-tertiary rounded border border-border leading-relaxed">
      <div>
        <h4 className="text-text-primary font-semibold mb-1.5 font-sans text-sm">
          Variables
        </h4>
        <table className="w-full">
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">ac.env.set(name, value)</td>
              <td className="py-1 text-text-muted">Set an environment variable (session-scoped)</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">ac.env.get(name)</td>
              <td className="py-1 text-text-muted">Get an environment variable</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">ac.setVar(name, value)</td>
              <td className="py-1 text-text-muted">Set a collection-scoped variable</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">ac.getVar(name)</td>
              <td className="py-1 text-text-muted">Get a collection-scoped variable</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="text-text-primary font-semibold mb-1.5 font-sans text-sm">
          Response <span className="font-normal text-text-muted">(post-response only)</span>
        </h4>
        <table className="w-full">
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">res.status</td>
              <td className="py-1 text-text-muted">HTTP status code (e.g. 200)</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">res.headers</td>
              <td className="py-1 text-text-muted">Response headers object</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">res.body</td>
              <td className="py-1 text-text-muted">Raw response body string</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">res.json()</td>
              <td className="py-1 text-text-muted">Parse response body as JSON</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="text-text-primary font-semibold mb-1.5 font-sans text-sm">
          Testing
        </h4>
        <table className="w-full">
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">ac.test(name, fn)</td>
              <td className="py-1 text-text-muted">Define a test assertion</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">ac.expect(value)</td>
              <td className="py-1 text-text-muted">
                Assertion chain: <span className="text-accent">.toBe()</span>{" "}
                <span className="text-accent">.toEqual()</span>{" "}
                <span className="text-accent">.toBeDefined()</span>{" "}
                <span className="text-accent">.toBeTruthy()</span>{" "}
                <span className="text-accent">.toContain()</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="text-text-primary font-semibold mb-1.5 font-sans text-sm">
          Console
        </h4>
        <table className="w-full">
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">console.log(...args)</td>
              <td className="py-1 text-text-muted">Log output (shown in Console tab)</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">console.warn(...args)</td>
              <td className="py-1 text-text-muted">Log a warning</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-accent whitespace-nowrap">console.error(...args)</td>
              <td className="py-1 text-text-muted">Log an error</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="text-text-primary font-semibold mb-1.5 font-sans text-sm">
          Examples
        </h4>
        <div className="space-y-2">
          <div>
            <p className="text-text-muted mb-1">Extract a value from the response:</p>
            <pre className="bg-bg-primary rounded p-2 text-text-primary overflow-x-auto">
{`var data = res.json();
ac.env.set("userId", data.id);`}
            </pre>
          </div>
          <div>
            <p className="text-text-muted mb-1">Write a test:</p>
            <pre className="bg-bg-primary rounded p-2 text-text-primary overflow-x-auto">
{`ac.test("Status is 200", function() {
  ac.expect(res.status).toBe(200);
});

ac.test("Has items", function() {
  var data = res.json();
  ac.expect(data.length).toBeTruthy();
});`}
            </pre>
          </div>
          <div>
            <p className="text-text-muted mb-1">Set a variable before request:</p>
            <pre className="bg-bg-primary rounded p-2 text-text-primary overflow-x-auto">
{`ac.env.set("token", "abc123");
console.log("pre-request ran");`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScriptsEditor({ scripts, onChange }: ScriptsEditorProps) {
  const [showDocs, setShowDocs] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowDocs(!showDocs)}
          className="text-xs text-accent hover:text-accent-hover transition-colors"
        >
          {showDocs ? "Hide" : "Show"} scripting reference
        </button>
      </div>

      {showDocs && <ScriptDocs />}

      <div>
        <label className="block text-xs text-text-muted mb-1.5">
          Pre-request Script
        </label>
        <ScriptCodeEditor
          value={scripts?.["pre-request"] || ""}
          onChange={(val) =>
            onChange({
              ...scripts,
              "pre-request": val || undefined,
            })
          }
          placeholder="// Runs before the request is sent&#10;// Available: ac, console"
          isPostResponse={false}
        />
      </div>

      <div>
        <label className="block text-xs text-text-muted mb-1.5">
          Post-response Script
        </label>
        <ScriptCodeEditor
          value={scripts?.["post-response"] || ""}
          onChange={(val) =>
            onChange({
              ...scripts,
              "post-response": val || undefined,
            })
          }
          placeholder="// Runs after the response is received&#10;// Available: ac, res, console"
          isPostResponse={true}
        />
      </div>
    </div>
  );
}
