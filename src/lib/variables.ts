import { v4 as uuidv4 } from "uuid";

const MAX_DEPTH = 10;

// ── Generators for {{generate 'type'}} syntax ───────────────────────

const firstNames = ["James", "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Lucas", "Mia"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Wilson", "Taylor"];
const domains = ["example.com", "test.io", "demo.org", "sample.net", "mock.dev"];
const streets = ["Main St", "Oak Ave", "Elm Dr", "Pine Rd", "Maple Ln", "Cedar Blvd", "Park Way", "Lake Dr"];
const cities = ["Springfield", "Portland", "Austin", "Denver", "Salem", "Madison", "Clinton", "Franklin"];
const words = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua"];
const tlds = ["com", "org", "net", "io", "dev"];
const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e", "#16a085", "#c0392b"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomString(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

export const generators: Record<string, { fn: () => string; description: string }> = {
  uuid: { fn: () => uuidv4(), description: "(generated UUID)" },
  name: { fn: () => `${pick(firstNames)} ${pick(lastNames)}`, description: "(random full name)" },
  email: { fn: () => `${pick(firstNames).toLowerCase()}.${pick(lastNames).toLowerCase()}@${pick(domains)}`, description: "(random email)" },
  timestamp: { fn: () => Math.floor(Date.now() / 1000).toString(), description: "(unix timestamp)" },
  isoTimestamp: { fn: () => new Date().toISOString(), description: "(ISO datetime)" },
  randomInt: { fn: () => Math.floor(Math.random() * 1000000).toString(), description: "(random 0-999999)" },
  string: { fn: () => randomString(16), description: "(random 16-char string)" },
  boolean: { fn: () => (Math.random() > 0.5 ? "true" : "false"), description: "(random true/false)" },
  address: { fn: () => `${Math.floor(Math.random() * 9999) + 1} ${pick(streets)}, ${pick(cities)}`, description: "(random address)" },
  phone: { fn: () => `+1${Math.floor(2000000000 + Math.random() * 8000000000)}`, description: "(random phone)" },
  sentence: { fn: () => { const len = 5 + Math.floor(Math.random() * 8); const s = Array.from({ length: len }, () => pick(words)).join(" "); return s.charAt(0).toUpperCase() + s.slice(1) + "."; }, description: "(random sentence)" },
  paragraph: { fn: () => { const count = 3 + Math.floor(Math.random() * 3); return Array.from({ length: count }, () => generators.sentence.fn()).join(" "); }, description: "(random paragraph)" },
  url: { fn: () => `https://${pick(lastNames).toLowerCase()}.${pick(tlds)}/${randomString(6)}`, description: "(random URL)" },
  ip: { fn: () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join("."), description: "(random IPv4)" },
  color: { fn: () => pick(colors), description: "(random hex color)" },
  date: { fn: () => { const d = new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)); return d.toISOString().split("T")[0]; }, description: "(random date YYYY-MM-DD)" },
};

// Regex to match {{generate 'type'}} — supports single or double quotes
const generateRegex = /^generate\s+['"](\w+)['"]\s*$/;

export function resolveVariables(
  template: string,
  contexts: Record<string, string>[],
): string {
  let result = template;
  let depth = 0;

  while (depth < MAX_DEPTH && result.includes("{{")) {
    let changed = false;
    result = result.replace(/\{\{([^}]+)\}\}/g, (_match, varName: string) => {
      const trimmed = varName.trim();

      // Check generate syntax: {{generate 'type'}}
      const genMatch = trimmed.match(generateRegex);
      if (genMatch) {
        const genType = genMatch[1];
        if (genType in generators) {
          changed = true;
          return generators[genType].fn();
        }
        // Unknown generator — leave unresolved
        return `{{${trimmed}}}`;
      }

      // Check contexts in order (highest priority first)
      for (const ctx of contexts) {
        if (trimmed in ctx) {
          changed = true;
          return ctx[trimmed];
        }
      }

      // Leave unresolved
      return `{{${trimmed}}}`;
    });

    if (!changed) break;
    depth++;
  }

  return result;
}

export function resolveAllFields(
  obj: unknown,
  contexts: Record<string, string>[],
): unknown {
  if (typeof obj === "string") {
    return resolveVariables(obj, contexts);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveAllFields(item, contexts));
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveAllFields(value, contexts);
    }
    return result;
  }
  return obj;
}
