# CLAUDE.md

## Project Overview

API Client — a self-hosted, file-based API testing client (like Postman). Runs as a web app (Docker/Next.js) or desktop app (Electron). Everything is stored as YAML files on disk.

## Tech Stack

- **Frontend:** Next.js 15, React 19, Zustand, Tailwind CSS 4, CodeMirror
- **Backend:** Next.js API routes (no database — filesystem only)
- **Desktop:** Electron with embedded Next.js standalone server
- **Build:** pnpm, electron-builder, Docker
- **Language:** TypeScript (strict mode)

## Key Commands

- `pnpm dev` — start Next.js dev server
- `pnpm dev:electron` — start Electron in dev mode
- `pnpm build` — build Next.js for production
- `pnpm build:electron` — build desktop app installers
- `pnpm clean` — remove .next, out, dist

## Guidelines

### README Maintenance

When making changes that affect any of the following, update `README.md` to reflect them:

- Features (added, removed, or modified)
- API endpoints (new routes, changed signatures, removed endpoints)
- File formats (collection.yaml, request YAML, environment YAML schemas)
- Authentication methods
- Scripting APIs (bru.*, req.*, res.*, expect)
- Environment variables or configuration options
- Docker setup or commands
- Desktop app (Electron) build targets, platforms, or behavior
- Quick start steps or prerequisites
- Workspace structure or conventions
- Architecture changes
