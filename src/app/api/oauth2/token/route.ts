import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const {
    tokenUrl,
    grantType,
    // authorization_code fields
    code,
    callbackUrl,
    codeVerifier,
    // shared fields
    clientId,
    clientSecret,
    scope,
    // password grant fields
    username,
    password,
    // refresh token fields
    refreshToken,
    // extra params
    extraParams,
  } = body;

  if (!tokenUrl) {
    return NextResponse.json(
      { error: "tokenUrl is required" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  params.set("grant_type", grantType || "authorization_code");

  // Grant-specific params
  switch (grantType) {
    case "authorization_code":
    case "authorization_code_pkce":
      params.set("grant_type", "authorization_code");
      if (code) params.set("code", code);
      if (callbackUrl) params.set("redirect_uri", callbackUrl);
      if (codeVerifier) params.set("code_verifier", codeVerifier);
      break;

    case "client_credentials":
      params.set("grant_type", "client_credentials");
      break;

    case "password":
      params.set("grant_type", "password");
      if (username) params.set("username", username);
      if (password) params.set("password", password);
      break;

    case "refresh_token":
      params.set("grant_type", "refresh_token");
      if (refreshToken) params.set("refresh_token", refreshToken);
      break;
  }

  // Shared params
  if (clientId) params.set("client_id", clientId);
  if (clientSecret) params.set("client_secret", clientSecret);
  if (scope) params.set("scope", scope);

  // Extra custom params
  if (extraParams && typeof extraParams === "object") {
    for (const [k, v] of Object.entries(extraParams)) {
      if (typeof v === "string") params.set(k, v);
    }
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Some providers expect Basic auth header for client credentials
    if (
      grantType === "client_credentials" &&
      clientId &&
      clientSecret
    ) {
      headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers,
      body: params.toString(),
    });

    const contentType = response.headers.get("content-type") || "";
    let data: Record<string, unknown>;

    if (contentType.includes("json")) {
      data = await response.json();
    } else {
      // Some providers return form-encoded
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = Object.fromEntries(new URLSearchParams(text));
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "Token exchange failed", details: data },
        { status: response.status },
      );
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Token exchange failed" },
      { status: 500 },
    );
  }
}
