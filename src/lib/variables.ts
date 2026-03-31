import { v4 as uuidv4 } from "uuid";

const MAX_DEPTH = 10;

const builtInVariables: Record<string, () => string> = {
  $guid: () => uuidv4(),
  $timestamp: () => Math.floor(Date.now() / 1000).toString(),
  $isoTimestamp: () => new Date().toISOString(),
  $randomInt: () => Math.floor(Math.random() * 1000000).toString(),
  $randomCompanyName: () => {
    const names = [
      "Acme Corp",
      "TechVentures",
      "BlueStar Inc",
      "NovaTech",
      "Quantum Labs",
      "Apex Solutions",
      "Horizon Digital",
      "PrimeWave",
    ];
    return names[Math.floor(Math.random() * names.length)];
  },
};

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

      // Check built-in variables
      if (trimmed in builtInVariables) {
        changed = true;
        return builtInVariables[trimmed]();
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
