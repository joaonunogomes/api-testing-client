# API Client

A self-hosted, file-based API client. Like Postman, but everything is stored as YAML files in your codebase — git-friendly, diff-friendly, and fully version-controlled.

Run it as a Docker container and open it in your browser. No accounts, no cloud sync, no vendor lock-in.

## Features

- **File-based storage** — Collections, requests, and environments are YAML files on disk
- **Git-friendly** — Human-readable diffs, branch per feature, PR reviews for API changes
- **Environments** — Switch between dev/staging/prod with variable substitution (`{{baseUrl}}`)
- **Authentication** — Basic, Bearer, API Key (OAuth 2.0 and AWS Sig v4 coming soon)
- **Variable substitution** — Use `{{variables}}` in URLs, headers, body, and auth fields
- **Built-in dynamic variables** — `{{$guid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`
- **Live reload** — Edit YAML files in your editor and the UI updates instantly via WebSocket
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

# Start backend (serves API on port 3000)
WORKSPACE_DIR=$(pwd)/workspace-example pnpm dev

# In another terminal — start frontend dev server (port 5173, proxies to backend)
pnpm dev:frontend
```

Open [http://localhost:5173](http://localhost:5173).

### Production Build

```bash
pnpm build
```

This builds all three packages. The frontend is compiled to `packages/frontend/dist/` and can be served as static files by the backend.

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

# OAuth 2.0 (coming in Phase 2)
auth:
  type: oauth2
  grantType: client_credentials
  tokenUrl: "{{tokenUrl}}"
  clientId: "{{clientId}}"
  clientSecret: "{{clientSecret}}"
  scope: "read write"

# AWS Signature v4 (coming in Phase 2)
auth:
  type: awsv4
  accessKey: "{{awsAccessKey}}"
  secretKey: "{{awsSecretKey}}"
  region: "{{awsRegion}}"
  service: execute-api
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
| `{{$randomInt}}` | Random integer (0–999999) | `482910` |

Variables can reference other variables (recursive resolution with cycle detection):

```yaml
variables:
  protocol: https
  host: api.example.com
  baseUrl: "{{protocol}}://{{host}}"    # Resolves to https://api.example.com
```

## Scripting (Phase 2 — Coming Soon)

Pre-request and post-response scripts run in a sandboxed JavaScript environment (quickjs-emscripten). Scripts can read/write variables, inspect requests and responses, and run test assertions.

```yaml
scripts:
  pre-request: |
    bru.setVar("startTime", Date.now());
    req.setHeader("X-Custom", "value");

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
| `WS` | `/ws` | WebSocket for live file change events |

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
│              (React + Zustand + Vite)            │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Sidebar  │  │Request Editor│  │ Response   │  │
│  │Collection│  │URL/Headers/  │  │ Body/Hdrs/ │  │
│  │  Tree    │  │Body/Auth     │  │ Timing     │  │
│  └──────────┘  └──────────────┘  └───────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ HTTP + WebSocket
┌──────────────────────┴──────────────────────────┐
│                  Backend (Hono)                   │
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
- File watcher broadcasts changes via WebSocket — edit YAML in VS Code and the UI updates live
- IDs are file paths (e.g., `petstore/list-pets`) — stable, human-readable, no UUIDs
- No database — the filesystem is the source of truth

## Project Structure

```
api-client/
├── packages/
│   ├── shared/          # Types, Zod schemas, variable substitution
│   ├── backend/         # Hono server, routes, services, file watcher
│   └── frontend/        # React SPA, Zustand stores, components
├── workspace-example/   # Example workspace shipped with the project
├── Dockerfile           # Multi-stage production build
├── docker-compose.yml   # Mount workspace and run
└── pnpm-workspace.yaml  # Monorepo config
```

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
