# API Client

A self-hosted, file-based API client. Like Postman, but everything is stored as YAML files in your codebase — git-friendly, diff-friendly, and fully version-controlled.

Run it as a Docker container, use it in the browser, or install the desktop app on macOS or Windows. No accounts, no cloud sync, no vendor lock-in.

## Features

- **File-based storage** — Collections, requests, and environments are YAML files on disk
- **Git-friendly** — Human-readable diffs, branch per feature, PR reviews for API changes
- **Desktop app** — Native Electron app for macOS (DMG) and Windows (installer & portable)
- **Environments** — Switch between dev/staging/prod with variable substitution (`{{baseUrl}}`)
- **Authentication** — Basic, Bearer, API Key, and OAuth 2.0 (Authorization Code, PKCE, Client Credentials, Password, Refresh Token)
- **Variable substitution** — Use `{{variables}}` in URLs, headers, body, and auth fields
- **Built-in dynamic variables** — `{{$guid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`, `{{$randomCompanyName}}`
- **Pre-request & post-response scripts** — JavaScript scripts with test assertions via `bru.test()`
- **Postman import** — Import Postman collections (v2.1) and environments, converted to native YAML
- **OpenAPI import** — Import OpenAPI 3.x and Swagger 2.0 specs (JSON or YAML) from file or URL
- **Live reload** — Edit YAML files in your editor and the UI updates instantly via Server-Sent Events
- **Multi-tab interface** — Open multiple requests in tabs with drag-to-reorder
- **Mock server** — Start a mock HTTP server from any collection. Each request with mocks becomes a route, serving defined responses on `localhost`
- **cURL generation** — Generate cURL commands from any request
- **Docker-first** — Single container, mount your workspace as a volume
- **No database** — Everything lives in files. Back up by pushing to git.

## Quick Start

### With Docker (recommended)

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). The example workspace is mounted automatically.

To use your own workspace:

```bash
docker run -p 3000:3000 -v /path/to/your/workspace:/workspace api-client
```

### Local Development

**Prerequisites:** Node.js >= 22, pnpm >= 9

```bash
# Install dependencies
pnpm install

# Start development server
WORKSPACE_DIR=$(pwd)/workspace-example pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
pnpm build
pnpm start
```

## Desktop App (Electron)

The API Client is also available as a native desktop application for macOS and Windows, built with Electron.

### Download

Pre-built installers are available on the [Releases](../../releases) page:

| Platform | Formats |
|----------|---------|
| macOS (Apple Silicon) | `.dmg`, `.zip` |
| macOS (Intel) | `.dmg`, `.zip` |
| Windows | `.exe` (installer), `.exe` (portable) |

### Building from source

```bash
# Install dependencies
pnpm install

# Build the desktop app
pnpm build:electron
```

Installers are output to the `dist/` directory.

To build for a specific platform:

```bash
# macOS only
pnpm build && pnpm exec electron-builder --mac

# Windows only
pnpm build && pnpm exec electron-builder --win
```

### Development

```bash
# Run Electron in dev mode (starts Next.js + Electron concurrently)
pnpm dev:electron
```

### How it works

The desktop app embeds a Next.js standalone server that runs locally. The Electron shell provides:

- Native window management with system-level menu integration
- Automatic workspace directory in your user data folder
- OAuth 2.0 callback handling via the system browser
- Single-instance enforcement (opening the app twice focuses the existing window)

The workspace is stored at `~/.userData/workspace` (or `~/.userData/workspace-dev` in development).

### Auto-updates

The desktop app checks for new versions on launch (against GitHub Releases). When a new release is available, you'll be prompted to download it; once the download completes, you'll be prompted to restart and apply the update. If you skip the restart, the update is applied automatically on the next quit.

> macOS auto-updates require a code-signed build. Unsigned macOS builds will skip the install step.

## Workspace Structure

A workspace is a directory containing `collections/` and `environments/` folders. Point the app at any workspace directory — it will scan and load everything automatically.

