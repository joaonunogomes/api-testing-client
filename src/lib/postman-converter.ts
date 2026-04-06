import type {
  AuthConfig,
  CollectionFile,
  EnvironmentFile,
  KeyValuePair,
  RequestBody,
  RequestFile,
  Scripts,
} from "./types";
import { convertPostmanEventScript } from "./script-converter";

// ---- Postman Collection v2.1 types ----

interface PostmanCollection {
  info: {
    name: string;
    description?: string;
    schema?: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
  auth?: PostmanAuth;
  event?: PostmanEvent[];
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[]; // folder
  request?: PostmanRequest;
  event?: PostmanEvent[];
}

interface PostmanRequest {
  method: string;
  header?: PostmanHeader[];
  url: PostmanUrl | string;
  body?: PostmanBody;
  auth?: PostmanAuth;
  description?: string;
}

interface PostmanUrl {
  raw: string;
  host?: string[];
  path?: string[];
  query?: PostmanQueryParam[];
  variable?: PostmanVariable[];
}

interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

interface PostmanQueryParam {
  key: string;
  value: string;
  disabled?: boolean;
}

interface PostmanBody {
  mode: "raw" | "urlencoded" | "formdata" | "file" | "graphql" | "none";
  raw?: string;
  urlencoded?: { key: string; value: string; disabled?: boolean }[];
  formdata?: { key: string; value: string; type?: string; disabled?: boolean }[];
  options?: { raw?: { language?: string } };
}

interface PostmanAuth {
  type: string;
  bearer?: { key: string; value: string }[];
  basic?: { key: string; value: string }[];
  apikey?: { key: string; value: string }[];
  oauth2?: { key: string; value: string }[];
}

interface PostmanEvent {
  listen: "prerequest" | "test";
  script?: { exec?: string[]; type?: string };
}

interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
  disabled?: boolean;
}

// ---- Postman Environment types ----

interface PostmanEnvironment {
  name: string;
  values: PostmanEnvValue[];
  _postman_variable_scope?: string;
}

interface PostmanEnvValue {
  key: string;
  value: string;
  type?: string; // "default" | "secret"
  enabled?: boolean;
}

// ---- Conversion results ----

export interface ImportResult {
  collectionId: string;
  collectionFile: CollectionFile;
  requests: { path: string; file: RequestFile }[];
  warnings: string[];
}

export interface EnvironmentImportResult {
  id: string;
  file: EnvironmentFile;
  warnings: string[];
}

// ---- Converters ----

function convertAuth(auth: PostmanAuth | undefined): AuthConfig | undefined {
  if (!auth) return undefined;

  const getVal = (arr: { key: string; value: string }[] | undefined, key: string) =>
    arr?.find((item) => item.key === key)?.value || "";

  switch (auth.type) {
    case "bearer":
      return { type: "bearer", token: getVal(auth.bearer, "token") };
    case "basic":
      return {
        type: "basic",
        username: getVal(auth.basic, "username"),
        password: getVal(auth.basic, "password"),
      };
    case "apikey": {
      const keyName = getVal(auth.apikey, "key") || "X-API-Key";
      const value = getVal(auth.apikey, "value");
      const addTo = getVal(auth.apikey, "in") || "header";
      return {
        type: "apikey",
        key: keyName,
        value,
        in: addTo === "query" ? "query" : "header",
      };
    }
    case "oauth2": {
      return {
        type: "oauth2",
        grantType: getVal(auth.oauth2, "grant_type") || "authorization_code",
        authorizationUrl: getVal(auth.oauth2, "authUrl"),
        tokenUrl: getVal(auth.oauth2, "accessTokenUrl"),
        clientId: getVal(auth.oauth2, "clientId"),
        clientSecret: getVal(auth.oauth2, "clientSecret"),
        callbackUrl:
          getVal(auth.oauth2, "redirect_uri") ||
          "http://localhost:3000/api/oauth2/callback",
        scope: getVal(auth.oauth2, "scope"),
      };
    }
    case "noauth":
      return { type: "none" };
    default:
      return undefined;
  }
}

function convertUrl(url: PostmanUrl | string): string {
  if (typeof url === "string") return url;
  return url.raw || "";
}

function convertParams(
  url: PostmanUrl | string,
): KeyValuePair[] | undefined {
  if (typeof url === "string") return undefined;
  if (!url.query || url.query.length === 0) return undefined;

  const params: KeyValuePair[] = [];
  for (const q of url.query) {
    if (q.key) {
      params.push({ key: q.key, value: q.value, enabled: !q.disabled });
    }
  }
  return params.length > 0 ? params : undefined;
}

function convertHeaders(
  headers: PostmanHeader[] | undefined,
): KeyValuePair[] | undefined {
  if (!headers || headers.length === 0) return undefined;

  const result: KeyValuePair[] = [];
  for (const h of headers) {
    if (h.key) {
      result.push({ key: h.key, value: h.value, enabled: !h.disabled });
    }
  }
  return result.length > 0 ? result : undefined;
}

function convertBody(body: PostmanBody | undefined): RequestBody | undefined {
  if (!body || body.mode === "none") return undefined;

  switch (body.mode) {
    case "raw": {
      const lang = body.options?.raw?.language || "text";
      let type: RequestBody["type"] = "text";
      if (lang === "json") type = "json";
      else if (lang === "xml") type = "xml";
      return { type, content: body.raw || "" };
    }
    case "urlencoded": {
      const pairs = (body.urlencoded || [])
        .filter((p) => !p.disabled)
        .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join("&");
      return { type: "form", content: pairs };
    }
    case "formdata": {
      // Store as key=value pairs (simplified)
      const pairs = (body.formdata || [])
        .filter((p) => !p.disabled)
        .map((p) => `${p.key}=${p.value}`)
        .join("\n");
      return { type: "multipart", content: pairs };
    }
    default:
      return undefined;
  }
}

