import type { KeyValuePair, RequestDef } from "./types";

/**
 * Parse a curl command string into a RequestDef.
 * Returns null if the string doesn't look like a curl command.
 */
export function parseCurl(raw: string): RequestDef | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("curl ") && !trimmed.startsWith("curl\t")) {
    return null;
  }

  // Normalize line continuations (backslash + newline) into a single line
  const oneLine = trimmed.replace(/\\\s*\n\s*/g, " ");

  const tokens = tokenize(oneLine);
  // Remove the leading "curl" token
  tokens.shift();

  let method = "";
  let url = "";
  const headers: KeyValuePair[] = [];
  const headerMap: Record<string, string> = {}; // for lookups
  let bodyContent: string | undefined;
  let authUser: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok === "-X" || tok === "--request") {
      method = tokens[++i]?.toUpperCase() ?? "";
    } else if (tok === "-H" || tok === "--header") {
      const hdr = tokens[++i] ?? "";
      const colonIdx = hdr.indexOf(":");
      if (colonIdx > 0) {
        const key = hdr.slice(0, colonIdx).trim();
        const value = hdr.slice(colonIdx + 1).trim();
        headers.push({ key, value, enabled: true });
        headerMap[key] = value;
      }
    } else if (
      tok === "-d" ||
      tok === "--data" ||
      tok === "--data-raw" ||
      tok === "--data-binary" ||
      tok === "--data-ascii" ||
      tok === "--data-urlencode" ||
      tok === "--json"
    ) {
      bodyContent = tokens[++i] ?? "";
      if (tok === "--json" && !headerMap["Content-Type"] && !headerMap["content-type"]) {
        headers.push({ key: "Content-Type", value: "application/json", enabled: true });
        headers.push({ key: "Accept", value: "application/json", enabled: true });
        headerMap["Content-Type"] = "application/json";
        headerMap["Accept"] = "application/json";
      }
    } else if (tok === "-u" || tok === "--user") {
      authUser = tokens[++i] ?? "";
    } else if (
      tok === "-k" ||
      tok === "--insecure" ||
      tok === "-s" ||
      tok === "--silent" ||
      tok === "-S" ||
      tok === "--show-error" ||
      tok === "-v" ||
      tok === "--verbose" ||
      tok === "-L" ||
      tok === "--location" ||
      tok === "--compressed" ||
      tok === "-i" ||
      tok === "--include" ||
      tok === "-o" ||
      tok === "--output" ||
      tok === "-w" ||
      tok === "--write-out"
    ) {
      // Flags that take no argument — skip
      // Flags that take an argument
      if (tok === "-o" || tok === "--output" || tok === "-w" || tok === "--write-out") {
        i++; // skip argument
      }
    } else if (tok.startsWith("-")) {
      // Unknown flag — skip (and skip its arg if it doesn't start with -)
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) {
        i++;
      }
    } else {
      // Positional argument = URL
      if (!url) {
        url = tok;
      }
    }
  }

  if (!url) return null;

  // Extract query params from URL
  const params: KeyValuePair[] = [];
  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((v, k) => {
      params.push({ key: k, value: v, enabled: true });
    });
    // Remove query string from the URL so it lives in params
    if (parsed.search) {
      url = url.split("?")[0];
    }
  } catch {
    // Not a valid URL — keep as-is
  }

  // Infer method if not explicit
  if (!method) {
    method = bodyContent ? "POST" : "GET";
  }

  // Detect body type from Content-Type header
  const contentType =
    headerMap["Content-Type"] || headerMap["content-type"] || "";
  let bodyType: "json" | "form" | "xml" | "text" | "none" = "none";
  if (bodyContent) {
    if (contentType.includes("application/json")) {
      bodyType = "json";
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      bodyType = "form";
    } else if (contentType.includes("xml")) {
      bodyType = "xml";
    } else if (contentType) {
      bodyType = "text";
    } else {
      // Try to guess from content
      try {
        JSON.parse(bodyContent);
        bodyType = "json";
      } catch {
        bodyType = "text";
      }
    }
  }

  // Remove Content-Type from headers — the body editor controls it
  const filteredHeaders = headers.filter(
    (h) => h.key !== "Content-Type" && h.key !== "content-type",
  );

  const result: RequestDef = {
    method,
    url,
    ...(params.length > 0 ? { params } : {}),
    ...(filteredHeaders.length > 0 ? { headers: filteredHeaders } : {}),
    body: bodyContent
      ? { type: bodyType, content: bodyContent }
      : { type: "none" },
  };

  // Handle basic auth
  if (authUser) {
    const [username, ...rest] = authUser.split(":");
    result.auth = {
      type: "basic",
      username,
      password: rest.join(":"),
    };
  }

  // Handle Bearer auth from Authorization header
  const authHeader = headerMap["Authorization"] || headerMap["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    result.auth = {
      type: "bearer",
      token: authHeader.slice(7),
    };
    // Remove auth headers from the list
    if (result.headers) {
      result.headers = result.headers.filter(
        (h) => h.key !== "Authorization" && h.key !== "authorization",
      );
    }
  }

  return result;
}

/**
 * Shell-like tokenizer: splits on whitespace, respects single/double quotes.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;

    let token = "";
    while (i < input.length && !/\s/.test(input[i])) {
      const ch = input[i];
      if (ch === "'" ) {
        // Single-quoted string — no escaping inside
        i++;
        while (i < input.length && input[i] !== "'") {
          token += input[i++];
        }
        i++; // skip closing quote
      } else if (ch === '"') {
        // Double-quoted string — handle backslash escapes
        i++;
        while (i < input.length && input[i] !== '"') {
          if (input[i] === "\\" && i + 1 < input.length) {
            const next = input[i + 1];
            if (next === '"' || next === "\\" || next === "$" || next === "`") {
              token += next;
              i += 2;
              continue;
            }
          }
          token += input[i++];
        }
        i++; // skip closing quote
      } else if (ch === "\\" && i + 1 < input.length) {
        token += input[++i];
        i++;
      } else {
        token += ch;
        i++;
      }
    }

    tokens.push(token);
  }

  return tokens;
}