```
my-workspace/
├── collections/
│   ├── petstore/
│   │   ├── collection.yaml      # Collection metadata, defaults, variables
│   │   ├── list-pets.yaml       # Individual request
│   │   ├── create-pet.yaml      # Individual request
│   │   └── admin/               # Sub-folder
│   │       └── delete-pet.yaml
│   └── auth-service/
│       ├── collection.yaml
│       └── login.yaml
└── environments/
    ├── dev.env.yaml
    ├── staging.env.yaml
    └── prod.env.yaml
```

Each collection is a directory. Each request is a single YAML file. Folders become sub-groups in the sidebar.

## File Formats

### Collection (`collection.yaml`)

Defines metadata, default settings inherited by all requests, collection-level variables, and scripts.

```yaml
meta:
  name: Petstore API
  version: 1
  description: OpenAPI Petstore example

defaults:
  baseUrl: "{{baseUrl}}"
  headers:
    Content-Type: application/json
    Accept: application/json
  auth:
    type: bearer
    token: "{{authToken}}"

variables:
  apiVersion: v1

scripts:
  pre-request: |
    bru.setVar("requestTimestamp", Date.now());
  post-response: |
    if (res.status === 401) {
      console.log("Auth expired");
    }
```

### Request (e.g., `list-pets.yaml`)

Each request lives in its own file. It inherits defaults from the parent `collection.yaml` unless overridden.

```yaml
meta:
  name: List Pets
  description: Returns all pets from the store
  seq: 1                          # Controls ordering in the sidebar

request:
  method: GET
  url: "{{baseUrl}}/api/{{apiVersion}}/pets"
  params:
    limit: "10"
    status: active
  headers:
    X-Request-Id: "{{$guid}}"

scripts:
  post-response: |
    const data = res.json();
    bru.setVar("firstPetId", data[0]?.id);
```

#### Request with mock responses

Mocks define canned responses that the mock server will serve. Each request can have multiple named mocks.

```yaml
meta:
  name: Get Pet
request:
  method: GET
  url: "{{baseUrl}}/pets/:id"

mocks:
  - name: Found
    isDefault: true
    response:
      status: 200
      headers:
        Content-Type: application/json
      body: |
        {"id": 1, "name": "Buddy", "species": "dog"}
  - name: Not Found
    response:
      status: 404
      headers:
        Content-Type: application/json
      body: |
        {"error": "Pet not found"}
```

#### Request with body and auth override

```yaml
meta:
  name: Create Pet
  seq: 2

request:
  method: POST
  url: "{{baseUrl}}/api/{{apiVersion}}/pets"
  auth:
    type: basic
    username: "{{username}}"
    password: "{{password}}"
  body:
    type: json                    # json | form | multipart | xml | text | none
    content: |
      {
        "name": "{{petName}}",
        "tag": "dog"
      }
```

### Environment (`*.env.yaml`)

```yaml
meta:
  name: Development

variables:
  baseUrl: http://localhost:8080
  apiVersion: v1
  username: dev-user

secrets:
  password: "{{prompt:Enter dev password}}"   # Prompts user at runtime
  apiKey: sk-dev-xxxxxxxxxxxx
```

#### Secrets file (`*.env.secrets.yaml`)

For sensitive values you don't want in git, create a companion secrets file (automatically gitignored):

```yaml
# dev.env.secrets.yaml — this file is in .gitignore
secrets:
  password: my-actual-password
  apiKey: sk-dev-real-key-here
```

The secrets file merges on top of the environment file, with secrets taking precedence.

## Authentication

Supported auth types, configured per-request or as collection defaults:

```yaml
# Bearer Token
auth:
  type: bearer
  token: "{{token}}"

# Basic Auth
auth:
  type: basic
  username: "{{user}}"
  password: "{{pass}}"

# API Key
auth:
  type: apikey
  key: X-API-Key
  value: "{{apiKey}}"
  in: header                      # header | query

# OAuth 2.0
auth:
  type: oauth2
  grantType: client_credentials   # authorization_code | authorization_code_pkce | client_credentials | password | refresh_token
  tokenUrl: "{{tokenUrl}}"
  clientId: "{{clientId}}"
  clientSecret: "{{clientSecret}}"
  scope: "read write"
```

## Variable Substitution

