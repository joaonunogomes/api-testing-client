import { Agent, fetch as undiciFetch } from "undici";
import type {
  AuthConfig,
  Collection,
  Environment,
  ExecuteResponse,
  KeyValuePair,
  RequestFile,
  TestResult,
} from "./types";
import { normalizeKVPairs } from "./types";
import { resolveVariables } from "./variables";

// Disable TLS verification for outgoing test requests (same as Postman/Insomnia)
const tlsAgent = new Agent({
  connect: { rejectUnauthorized: false },
});

function buildVariableContexts(
  collection: Collection | null,
  environment: Environment | null,
  runtimeVars: Record<string, string>,
): Record<string, string>[] {
  // Order: runtime (highest), env secrets, env variables, collection variables
  const contexts: Record<string, string>[] = [runtimeVars];

  if (environment) {
    contexts.push(environment.secrets);
    contexts.push(environment.variables);
  }

  if (collection?.variables) {
    contexts.push(collection.variables);
  }

  return contexts;
}

function applyAuth(
  auth: AuthConfig | undefined,
  headers: Record<string, string>,
  url: URL,
  contexts: Record<string, string>[],
): void {
  if (!auth || auth.type === "none") return;

  switch (auth.type) {
    case "bearer": {
      const token = resolveVariables(auth.token, contexts);
      headers["Authorization"] = `Bearer ${token}`;
      break;
    }
    case "basic": {
      const username = resolveVariables(auth.username, contexts);
      const password = resolveVariables(auth.password, contexts);
      const encoded = Buffer.from(`${username}:${password}`).toString(
        "base64",
      );
      headers["Authorization"] = `Basic ${encoded}`;
      break;
    }
    case "apikey": {
      const key = resolveVariables(auth.key, contexts);
      const value = resolveVariables(auth.value, contexts);
      if (auth.in === "query") {
        url.searchParams.set(key, value);
      } else {
        headers[key] = value;
      }
      break;
    }
    case "oauth2":
      // OAuth2 tokens are injected via runtime variables
      break;
  }
}

