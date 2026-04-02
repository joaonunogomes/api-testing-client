import { NextResponse } from "next/server";
import { setPendingResult } from "@/lib/oauth2-pending";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    // Store for browser-redirect polling
    if (state) setPendingResult(state, { error });

    return new NextResponse(
      `<html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth2-error', error: '${error}' }, '*');
          window.close();
        }
      </script><p>Authentication failed: ${error}. You can close this window.</p></body></html>`,
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

  return new NextResponse(
    `<html><body><script>
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth2-callback', code: '${code}', state: '${state}' }, '*');
        window.close();
      }
    </script><p>Authentication successful! You can close this window.</p></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
