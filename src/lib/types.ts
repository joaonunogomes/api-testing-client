export interface CollectionMeta {
  name: string;
  version?: number;
  description?: string;
}

export interface AuthNone {
  type: "none";
}

export interface AuthBearer {
  type: "bearer";
  token: string;
}

export interface AuthBasic {
  type: "basic";
  username: string;
  password: string;
}

export interface AuthApiKey {
  type: "apikey";
  key: string;
  value: string;
  in: "header" | "query";
}

export interface AuthOAuth2 {
  type: "oauth2";
  grantType: string;
  authorizationUrl?: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  callbackUrl?: string;
  scope?: string;
  // Password grant
  username?: string;
  password?: string;
  // Extra params sent with token request
  audience?: string;
  resource?: string;
  // Redirect mode: "app" uses in-app popup, "browser" opens system browser (useful for SSO)
  redirectMode?: "app" | "browser";
}

export type AuthConfig =
  | AuthNone
  | AuthBearer
  | AuthBasic
  | AuthApiKey
  | AuthOAuth2;

export interface RequestBody {
  type: "json" | "form" | "multipart" | "xml" | "text" | "none";
  content?: string;
}

export interface RequestDef {
  method: string;
  url: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  auth?: AuthConfig;
  body?: RequestBody;
}

export interface Scripts {
  "pre-request"?: string;
  "post-response"?: string;
}

export interface MockResponse {
  name: string;
  isDefault?: boolean;
  response: {
    status: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

export interface RequestFile {
  meta: {
    name: string;
    description?: string;
    seq?: number;
  };
  request: RequestDef;
  scripts?: Scripts;
  mocks?: MockResponse[];
}

export interface CollectionFile {
  meta: CollectionMeta;
  defaults?: {
    baseUrl?: string;
    headers?: Record<string, string>;
    auth?: AuthConfig;
  };
  variables?: Record<string, string>;
  scripts?: Scripts;
}

export interface EnvironmentFile {
  meta: { name: string };
  variables?: Record<string, string>;
  secrets?: Record<string, string>;
}

export interface TreeNode {
  id: string;
  name: string;
  type: "collection" | "folder" | "request";
  children?: TreeNode[];
  method?: string;
  seq?: number;
}

export interface Collection {
  id: string;
  meta: CollectionMeta;
  defaults?: CollectionFile["defaults"];
  variables?: Record<string, string>;
  scripts?: Scripts;
  linkedPath?: string;
  tree: TreeNode;
}

export interface Environment {
  id: string;
  meta: { name: string };
  variables: Record<string, string>;
  secrets: Record<string, string>;
  linkedPath?: string;
}

export interface ExecuteRequest {
  collectionId: string;
  requestId: string;
  environmentId?: string;
}

export interface ExecuteResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
  testResults?: TestResult[];
  consoleOutput?: string[];
  curl?: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface OAuth2TokenState {
  collectionId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  acquiredAt: number;
  error?: string;
}

export interface MockServerConfig {
  port?: number;
  delay?: number;
  cors?: boolean;
}

export interface MockServerStatus {
  collectionId: string;
  port: number;
  running: boolean;
  routes: number;
}

export interface MockServerLogEntry {
  timestamp: number;
  method: string;
  path: string;
  matched: boolean;
  mockName?: string;
  status: number;
}