function runScript(
  script: string,
  context: {
    res?: { status: number; headers: Record<string, string>; body: string };
    runtimeVars: Record<string, string>;
    envOverrides: Record<string, string>;
  },
): { testResults: TestResult[]; consoleOutput: string[] } {
  const testResults: TestResult[] = [];
  const consoleOutput: string[] = [];

  const ac = {
    env: {
      set: (name: string, value: string) => {
        context.envOverrides[name] = String(value);
      },
      get: (name: string) => context.envOverrides[name] || "",
    },
    setVar: (name: string, value: string) => {
      context.runtimeVars[name] = String(value);
    },
    getVar: (name: string) => context.runtimeVars[name] || "",
    test: (name: string, fn: () => void) => {
      try {
        fn();
        testResults.push({ name, passed: true });
      } catch (e: unknown) {
        testResults.push({
          name,
          passed: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    expect: (actual: unknown) => ({
      toBe: (expected: unknown) => {
        if (actual !== expected)
          throw new Error(`Expected ${expected}, got ${actual}`);
      },
      toEqual: (expected: unknown) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          throw new Error(
            `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
          );
      },
      toBeDefined: () => {
        if (actual === undefined) throw new Error("Expected defined value");
      },
      toBeTruthy: () => {
        if (!actual) throw new Error(`Expected truthy, got ${actual}`);
      },
      toContain: (expected: unknown) => {
        if (typeof actual === "string" && typeof expected === "string") {
          if (!actual.includes(expected))
            throw new Error(`Expected "${actual}" to contain "${expected}"`);
        }
      },
    }),
  };

  const res = context.res
    ? {
        status: context.res.status,
        headers: context.res.headers,
        body: context.res.body,
        json: () => {
          try {
            return JSON.parse(context.res!.body);
          } catch {
            return null;
          }
        },
      }
    : undefined;

  const mockConsole = {
    log: (...args: unknown[]) =>
      consoleOutput.push(args.map(String).join(" ")),
    warn: (...args: unknown[]) =>
      consoleOutput.push(`[warn] ${args.map(String).join(" ")}`),
    error: (...args: unknown[]) =>
      consoleOutput.push(`[error] ${args.map(String).join(" ")}`),
  };

  try {
    const fn = new Function("ac", "res", "console", script);
    fn(ac, res, mockConsole);
  } catch (e: unknown) {
    consoleOutput.push(
      `[script error] ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return { testResults, consoleOutput };
}

function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): string {
  const parts: string[] = ["curl"];

  if (method !== "GET") {
    parts.push(`-X ${method}`);
  }

  parts.push(`'${url.replace(/'/g, "'\\''")}'`);

  for (const [key, value] of Object.entries(headers)) {
    parts.push(`-H '${key}: ${value.replace(/'/g, "'\\''")}'`);
  }

  if (body) {
    parts.push(`-d '${body.replace(/'/g, "'\\''")}'`);
  }

  return parts.join(" \\\n  ");
}

export async function executeRequest(
  requestFile: RequestFile,
  collection: Collection | null,
  environment: Environment | null,
  oauth2Token?: string,
  initialRuntimeVars?: Record<string, string>,
  initialEnvOverrides?: Record<string, string>,
): Promise<ExecuteResponse> {
  const runtimeVars: Record<string, string> = { ...initialRuntimeVars };
  const envOverrides: Record<string, string> = { ...initialEnvOverrides };

  if (oauth2Token) {
    runtimeVars["oauth2Token"] = oauth2Token;
  }

  const contexts = buildVariableContexts(
    collection,
    environment,
    { ...runtimeVars, ...envOverrides },
  );

  // Run pre-request scripts
  let allConsoleOutput: string[] = [];
  let allTestResults: TestResult[] = [];

  if (collection?.scripts?.["pre-request"]) {
    const result = runScript(collection.scripts["pre-request"], {
      runtimeVars,
      envOverrides,
    });
    allConsoleOutput.push(...result.consoleOutput);
  }

  if (requestFile.scripts?.["pre-request"]) {
    const result = runScript(requestFile.scripts["pre-request"], {
      runtimeVars,
      envOverrides,
    });
    allConsoleOutput.push(...result.consoleOutput);
  }

  // Rebuild contexts after scripts may have modified vars
  const updatedContexts = buildVariableContexts(
    collection,
    environment,
    { ...runtimeVars, ...envOverrides },
  );

  // Resolve URL
  let resolvedUrl = resolveVariables(
    requestFile.request.url,
    updatedContexts,
  );

  // Build headers
  const headers: Record<string, string> = {};

  // Apply collection default headers
  if (collection?.defaults?.headers) {
    for (const [k, v] of Object.entries(collection.defaults.headers)) {
      headers[resolveVariables(k, updatedContexts)] = resolveVariables(
        v,
        updatedContexts,
      );
    }
  }

  // Apply request headers (override defaults)
  const reqHeaders = normalizeKVPairs(requestFile.request.headers);
  for (const pair of reqHeaders) {
    if (pair.enabled === false || !pair.key) continue;
    const resolvedValue = resolveVariables(pair.value, updatedContexts);
    // Skip masked values
    if (resolvedValue === "••••••") continue;
    headers[resolveVariables(pair.key, updatedContexts)] = resolvedValue;
  }

  // Build URL with params
  const url = new URL(resolvedUrl);
  const reqParams = normalizeKVPairs(requestFile.request.params);
  for (const pair of reqParams) {
    if (pair.enabled === false || !pair.key) continue;
    url.searchParams.set(
      resolveVariables(pair.key, updatedContexts),
      resolveVariables(pair.value, updatedContexts),
    );
  }

  // Apply auth
  const auth =
    requestFile.request.auth || collection?.defaults?.auth;
  if (auth) {
    if (auth.type === "oauth2" && oauth2Token) {
      headers["Authorization"] = `Bearer ${oauth2Token}`;
      if (auth.tokenVariable) {
        const varName = auth.tokenVariable.replace(/^\{\{|\}\}$/g, "");
        runtimeVars[varName] = oauth2Token;
      }
    } else {
      applyAuth(auth, headers, url, updatedContexts);
    }
  }

  // Build body
  let body: string | undefined;
  if (requestFile.request.body && requestFile.request.body.type !== "none") {
    const bodyDef = requestFile.request.body;
    if (bodyDef.content) {
      body = resolveVariables(bodyDef.content, updatedContexts);
    }
    if (bodyDef.type === "json" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    } else if (bodyDef.type === "xml" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/xml";
    } else if (bodyDef.type === "form" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    } else if (bodyDef.type === "text" && !headers["Content-Type"]) {
      headers["Content-Type"] = "text/plain";
    }
  }

  // Generate curl command
  const sendBody =
    requestFile.request.method !== "GET" &&
    requestFile.request.method !== "HEAD"
      ? body
      : undefined;
  const curl = buildCurl(
    requestFile.request.method,
    url.toString(),
    headers,
    sendBody,
  );

  // Execute request
  const startTime = performance.now();
  let response: Response;
  try {
    response = await undiciFetch(url.toString(), {
      method: requestFile.request.method,
      headers,
      body: sendBody,
      dispatcher: tlsAgent,
    }) as unknown as Response;
  } catch (e: unknown) {
    return {
      status: 0,
      statusText: e instanceof Error ? e.message : "Request failed",
      headers: {},
      body: e instanceof Error ? e.message : "Request failed",
      time: Math.round(performance.now() - startTime),
      size: 0,
      consoleOutput: allConsoleOutput,
      curl,
    };
  }

  const elapsed = Math.round(performance.now() - startTime);
  const responseBody = await response.text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  // Run post-response scripts
  const scriptContext = {
    res: {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    },
    runtimeVars,
    envOverrides,
  };

  if (collection?.scripts?.["post-response"]) {
    const result = runScript(
      collection.scripts["post-response"],
      scriptContext,
    );
    allConsoleOutput.push(...result.consoleOutput);
    allTestResults.push(...result.testResults);
  }

  if (requestFile.scripts?.["post-response"]) {
    const result = runScript(
      requestFile.scripts["post-response"],
      scriptContext,
    );
    allConsoleOutput.push(...result.consoleOutput);
    allTestResults.push(...result.testResults);
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: responseBody,
    time: elapsed,
    size: new TextEncoder().encode(responseBody).length,
    testResults: allTestResults.length > 0 ? allTestResults : undefined,
    consoleOutput: allConsoleOutput.length > 0 ? allConsoleOutput : undefined,
    curl,
    runtimeVars: Object.keys(runtimeVars).length > 0 ? runtimeVars : undefined,
    envOverrides: Object.keys(envOverrides).length > 0 ? envOverrides : undefined,
  };
}
