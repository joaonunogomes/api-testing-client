import http from "http";
import type {
  Collection,
  MockResponse,
  MockServerLogEntry,
  MockServerStatus,
  RequestFile,
} from "./types";
import { resolveVariables } from "./variables";
import { listCollections } from "./workspace";

interface MockRoute {
  method: string;
  pathPattern: string; // e.g. /pets/:id
  pathRegex: RegExp;
  paramNames: string[];
  mocks: MockResponse[];
}

interface RunningServer {
  server: http.Server;
  collectionId: string;
  port: number;
  routes: MockRoute[];
  logs: MockServerLogEntry[];
  listeners: Set<(entry: MockServerLogEntry) => void>;
}

// Persist across Next.js hot-reloads in dev mode by attaching to globalThis
const globalKey = "__mockServers__";
const runningServers: Map<string, RunningServer> =
  (globalThis as Record<string, unknown>)[globalKey] as Map<string, RunningServer> ??
  (() => {
    const map = new Map<string, RunningServer>();
    (globalThis as Record<string, unknown>)[globalKey] = map;
    return map;
  })();

const MAX_LOG_ENTRIES = 200;

/**
 * Extract route path from a request URL by stripping {{baseUrl}} and any domain.
 */
function extractRoutePath(url: string, baseUrl?: string): string {
  let path = url;

  // Strip {{baseUrl}} or any {{variable}} prefix
  path = path.replace(/^\{\{[^}]+\}\}/, "");

  // If it still looks like a full URL, extract the path
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const parsed = new URL(path);
      path = parsed.pathname;
    } catch {
      // Not a valid URL, keep as-is
    }
  }

  // Ensure leading slash
  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  // Remove trailing slash (except root)
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  return path;
}

/**
 * Convert a route path with :params into a regex.
 * e.g. /pets/:id -> /^\/pets\/([^/]+)$/
 */
function pathToRegex(pathPattern: string): {
  regex: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];

  const regexStr = pathPattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });

  return {
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
  };
}

/**
 * Build routes from a collection's requests.
 */
async function buildRoutes(collectionId: string): Promise<{
  routes: MockRoute[];
  collection: Collection | null;
}> {
  const collections = await listCollections();
  const collection = collections.find((c) => c.id === collectionId) || null;
  if (!collection) return { routes: [], collection: null };

  const routes: MockRoute[] = [];
  const baseUrl = collection.defaults?.baseUrl;

  // Recursively gather all request IDs from the tree
  const requestIds: string[] = [];
  function walkTree(node: { id: string; type: string; children?: typeof node[] }) {
    if (node.type === "request") {
      // The request ID is the node ID minus the collection prefix
      const requestId = node.id.replace(`${collectionId}/`, "");
      requestIds.push(requestId);
    }
    if (node.children) {
      for (const child of node.children) {
        walkTree(child);
      }
    }
  }
  walkTree(collection.tree);

  // Load each request and build a route
  const { getRequest } = await import("./workspace");
  for (const requestId of requestIds) {
    const requestFile = await getRequest(collectionId, requestId);
    if (!requestFile?.mocks?.length) continue;

    const routePath = extractRoutePath(requestFile.request.url, baseUrl);
    const { regex, paramNames } = pathToRegex(routePath);

    routes.push({
      method: requestFile.request.method.toUpperCase(),
      pathPattern: routePath,
      pathRegex: regex,
      paramNames,
      mocks: requestFile.mocks,
    });
  }

  return { routes, collection };
}

/**
 * Find the matching route for an incoming request.
 */
function matchRoute(
  routes: MockRoute[],
  method: string,
  pathname: string,
): { route: MockRoute; params: Record<string, string> } | null {
  // Try exact method matches first, then look for parameterized routes
  for (const route of routes) {
    if (route.method !== method.toUpperCase()) continue;
    const match = pathname.match(route.pathRegex);
    if (match) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { route, params };
    }
  }
  return null;
}

/**
 * Start a mock server for a collection.
 */
