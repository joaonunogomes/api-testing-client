import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI, OpenAPIV3, OpenAPIV2 } from "openapi-types";
import type {
  AuthConfig,
  CollectionFile,
  KeyValuePair,
  RequestBody,
  RequestFile,
} from "./types";
import type { ImportResult } from "./postman-converter";

// Re-use sanitizeFileName from postman-converter
function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ---- Schema → example JSON walker ----

function generateExample(schema: OpenAPIV3.SchemaObject, depth = 0): unknown {
  if (depth > 8) return null;

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  switch (schema.type) {
    case "string":
      if (schema.format === "date-time") return "2024-01-01T00:00:00Z";
      if (schema.format === "date") return "2024-01-01";
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uri" || schema.format === "url")
        return "https://example.com";
      if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      return "string";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return true;
    case "array": {
      const items = schema.items as OpenAPIV3.SchemaObject | undefined;
      if (items) return [generateExample(items, depth + 1)];
      return [];
    }
    case "object":
    default: {
      if (schema.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
          obj[key] = generateExample(prop as OpenAPIV3.SchemaObject, depth + 1);
        }
        return obj;
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        return { key: generateExample(schema.additionalProperties as OpenAPIV3.SchemaObject, depth + 1) };
      }
      // allOf / oneOf / anyOf
      if (schema.allOf) {
        const merged: Record<string, unknown> = {};
        for (const sub of schema.allOf) {
          const ex = generateExample(sub as OpenAPIV3.SchemaObject, depth + 1);
          if (ex && typeof ex === "object" && !Array.isArray(ex)) {
            Object.assign(merged, ex);
          }
        }
        return Object.keys(merged).length > 0 ? merged : null;
      }
      if (schema.oneOf && schema.oneOf.length > 0) {
        return generateExample(schema.oneOf[0] as OpenAPIV3.SchemaObject, depth + 1);
      }
      if (schema.anyOf && schema.anyOf.length > 0) {
        return generateExample(schema.anyOf[0] as OpenAPIV3.SchemaObject, depth + 1);
      }
      if (schema.type === "object") return {};
      return null;
    }
  }
}

// ---- Auth conversion ----

function convertSecurityScheme(
  scheme: OpenAPIV3.SecuritySchemeObject,
): AuthConfig | undefined {
  switch (scheme.type) {
    case "http":
      if (scheme.scheme === "bearer") {
        return { type: "bearer", token: "" };
      }
      if (scheme.scheme === "basic") {
        return { type: "basic", username: "", password: "" };
      }
      return undefined;
    case "apiKey":
      return {
        type: "apikey",
        key: scheme.name || "X-API-Key",
        value: "",
        in: scheme.in === "query" ? "query" : "header",
      };
    case "oauth2": {
      const flows = scheme.flows || {};
      const flow =
        flows.authorizationCode ||
        flows.clientCredentials ||
        flows.password ||
        flows.implicit;
      if (!flow) return undefined;
      return {
        type: "oauth2",
        grantType: flows.authorizationCode
          ? "authorization_code"
          : flows.clientCredentials
            ? "client_credentials"
            : flows.password
              ? "password"
              : "implicit",
        authorizationUrl: "authorizationUrl" in flow ? (flow as { authorizationUrl: string }).authorizationUrl : undefined,
        tokenUrl: "tokenUrl" in flow ? (flow as { tokenUrl: string }).tokenUrl : "",
        clientId: "",
        clientSecret: "",
        scope: flow.scopes ? Object.keys(flow.scopes).join(" ") : undefined,
      };
    }
    default:
      return undefined;
  }
}

function resolveAuth(
  security: OpenAPIV3.SecurityRequirementObject[] | undefined,
  securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject> | undefined,
): AuthConfig | undefined {
  if (!security || security.length === 0 || !securitySchemes) return undefined;

  const firstReq = security[0];
  const schemeName = Object.keys(firstReq)[0];
  if (!schemeName) return undefined;

  const scheme = securitySchemes[schemeName];
  if (!scheme) return undefined;

  return convertSecurityScheme(scheme);
}

// ---- Swagger 2.0 helpers ----

function isSwagger2(spec: OpenAPI.Document): spec is OpenAPIV2.Document {
  return "swagger" in spec && (spec as OpenAPIV2.Document).swagger === "2.0";
}

