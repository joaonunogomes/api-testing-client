/**
 * Converts Postman pm.* scripts to the ac.* scripting API.
 *
 * Handles:
 * - pm.environment.set/get -> ac.env.set/get
 * - pm.globals.set/get -> ac.env.set/get
 * - pm.variables.set/get -> ac.setVar/getVar
 * - pm.collectionVariables.set/get -> ac.setVar/getVar
 * - pm.test(name, fn) -> ac.test(name, fn)
 * - pm.expect(val) -> ac.expect(val)
 * - pm.response.json() -> res.json()
 * - pm.response.code -> res.status
 * - pm.response.text() -> res.body
 * - pm.response.headers -> res.headers
 * - pm.response.responseTime -> (commented, not supported)
 * - pm.response.to.have.status(code) -> ac.expect(res.status).toBe(code)
 * - pm.response.to.be.ok -> ac.expect(res.status).toBe(200)
 * - Chai-style .to.equal/.to.eql/.to.be.* chains
 * - pm.sendRequest -> commented out (not supported)
 */

interface ConversionResult {
  script: string;
  warnings: string[];
}

const replacements: [RegExp, string][] = [
  // Variable access — specific namespaces first
  [/pm\.environment\.set\(/g, "ac.env.set("],
  [/pm\.environment\.get\(/g, "ac.env.get("],
  [/pm\.globals\.set\(/g, "ac.env.set("],
  [/pm\.globals\.get\(/g, "ac.env.get("],
  [/pm\.collectionVariables\.set\(/g, "ac.setVar("],
  [/pm\.collectionVariables\.get\(/g, "ac.getVar("],
  [/pm\.variables\.set\(/g, "ac.setVar("],
  [/pm\.variables\.get\(/g, "ac.getVar("],

  // Testing
  [/pm\.test\(/g, "ac.test("],
  [/pm\.expect\(/g, "ac.expect("],

  // Response — method calls before property access
  [/pm\.response\.json\(\)/g, "res.json()"],
  [/pm\.response\.text\(\)/g, "res.body"],
  [/pm\.response\.code/g, "res.status"],
  [/pm\.response\.status/g, "res.status"],
  [/pm\.response\.headers/g, "res.headers"],
  [/pm\.response\.responseTime/g, "res.time /* responseTime */"],

  // jsonData pattern — common in Postman scripts
  [/var\s+jsonData\s*=\s*pm\.response\.json\(\)/g, "var jsonData = res.json()"],
  [/let\s+jsonData\s*=\s*pm\.response\.json\(\)/g, "var jsonData = res.json()"],
  [/const\s+jsonData\s*=\s*pm\.response\.json\(\)/g, "var jsonData = res.json()"],
];

// Chai-style assertion conversions (applied after basic replacements)
const chaiReplacements: [RegExp, string | ((match: string, ...groups: string[]) => string)][] = [
  // pm.response.to.have.status(code) -> ac.expect(res.status).toBe(code)
  [
    /pm\.response\.to\.have\.status\((\d+)\)/g,
    "ac.expect(res.status).toBe($1)",
  ],
  [
    /pm\.response\.to\.have\.status\(([^)]+)\)/g,
    "ac.expect(res.status).toBe($1)",
  ],

  // pm.response.to.be.ok -> ac.expect(res.status).toBe(200)
  [/pm\.response\.to\.be\.ok\b/g, "ac.expect(res.status).toBe(200)"],

  // .to.have.property("key") -> .toBeDefined() with comment
  [
    /\.to\.have\.property\(([^)]+)\)/g,
    (_match: string, prop: string) =>
      `.toBeDefined() /* had .to.have.property(${prop}) */`,
  ],

  // .to.equal(val) / .to.eql(val) / .to.deep.equal(val)
  [/\.to\.deep\.equal\(([^)]+)\)/g, ".toEqual($1)"],
  [/\.to\.eql\(([^)]+)\)/g, ".toEqual($1)"],
  [/\.to\.equal\(([^)]+)\)/g, ".toBe($1)"],
  [/\.to\.be\.equal\(([^)]+)\)/g, ".toBe($1)"],

  // .to.be.a("type") -> leave as comment
  [/\.to\.be\.a\(([^)]+)\)/g, ".toBeDefined() /* was .to.be.a($1) */"],
  [
    /\.to\.be\.an\(([^)]+)\)/g,
    ".toBeDefined() /* was .to.be.an($1) */",
  ],

  // .to.be.true / .to.be.false
  [/\.to\.be\.true\b/g, ".toBe(true)"],
  [/\.to\.be\.false\b/g, ".toBe(false)"],
  [/\.to\.be\.null\b/g, ".toBe(null)"],
  [/\.to\.be\.undefined\b/g, ".toBe(undefined)"],

  // .to.be.above(n) / .to.be.below(n) / .to.be.at.least(n) / .to.be.at.most(n)
  [
    /\.to\.be\.above\(([^)]+)\)/g,
    ".toBeTruthy() /* was .to.be.above($1) */",
  ],
  [
    /\.to\.be\.below\(([^)]+)\)/g,
    ".toBeTruthy() /* was .to.be.below($1) */",
  ],
  [
    /\.to\.be\.at\.least\(([^)]+)\)/g,
    ".toBeTruthy() /* was .to.be.at.least($1) */",
  ],

  // .to.include(val) / .to.contain(val)
  [/\.to\.include\(([^)]+)\)/g, ".toContain($1)"],
  [/\.to\.contain\(([^)]+)\)/g, ".toContain($1)"],

  // .to.have.length... patterns
  [
    /\.to\.have\.length\(([^)]+)\)/g,
    ".toBeTruthy() /* was .to.have.length($1) */",
  ],
  [
    /\.to\.have\.lengthOf\(([^)]+)\)/g,
    ".toBeTruthy() /* was .to.have.lengthOf($1) */",
  ],

  // .to.not.be.empty / .to.be.empty
  [/\.to\.not\.be\.empty\b/g, ".toBeTruthy()"],
  [/\.to\.be\.empty\b/g, ".toBeTruthy() /* was .to.be.empty */"],

  // Generic .to.not patterns — negate
  [
    /\.to\.not\.equal\(([^)]+)\)/g,
    ".toBeTruthy() /* was .to.not.equal($1) */",
  ],

  // Clean up remaining .to.be. chains that weren't caught
  [/\.to\.be\b(?!\.|$)/g, ""],
];