export async function startMockServer(
  collectionId: string,
  port?: number,
): Promise<MockServerStatus> {
  // Stop existing server for this collection
  if (runningServers.has(collectionId)) {
    await stopMockServer(collectionId);
  }

  const { routes, collection } = await buildRoutes(collectionId);
  if (!collection) {
    throw new Error(`Collection "${collectionId}" not found`);
  }

  const collectionVars = collection.variables || {};
  const corsEnabled = true;
  const globalDelay = 0;

  const serverState: RunningServer = {
    server: null!,
    collectionId,
    port: port || 0,
    routes,
    logs: [],
    listeners: new Set(),
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${serverState.port}`);
    const method = req.method || "GET";
    const pathname = url.pathname;

    // CORS preflight
    if (corsEnabled && method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    // Always read from serverState.routes so hot-reloads are picked up
    const currentRoutes = serverState.routes;
    const result = matchRoute(currentRoutes, method, pathname);

    const logEntry: MockServerLogEntry = {
      timestamp: Date.now(),
      method,
      path: pathname,
      matched: !!result,
      status: 404,
    };

    if (!result) {
      logEntry.status = 404;
      addLog(serverState, logEntry);

      if (corsEnabled) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "No matching mock route",
          method,
          path: pathname,
          availableRoutes: currentRoutes.map((r) => `${r.method} ${r.pathPattern}`),
        }),
      );
      return;
    }

    const { route, params } = result;

    // Select which mock to serve
    const requestedMock = req.headers["x-mock-response-name"] as string | undefined;
    let mock: MockResponse | undefined;

    if (requestedMock) {
      mock = route.mocks.find(
        (m) => m.name.toLowerCase() === requestedMock.toLowerCase(),
      );
    }
    if (!mock) {
      mock = route.mocks.find((m) => m.isDefault) || route.mocks[0];
    }

    if (!mock) {
      logEntry.status = 500;
      addLog(serverState, logEntry);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No mock response configured" }));
      return;
    }

    // Resolve variables in body
    const contexts: Record<string, string>[] = [params, collectionVars];
    const body = mock.response.body
      ? resolveVariables(mock.response.body, contexts)
      : "";

    const responseHeaders: Record<string, string> = {
      ...(mock.response.headers || {}),
    };
    if (corsEnabled) {
      responseHeaders["Access-Control-Allow-Origin"] = "*";
    }

    logEntry.matched = true;
    logEntry.mockName = mock.name;
    logEntry.status = mock.response.status;
    addLog(serverState, logEntry);

    const sendResponse = () => {
      res.writeHead(mock!.response.status, responseHeaders);
      res.end(body);
    };

    if (globalDelay > 0) {
      setTimeout(sendResponse, globalDelay);
    } else {
      sendResponse();
    }
  });

  return new Promise((resolve, reject) => {
    const listenPort = port || 0; // 0 = auto-assign

    server.listen(listenPort, "127.0.0.1", () => {
      const address = server.address();
      const actualPort =
        typeof address === "object" && address ? address.port : listenPort;

      serverState.server = server;
      serverState.port = actualPort;
      runningServers.set(collectionId, serverState);

      resolve({
        collectionId,
        port: actualPort,
        running: true,
        routes: routes.length,
      });
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Stop a mock server for a collection.
 */
export async function stopMockServer(collectionId: string): Promise<void> {
  const serverState = runningServers.get(collectionId);
  if (!serverState) return;

  return new Promise((resolve) => {
    serverState.server.close(() => {
      runningServers.delete(collectionId);
      resolve();
    });
  });
}

/**
 * Reload routes for a running mock server (hot-reload).
 */
export async function reloadMockServer(collectionId: string): Promise<void> {
  const serverState = runningServers.get(collectionId);
  if (!serverState) return;

  const { routes } = await buildRoutes(collectionId);
  serverState.routes = routes;
}

/**
 * Get status of all running mock servers.
 */
export function getMockServerStatuses(): MockServerStatus[] {
  return Array.from(runningServers.values()).map((s) => ({
    collectionId: s.collectionId,
    port: s.port,
    running: true,
    routes: s.routes.length,
  }));
}

/**
 * Get status of a specific mock server.
 */
export function getMockServerStatus(
  collectionId: string,
): MockServerStatus | null {
  const serverState = runningServers.get(collectionId);
  if (!serverState) return null;
  return {
    collectionId: serverState.collectionId,
    port: serverState.port,
    running: true,
    routes: serverState.routes.length,
  };
}

/**
 * Get recent log entries for a mock server.
 */
export function getMockServerLogs(collectionId: string): MockServerLogEntry[] {
  const serverState = runningServers.get(collectionId);
  if (!serverState) return [];
  return [...serverState.logs];
}

/**
 * Subscribe to log events for a mock server (for SSE streaming).
 */
export function subscribeMockServerLogs(
  collectionId: string,
  listener: (entry: MockServerLogEntry) => void,
): () => void {
  const serverState = runningServers.get(collectionId);
  if (!serverState) return () => {};

  serverState.listeners.add(listener);
  return () => {
    serverState.listeners.delete(listener);
  };
}

function addLog(serverState: RunningServer, entry: MockServerLogEntry) {
  serverState.logs.push(entry);
  if (serverState.logs.length > MAX_LOG_ENTRIES) {
    serverState.logs.shift();
  }
  for (const listener of serverState.listeners) {
    listener(entry);
  }
}