function getBaseUrl(spec: OpenAPI.Document): string {
  if (isSwagger2(spec)) {
    const s2 = spec;
    const scheme = s2.schemes?.[0] || "https";
    const host = s2.host || "localhost";
    const basePath = s2.basePath || "";
    return `${scheme}://${host}${basePath}`.replace(/\/$/, "");
  }
  const s3 = spec as OpenAPIV3.Document;
  return s3.servers?.[0]?.url || "";
}

function getSecuritySchemes(
  spec: OpenAPI.Document,
): Record<string, OpenAPIV3.SecuritySchemeObject> | undefined {
  if (isSwagger2(spec)) {
    const defs = (spec as OpenAPIV2.Document).securityDefinitions;
    if (!defs) return undefined;
    // Swagger 2.0 security defs are close enough to V3 for our conversion
    const schemes: Record<string, OpenAPIV3.SecuritySchemeObject> = {};
    for (const [name, def] of Object.entries(defs)) {
      if (def.type === "oauth2") {
        // Cast to any to access flow-specific fields across the discriminated union
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oauthDef = def as any;
        const flow = (oauthDef.flow as string) || "implicit";
        schemes[name] = {
          type: "oauth2",
          flows: {
            [flow === "accessCode" ? "authorizationCode" : flow]: {
              authorizationUrl: (oauthDef.authorizationUrl as string) || "",
              tokenUrl: (oauthDef.tokenUrl as string) || "",
              scopes: def.scopes || {},
            },
          },
        } as unknown as OpenAPIV3.SecuritySchemeObject;
      } else if (def.type === "apiKey") {
        schemes[name] = {
          type: "apiKey",
          name: def.name,
          in: def.in,
        } as OpenAPIV3.SecuritySchemeObject;
      } else if (def.type === "basic") {
        schemes[name] = {
          type: "http",
          scheme: "basic",
        } as OpenAPIV3.SecuritySchemeObject;
      }
    }
    return Object.keys(schemes).length > 0 ? schemes : undefined;
  }
  const s3 = spec as OpenAPIV3.Document;
  const components = s3.components?.securitySchemes;
  if (!components) return undefined;
  // After dereference, these should all be resolved
  return components as Record<string, OpenAPIV3.SecuritySchemeObject>;
}

function getTopLevelSecurity(
  spec: OpenAPI.Document,
): OpenAPIV3.SecurityRequirementObject[] | undefined {
  return spec.security as OpenAPIV3.SecurityRequirementObject[] | undefined;
}

// ---- Main converter ----

