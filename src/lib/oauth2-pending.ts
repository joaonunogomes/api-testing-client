// File-based store for pending OAuth2 browser-redirect flows.
// Uses a temp file so the result survives across Next.js route worker boundaries.

import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

interface PendingResult {
  code?: string;
  error?: string;
  receivedAt: number;
}

const PENDING_DIR = join(tmpdir(), "api-client-oauth2");

function ensureDir() {
  if (!existsSync(PENDING_DIR)) {
    mkdirSync(PENDING_DIR, { recursive: true });
  }
}

function filePath(state: string): string {
  // Sanitize state to be filesystem-safe
  return join(PENDING_DIR, `${state.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

export function setPendingResult(state: string, result: { code?: string; error?: string }) {
  ensureDir();
  const data: PendingResult = { ...result, receivedAt: Date.now() };
  writeFileSync(filePath(state), JSON.stringify(data), "utf-8");
}

export function consumePendingResult(state: string): PendingResult | null {
  const fp = filePath(state);
  try {
    const raw = readFileSync(fp, "utf-8");
    const data = JSON.parse(raw) as PendingResult;
    // Clean up
    try { unlinkSync(fp); } catch {}
    // Ignore if older than 5 minutes
    if (Date.now() - data.receivedAt > 5 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}