function convertScripts(events: PostmanEvent[] | undefined): {
  scripts: Scripts | undefined;
  warnings: string[];
} {
  if (!events || events.length === 0) return { scripts: undefined, warnings: [] };

  const allWarnings: string[] = [];
  const scripts: Scripts = {};

  for (const event of events) {
    if (event.listen === "prerequest" && event.script?.exec) {
      const { script, warnings } = convertPostmanEventScript(event.script.exec);
      if (script) scripts["pre-request"] = script;
      allWarnings.push(...warnings);
    }
    if (event.listen === "test" && event.script?.exec) {
      const { script, warnings } = convertPostmanEventScript(event.script.exec);
      if (script) scripts["post-response"] = script;
      allWarnings.push(...warnings);
    }
  }

  return {
    scripts: Object.keys(scripts).length > 0 ? scripts : undefined,
    warnings: allWarnings,
  };
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function convertItem(
  item: PostmanItem,
  basePath: string,
  seq: number,
  warnings: string[],
): { path: string; file: RequestFile }[] {
  // If item has nested items, it's a folder
  if (item.item && item.item.length > 0) {
    const folderName = sanitizeFileName(item.name);
    const folderPath = basePath ? `${basePath}/${folderName}` : folderName;
    const results: { path: string; file: RequestFile }[] = [];

    item.item.forEach((child, i) => {
      results.push(...convertItem(child, folderPath, i + 1, warnings));
    });

    return results;
  }

  // It's a request
  if (!item.request) return [];

  const fileName = sanitizeFileName(item.name);
  const filePath = basePath ? `${basePath}/${fileName}` : fileName;

  const { scripts, warnings: scriptWarnings } = convertScripts(item.event);
  if (scriptWarnings.length > 0) {
    warnings.push(
      ...scriptWarnings.map((w) => `[${item.name}] ${w}`),
    );
  }

  // Extract URL without query params (those go in params)
  let rawUrl = convertUrl(item.request.url);
  // Remove query string from URL since we extract params separately
  const urlObj = typeof item.request.url !== "string" ? item.request.url : null;
  if (urlObj?.query && urlObj.query.length > 0) {
    const qIndex = rawUrl.indexOf("?");
    if (qIndex > -1) rawUrl = rawUrl.substring(0, qIndex);
  }

  const requestFile: RequestFile = {
    meta: {
      name: item.name,
      description: item.request.description,
      seq,
    },
    request: {
      method: item.request.method || "GET",
      url: rawUrl,
      params: convertParams(item.request.url),
      headers: convertHeaders(item.request.header),
      auth: convertAuth(item.request.auth),
      body: convertBody(item.request.body),
    },
    scripts,
  };

  // Clean up undefined fields
  if (!requestFile.request.params) delete requestFile.request.params;
  if (!requestFile.request.headers) delete requestFile.request.headers;
  if (!requestFile.request.auth) delete requestFile.request.auth;
  if (!requestFile.request.body) delete requestFile.request.body;
  if (!requestFile.scripts) delete requestFile.scripts;
  if (!requestFile.meta.description) delete requestFile.meta.description;

  return [{ path: filePath, file: requestFile }];
}

export function convertPostmanCollection(json: PostmanCollection): ImportResult {
  const warnings: string[] = [];

  const collectionId = sanitizeFileName(json.info.name);

  // Collection-level scripts
  const { scripts: collectionScripts, warnings: collScriptWarnings } =
    convertScripts(json.event);
  warnings.push(...collScriptWarnings.map((w) => `[collection] ${w}`));

  // Collection-level variables
  const variables: Record<string, string> = {};
  if (json.variable) {
    for (const v of json.variable) {
      if (!v.disabled && v.key) {
        variables[v.key] = v.value || "";
      }
    }
  }

  const collectionFile: CollectionFile = {
    meta: {
      name: json.info.name,
      version: 1,
      description: json.info.description,
    },
    defaults: {
      auth: convertAuth(json.auth),
    },
    variables: Object.keys(variables).length > 0 ? variables : undefined,
    scripts: collectionScripts,
  };

  // Clean up
  if (!collectionFile.defaults?.auth) delete collectionFile.defaults;
  if (!collectionFile.scripts) delete collectionFile.scripts;
  if (!collectionFile.meta.description) delete collectionFile.meta.description;

  // Convert all items
  const requests: { path: string; file: RequestFile }[] = [];
  json.item.forEach((item, i) => {
    requests.push(...convertItem(item, "", i + 1, warnings));
  });

  return { collectionId, collectionFile, requests, warnings };
}

export function convertPostmanEnvironment(
  json: PostmanEnvironment,
): EnvironmentImportResult {
  const warnings: string[] = [];
  const id = sanitizeFileName(json.name);

  const variables: Record<string, string> = {};
  const secrets: Record<string, string> = {};

  for (const val of json.values) {
    if (val.enabled === false) continue;
    if (!val.key) continue;

    if (val.type === "secret") {
      secrets[val.key] = val.value || "";
    } else {
      variables[val.key] = val.value || "";
    }
  }

  const file: EnvironmentFile = {
    meta: { name: json.name },
    variables,
    secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
  };

  return { id, file, warnings };
}

/**
 * Detect whether a JSON object is a Postman collection or environment.
 */
export function detectPostmanType(
  json: Record<string, unknown>,
): "collection" | "environment" | "unknown" {
  if (json.info && json.item) return "collection";
  if (json.values && (json._postman_variable_scope || json.name)) return "environment";
  return "unknown";
}