export async function parseAndConvertOpenApi(
  content: string,
): Promise<ImportResult> {
  // Parse YAML or JSON
  let rawSpec: OpenAPI.Document;
  try {
    rawSpec = (content.trimStart().startsWith("{") ? JSON.parse(content) : (await import("yaml")).parse(content)) as OpenAPI.Document;
  } catch {
    throw new Error("Failed to parse spec. Ensure it is valid JSON or YAML.");
  }

  // Validate and dereference
  const spec = (await SwaggerParser.dereference(rawSpec)) as OpenAPI.Document;

  const warnings: string[] = [];
  const info = spec.info || { title: "Untitled", version: "1.0" };
  const collectionId = sanitizeFileName(info.title);
  const baseUrl = getBaseUrl(spec);
  const securitySchemes = getSecuritySchemes(spec);
  const topAuth = resolveAuth(getTopLevelSecurity(spec), securitySchemes);

  const collectionFile: CollectionFile = {
    meta: {
      name: info.title,
      version: 1,
      description: info.description,
    },
    defaults: {
      baseUrl: baseUrl || undefined,
      auth: topAuth,
    },
  };

  // Clean up
  if (!collectionFile.defaults?.baseUrl && !collectionFile.defaults?.auth) {
    delete collectionFile.defaults;
  } else {
    if (!collectionFile.defaults!.baseUrl) delete collectionFile.defaults!.baseUrl;
    if (!collectionFile.defaults!.auth) delete collectionFile.defaults!.auth;
  }
  if (!collectionFile.meta.description) delete collectionFile.meta.description;

  // Build requests from paths
  const requests: { path: string; file: RequestFile }[] = [];
  const folderSeqMap = new Map<string, number>();
  const fileNameCounts = new Map<string, number>();

  const paths = spec.paths || {};
  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;

    const methods = ["get", "post", "put", "patch", "delete", "options", "head"] as const;
    for (const method of methods) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIV3.OperationObject
        | undefined;
      if (!operation) continue;

      // Determine folder from first tag or first path segment
      const tag =
        operation.tags?.[0] ||
        pathStr.split("/").filter(Boolean)[0] ||
        "default";
      const folderName = sanitizeFileName(tag);

      // Track sequence per folder
      if (!folderSeqMap.has(folderName)) folderSeqMap.set(folderName, 0);
      const seq = folderSeqMap.get(folderName)! + 1;
      folderSeqMap.set(folderName, seq);

      // Request name
      const opName =
        operation.summary ||
        operation.operationId ||
        `${method.toUpperCase()} ${pathStr}`;

      let fileName = sanitizeFileName(opName);
      // Handle duplicates within same folder
      const fullKey = `${folderName}/${fileName}`;
      const count = fileNameCounts.get(fullKey) || 0;
      fileNameCounts.set(fullKey, count + 1);
      if (count > 0) {
        fileName = `${fileName}-${count + 1}`;
      }

      const filePath = `${folderName}/${fileName}`;

      // Gather parameters (merge path-level and operation-level)
      const allParams = [
        ...((pathItem as OpenAPIV3.PathItemObject).parameters || []),
        ...(operation.parameters || []),
      ] as OpenAPIV3.ParameterObject[];

      const queryParams: KeyValuePair[] = [];
      const headerParams: KeyValuePair[] = [];
      for (const param of allParams) {
        const example = param.example ?? (param.schema as OpenAPIV3.SchemaObject)?.example ?? "";
        if (param.in === "query") {
          queryParams.push({
            key: param.name,
            value: String(example),
            enabled: param.required !== false,
          });
        } else if (param.in === "header") {
          headerParams.push({
            key: param.name,
            value: String(example),
            enabled: true,
          });
        }
      }

      // Build URL: {{baseUrl}}/path (keep {param} placeholders as-is)
      const url = baseUrl ? `{{baseUrl}}${pathStr}` : pathStr;

      // Body
      let body: RequestBody | undefined;
      const reqBody = operation.requestBody as
        | OpenAPIV3.RequestBodyObject
        | undefined;
      if (reqBody?.content) {
        const jsonContent = reqBody.content["application/json"];
        if (jsonContent?.schema) {
          const example = generateExample(
            jsonContent.schema as OpenAPIV3.SchemaObject,
          );
          body = {
            type: "json",
            content: JSON.stringify(example, null, 2),
          };
        } else {
          // Try other content types
          const xmlContent = reqBody.content["application/xml"];
          const formContent =
            reqBody.content["application/x-www-form-urlencoded"];
          if (formContent?.schema) {
            const schema = formContent.schema as OpenAPIV3.SchemaObject;
            const pairs = Object.keys(schema.properties || {})
              .map((k) => `${encodeURIComponent(k)}=`)
              .join("&");
            body = { type: "form", content: pairs };
          } else if (xmlContent) {
            body = { type: "xml", content: "" };
          } else {
            const firstType = Object.keys(reqBody.content)[0];
            if (firstType) {
              warnings.push(
                `[${opName}] Unsupported content type: ${firstType}`,
              );
            }
          }
        }
      }

      // Per-operation auth
      const opSecurity = operation.security as
        | OpenAPIV3.SecurityRequirementObject[]
        | undefined;
      const opAuth =
        opSecurity !== undefined
          ? resolveAuth(opSecurity, securitySchemes)
          : undefined;

      const requestFile: RequestFile = {
        meta: {
          name: opName,
          description: operation.description,
          seq,
        },
        request: {
          method: method.toUpperCase(),
          url,
          params: queryParams.length > 0 ? queryParams : undefined,
          headers: headerParams.length > 0 ? headerParams : undefined,
          auth: opAuth,
          body,
        },
      };

      // Clean up undefined fields
      if (!requestFile.request.params) delete requestFile.request.params;
      if (!requestFile.request.headers) delete requestFile.request.headers;
      if (!requestFile.request.auth) delete requestFile.request.auth;
      if (!requestFile.request.body) delete requestFile.request.body;
      if (!requestFile.meta.description) delete requestFile.meta.description;

      requests.push({ path: filePath, file: requestFile });
    }
  }

  return { collectionId, collectionFile, requests, warnings };
}