// Patterns that can't be converted — comment them out with explanation
const unsupportedPatterns: [RegExp, string][] = [
  [
    /pm\.sendRequest\(/g,
    "/* [NOT SUPPORTED] pm.sendRequest( — use the request chaining feature instead */\n// pm.sendRequest(",
  ],
  [
    /pm\.iterationData\./g,
    "/* [NOT SUPPORTED] pm.iterationData */\n// pm.iterationData.",
  ],
  [
    /pm\.info\./g,
    "/* [NOT SUPPORTED] pm.info */\n// pm.info.",
  ],
  [
    /pm\.execution\./g,
    "/* [NOT SUPPORTED] pm.execution */\n// pm.execution.",
  ],
  [
    /pm\.visualizer\./g,
    "/* [NOT SUPPORTED] pm.visualizer */\n// pm.visualizer.",
  ],
  [
    /pm\.cookies\./g,
    "/* [NOT SUPPORTED] pm.cookies */\n// pm.cookies.",
  ],
];

export function convertPostmanScript(script: string): ConversionResult {
  if (!script || !script.trim()) {
    return { script: "", warnings: [] };
  }

  const warnings: string[] = [];
  let result = script;

  // Check for unsupported patterns first
  for (const [pattern, replacement] of unsupportedPatterns) {
    if (pattern.test(result)) {
      const featureName = replacement.match(/\[NOT SUPPORTED\] ([^*]+)/)?.[1]?.trim();
      if (featureName) {
        warnings.push(`"${featureName}" is not supported and was commented out`);
      }
      result = result.replace(pattern, replacement);
    }
  }

  // Apply basic replacements
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  // Apply Chai-style assertion conversions
  for (const [pattern, replacement] of chaiReplacements) {
    if (typeof replacement === "string") {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, replacement as (...args: string[]) => string);
    }
  }

  // Check for any remaining pm.* references that weren't converted
  const remainingPm = result.match(/pm\.\w+/g);
  if (remainingPm) {
    const unique = [...new Set(remainingPm)];
    for (const ref of unique) {
      warnings.push(`"${ref}" was not automatically converted — please review manually`);
    }
  }

  // Clean up double blank lines that may result from commenting out
  result = result.replace(/\n{3,}/g, "\n\n");

  return { script: result, warnings };
}

/**
 * Convert a Postman event script (array of lines) to a single script string.
 */
export function convertPostmanEventScript(
  execLines: string[] | undefined,
): { script: string; warnings: string[] } {
  if (!execLines || execLines.length === 0) {
    return { script: "", warnings: [] };
  }
  return convertPostmanScript(execLines.join("\n"));
}