Variables are resolved in URLs, headers, body content, and auth fields using `{{variableName}}` syntax.

**Resolution order** (highest priority wins):

1. Script-set variables (runtime, session-scoped)
2. Environment secrets (from `*.env.secrets.yaml`)
3. Environment variables (from `*.env.yaml`)
4. Collection variables (from `collection.yaml`)
5. Built-in dynamic variables

**Built-in variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `{{$guid}}` | UUID v4 | `a1b2c3d4-e5f6-...` |
| `{{$timestamp}}` | Unix timestamp (seconds) | `1774907045` |
| `{{$isoTimestamp}}` | ISO 8601 datetime | `2026-03-30T21:44:05.123Z` |
| `{{$randomInt}}` | Random integer (0-999999) | `482910` |
| `{{$randomCompanyName}}` | Random company name | `Acme Corp` |

Variables can reference other variables (recursive resolution with cycle detection):

```yaml
variables:
  protocol: https
  host: api.example.com
  baseUrl: "{{protocol}}://{{host}}"    # Resolves to https://api.example.com
```

## Scripting

Pre-request and post-response scripts run in a sandboxed JavaScript environment. Scripts can read/write variables, inspect requests and responses, and run test assertions.

```yaml
scripts:
  pre-request: |
    bru.setVar("startTime", Date.now());

  post-response: |
    const data = res.json();
    bru.setVar("userId", data.id);

    bru.test("should return 200", () => {
      expect(res.status).toBe(200);
    });

    bru.test("should have an id", () => {
      expect(data.id).toBeDefined();
    });
```

**Available APIs in scripts:**

| API | Description |
|-----|-------------|
| `bru.setVar(name, value)` | Set a collection-scoped variable |
| `bru.getVar(name)` | Get a collection-scoped variable |
| `bru.setEnvVar(name, value)` | Set an environment variable (session only) |
| `bru.getEnvVar(name)` | Get an environment variable |
| `bru.test(name, fn)` | Define a test assertion |
| `expect(value)` | Assertion helper (`.toBe()`, `.toEqual()`, etc.) |
| `req.setHeader(name, value)` | Modify request header (pre-request only) |
| `req.setBody(body)` | Modify request body (pre-request only) |
| `res.status` | Response status code |
| `res.json()` | Parse response body as JSON |
| `res.headers` | Response headers |
| `console.log/warn/error` | Output captured and shown in UI |

## Mock Server

Start a mock HTTP server directly from any collection. Each request that has mocks defined becomes a route on the server, serving the default mock response.

### How it works

1. Define mocks on your requests in the **Mocks** tab (or click **Save as Mock** on any response)
2. Open the collection settings and go to the **Mock Server** tab
3. Click **Start Mock Server** — a local HTTP server starts on `localhost`
4. The route path is derived by stripping `{{baseUrl}}` from each request URL

### Selecting a specific mock

By default, the mock marked `isDefault: true` (or the first one) is returned. To request a specific mock, send the `x-mock-response-name` header:

```bash
# Returns the default mock
curl http://localhost:9001/pets/1

# Returns the "Not Found" mock
curl -H "x-mock-response-name: Not Found" http://localhost:9001/pets/1
```

### Features

- **CORS enabled** — use the mock server as a backend for frontend development
- **Path parameters** — `:id` segments in URLs are matched dynamically
- **Variable substitution** — `{{$guid}}`, `{{$timestamp}}`, and collection variables work in mock bodies
- **Hot-reload** — edit mocks in the UI or YAML files, and the running server picks up changes
- **Request log** — see incoming requests in real-time in the Mock Server tab
- **localhost only** — the server binds to `127.0.0.1` and is not exposed to the internet

## Importing from Postman

You can import Postman collections (v2.1 format) and environments directly from the UI. The importer converts them to native YAML files in your workspace.

1. Click the **Import** button in the sidebar
2. Select a Postman collection or environment JSON file
3. The collection and its requests are converted to YAML and saved to your workspace

## Importing from OpenAPI / Swagger

Import OpenAPI 3.x or Swagger 2.0 specs (JSON or YAML) to generate a collection with folders and requests.

