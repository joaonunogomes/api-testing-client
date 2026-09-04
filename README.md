<div align="center">

<img src="assets/icon.png" alt="API Client" width="120" height="120" />

# API Client

**A self-hosted, file-based API client — everything is stored as plain YAML files you own.**

Git-friendly. Diff-friendly. No accounts, no cloud sync, no vendor lock-in.

</div>

<div align="center"><img src="assets/screenshots/demo.gif" alt="API Client demo" width="820" /></div>

---

## What is it?

API Client is a desktop and Docker app for building, sending, and testing HTTP requests. The difference from a typical API client is **where your data lives**: every collection, request, and environment is a human-readable **YAML file on your disk**, not locked inside a proprietary cloud account.

That makes your API workspace behave like the rest of your codebase:

- **Version-controlled** — commit it, branch it, review API changes in a PR
- **Portable** — it's just files; back it up by pushing to git
- **Private** — nothing leaves your machine; there's no account and no telemetry
- **Diffable** — a changed header is a one-line diff, not an opaque blob

If you've ever wanted your API requests to live *next to* the code they test, this is that.

## Features

- **File-based storage** — Collections, requests, and environments are YAML files on disk
- **Sync to any folder** — Link a collection or environment to any folder on your computer (e.g. inside a git repo) so it lives right next to the code it tests
- **Git-friendly** — Human-readable diffs, a branch per feature, PR reviews for API changes
- **Environments** — Switch between dev/staging/prod with variable substitution (`{{baseUrl}}`), each with an optional color to keep them visually distinct
- **Authentication** — Basic, Bearer, API Key, and OAuth 2.0 (Authorization Code, PKCE, Client Credentials, Password, Refresh Token)
- **Variable substitution** — Use `{{variables}}` in URLs, headers, body, and auth fields
- **Dynamic variables** — `{{$guid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`, `{{$randomCompanyName}}`
- **Scripts & tests** — Pre-request and post-response JavaScript with assertions via `ac.test()`
- **Collection import** — Import existing collections and environments (v2.1 format), converted to native YAML
- **OpenAPI import** — Import OpenAPI 3.x / Swagger 2.0 specs (JSON or YAML) from file or URL
- **Live reload** — Edit a YAML file in your editor and the UI updates instantly (Server-Sent Events)
- **Multi-tab interface** — Open requests in reorderable tabs, with duplicate / close-all / close-others actions
- **Mock server** — Spin up a mock HTTP server from any collection and serve defined responses on `localhost`
- **cURL generation** — Turn any request into a ready-to-run cURL command
- **No database** — The filesystem is the source of truth

## Install

### Desktop app

Download the latest installer from the [**Releases**](../../releases) page:

| Platform | Formats |
|----------|---------|
| macOS (Apple Silicon) | `.dmg`, `.zip` |
| macOS (Intel) | `.dmg`, `.zip` |
| Windows | `.exe` (installer), `.exe` (portable) |

The desktop app keeps itself up to date — see [Auto-updates](#auto-updates) below.

### Docker

A multi-arch image (`linux/amd64` + `linux/arm64`) is published with every release:

```bash
# Run the latest release, mounting your own workspace folder
docker run -p 47821:47821 \
  -v $(pwd)/my-api-workspace:/workspace \
  ghcr.io/joaonunogomes/api-testing-client:latest
```

Then open **[http://localhost:47821](http://localhost:47821)**.

To pin a specific version, swap `latest` for a version tag, e.g. `:1.0.10`.

## Getting started

### 1. Point it at a workspace

A **workspace** is just a folder containing `collections/` and `environments/`. The desktop app creates one for you automatically; with Docker you mount your own (the `-v` flag above). Everything you create is written back into that folder as YAML.

```
my-workspace/
├── collections/     # your requests, grouped into collections
└── environments/    # dev / staging / prod variable sets
```

<div align="center"><img src="assets/screenshots/workspace.png" alt="Workspace collections sidebar" width="320" /></div>

### 2. Sync collections & environments to your own folders

You don't have to keep everything inside the app's workspace. **Link** any collection or environment to a folder anywhere on your computer — most usefully, a folder inside a git repo — and the YAML is written and kept in sync there. This puts your API requests under **version control** right *next to* the code they test: commit them, branch them, and review API changes in the same PR as the feature.

- The linked collection/environment is written as plain YAML into the folder you choose, then kept in sync as you edit it in the app.
- Because it's just files in your repo, teammates who clone the repo get the same collections and environments — no export/import step.
- **Secrets stay out of git.** When you link an environment, secret variables are saved as empty strings in its `.env.yaml`, so you can commit the environment's shape without leaking tokens or passwords. Fill the real values in locally.

<div align="center"><img src="assets/screenshots/version-control.gif" alt="Linking a collection to a git repo folder for version control" width="820" /></div>

### 3. Send your first request

Create a request, pick a method, type a URL, and hit **Send**. Use `{{variables}}` anywhere (URL, headers, body, auth) and they'll resolve from the active environment.

<div align="center"><img src="assets/screenshots/request.png" alt="Sending a request and viewing the response" width="820" /></div>

### 4. Set up environments

Define an environment per target (e.g. `dev`, `prod`) with variables like `baseUrl` and `token`. Switch the active environment from the header dropdown; a per-environment color keeps prod visually distinct so you don't fire a test at the wrong place.

### 5. Authentication

Configure auth at the request or collection level: **Basic**, **Bearer**, **API Key**, or **OAuth 2.0** (Authorization Code, PKCE, Client Credentials, Password, and Refresh Token flows). OAuth tokens are fetched and cached for you, with a Token Status panel showing the active token, type, and expiry.

### 6. Bring in what you already have

- **Existing collections** — import a v2.1 collection/environment export; it's converted to native YAML.
- **OpenAPI / Swagger** — import a 3.x or 2.0 spec (file or URL) to scaffold requests.

## Auto-updates

The desktop app checks this repository for new releases and can update itself. Manage it in-app:

1. Open the **Reference** dialog (keyboard icon in the header)
2. Go to the **Settings** tab → **Updates** section (shows the installed version)
3. **Check for updates** runs a manual check; toggle **Automatically check on startup** to opt in/out

When an update is available you'll get a **Download** button, then **Restart to install** — or it installs automatically on the next quit.

> macOS auto-updates require a code-signed build; unsigned builds skip the install step.
> The Updates section only appears in the desktop app — Docker users update by pulling the latest image.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `47821` | Server port |
| `WORKSPACE_DIR` | `/workspace` | Path to the workspace directory (inside the container for Docker) |

## License

Released under the [MIT License](LICENSE).
