import { NextResponse } from "next/server";
import { setPendingResult } from "@/lib/oauth2-pending";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\x3c")
    .replace(/>/g, "\\x3e")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    // Store for browser-redirect polling
    if (state) setPendingResult(state, { error });

    const safeError = escapeJs(error);
    const safeErrorHtml = escapeHtml(error);
    return new NextResponse(
      `<html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth2-error', error: '${safeError}' }, '${escapeJs(origin)}');
          window.close();
        }
      </script><p>Authentication failed: ${safeErrorHtml}. You can close this window.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 },
    );
  }

  // Store for browser-redirect polling
  setPendingResult(state, { code });

  const safeCode = escapeJs(code);
  const safeState = escapeJs(state);
  return new NextResponse(
    `<html><body><script>
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth2-callback', code: '${safeCode}', state: '${safeState}' }, '${escapeJs(origin)}');
        window.close();
      }
    </script><p>Authentication successful! You can close this window.</p></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