1. Click the **Import** button in the sidebar and select the **From OpenAPI** tab
2. Drop a spec file (`.json`, `.yaml`, `.yml`) or paste a URL to a remote spec
3. The importer resolves `$ref`s, extracts paths/operations, generates example request bodies from schemas, and creates a collection

What gets imported:
- **Base URL** from `servers[0].url` (OpenAPI 3.x) or `scheme://host/basePath` (Swagger 2.0)
- **Auth** from top-level `security` and `securitySchemes` (bearer, basic, API key, OAuth2)
- **Requests** grouped by first tag (or first path segment as fallback)
- **Query params and headers** from operation parameters
- **Request bodies** with example JSON generated from schemas

## API Reference

The backend exposes a REST API that the frontend consumes. You can also use it programmatically.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/collections` | List all collections (tree structure) |
| `GET` | `/api/collections/:id` | Get a single collection |
| `POST` | `/api/collections` | Create a collection |
| `DELETE` | `/api/collections/:id` | Delete a collection |
| `GET` | `/api/collections/:id/requests/:reqId` | Get a single request |
| `PUT` | `/api/collections/:id/requests/:reqId` | Create/update a request |
| `DELETE` | `/api/collections/:id/requests/:reqId` | Delete a request |
| `GET` | `/api/environments` | List all environments |
| `GET` | `/api/environments/:id` | Get a single environment |
| `POST` | `/api/environments` | Create an environment |
| `PUT` | `/api/environments/:id` | Update an environment |
| `DELETE` | `/api/environments/:id` | Delete an environment |
| `POST` | `/api/execute` | Execute a request |
| `POST` | `/api/import` | Import a Postman collection or environment |
| `POST` | `/api/import/openapi` | Import an OpenAPI/Swagger spec (file or URL) |
| `POST` | `/api/oauth2/token` | OAuth 2.0 token exchange |
| `GET` | `/api/oauth2/callback` | OAuth 2.0 callback handler |
| `GET` | `/api/mock-server` | Get status of all running mock servers |
| `POST` | `/api/mock-server` | Start a mock server for a collection |
| `DELETE` | `/api/mock-server` | Stop a mock server |
| `PATCH` | `/api/mock-server` | Reload routes for a running mock server |
| `GET` | `/api/mock-server/log?collectionId=x` | SSE stream of mock server request logs |
| `GET` | `/api/events` | Server-Sent Events for live file changes |

### Execute a request

```bash
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "collectionId": "httpbin",
    "requestId": "httpbin/get-request",
    "environmentId": "dev"
  }'
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser UI                     │
│           (Next.js + React + Zustand)            │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Sidebar  │  │Request Editor│  │ Response   │  │
│  │Collection│  │URL/Headers/  │  │ Body/Hdrs/ │  │
│  │  Tree    │  │Body/Auth     │  │ Timing     │  │
│  └──────────┘  └──────────────┘  └───────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ HTTP + SSE
┌──────────────────────┴──────────────────────────┐
│              Next.js API Routes                   │
│                                                  │
│  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ REST API   │  │  Executor  │  │   File     │  │
│  │ Routes     │  │  (fetch +  │  │  Watcher   │  │
│  │            │  │  auth +    │  │ (chokidar) │  │
│  │            │  │  vars)     │  │     │      │  │
│  └────────────┘  └────────────┘  └─────┼──────┘  │
└──────────────────────────────────────────────────┘
                                         │
                              ┌──────────┴──────────┐
                              │   Workspace (Volume) │
                              │                      │
                              │  collections/*.yaml  │
                              │  environments/*.yaml │
                              └─────────────────────┘
```

**Key design decisions:**
- Requests execute server-side — no CORS issues
- File watcher broadcasts changes via SSE — edit YAML in VS Code and the UI updates live
- IDs are file paths (e.g., `petstore/list-pets`) — stable, human-readable, no UUIDs
- No database — the filesystem is the source of truth

## Docker

### Build and run

```bash
docker compose up --build
```

### Custom workspace

```bash
docker run -p 3000:3000 -v $(pwd)/my-api-workspace:/workspace api-client
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `WORKSPACE_DIR` | `/workspace` | Path to workspace directory inside container |
