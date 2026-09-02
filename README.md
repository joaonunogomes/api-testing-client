# API Client — Releases

This repository hosts the **published installers and auto-update metadata** for
[API Client](https://github.com/joaonunogomes/api-testing-client), a self-hosted,
file-based API testing client.

The application source lives in a private repository. This public repo exists so
that the desktop app's auto-updater (`electron-updater`) can fetch releases
anonymously — no authentication token is ever shipped inside the app.

## Download

Grab the latest installer from the [Releases](../../releases) page:

| Platform | Formats |
|----------|---------|
| macOS (Apple Silicon) | `.dmg`, `.zip` |
| macOS (Intel) | `.dmg`, `.zip` |
| Windows | `.exe` (installer), `.exe` (portable) |

Once installed, the desktop app updates itself automatically from this repo.

## What's in a release

Each release contains the platform installers plus the update-metadata files the
updater relies on:

- `latest-mac.yml`, `latest.yml` — version/checksum manifests
- `*.dmg`, `*-mac.zip`, `*.exe` and their `*.blockmap` files

## How releases are published

Releases are built by CI in the (private) source repo. Pushing a `v*` tag there
triggers the `Build Installers` workflow, which builds the macOS and Windows
installers and uploads them here.

> No source code is stored in this repository — only release artifacts.
