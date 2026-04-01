"use client";

import { useState } from "react";
import type { AuthConfig, AuthOAuth2 } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import { VariableInput } from "./VariableHighlight";
import { Select } from "./Select";
import { v4 as uuidv4 } from "uuid";

interface AuthEditorProps {
  auth: AuthConfig | undefined;
  collectionAuth: AuthConfig | undefined;
  onChange: (auth: AuthConfig) => void;
}

const GRANT_TYPES = [
  { value: "authorization_code", label: "Authorization Code" },
  { value: "authorization_code_pkce", label: "Authorization Code (PKCE)" },
  { value: "client_credentials", label: "Client Credentials" },
  { value: "password", label: "Password" },
  { value: "implicit", label: "Implicit (legacy)" },
] as const;

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
  hint,
  collectionId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  hint?: string;
  collectionId?: string | null;
}) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      {type === "password" ? (
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent ${mono ? "font-mono" : ""}`}
        />
      ) : (
        <VariableInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          collectionId={collectionId ?? null}
          className={`bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent ${mono ? "font-mono" : ""}`}
        />
      )}
      {hint && <p className="text-[10px] text-text-muted mt-0.5">{hint}</p>}
    </div>
  );
}

function useActiveCollectionId(): string | null {
  const { openTabs, activeTabId } = useAppStore();
  const tab = openTabs.find((t) => t.id === activeTabId);
  return tab?.collectionId ?? null;
}

function TokenStatus() {
  const collectionId = useActiveCollectionId();
  const { oauth2Tokens } = useAppStore();
  const tokenState = collectionId
    ? oauth2Tokens.get(collectionId)
    : null;

  if (!tokenState) return null;

  const isExpired = tokenState.expiresAt
    ? Date.now() > tokenState.expiresAt
    : false;
  const expiresIn = tokenState.expiresAt
    ? Math.max(0, Math.round((tokenState.expiresAt - Date.now()) / 1000))
    : null;

  const formatExpiry = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <div className="bg-bg-tertiary border border-border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">
          Token Status
        </span>
        <div className="flex items-center gap-2">
          {isExpired ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/20 text-error">
              Expired
            </span>
          ) : tokenState.error ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/20 text-error">
              Error
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">
              Active
            </span>
          )}
          <button
            onClick={() => {
              if (collectionId) {
                const tokens = new Map(useAppStore.getState().oauth2Tokens);
                tokens.delete(collectionId);
                useAppStore.setState({ oauth2Tokens: tokens });
              }
            }}
            className="text-[10px] text-text-muted hover:text-error transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {tokenState.error && (
        <p className="text-xs text-error">{tokenState.error}</p>
      )}

      {!tokenState.error && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-16">Token:</span>
            <code className="text-[10px] text-text-secondary font-mono truncate flex-1">
              {tokenState.accessToken.slice(0, 40)}...
            </code>
          </div>
          {tokenState.tokenType && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-16">Type:</span>
              <span className="text-[10px] text-text-secondary">
                {tokenState.tokenType}
              </span>
            </div>
          )}
          {expiresIn !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-16">Expires:</span>
              <span
                className={`text-[10px] ${isExpired ? "text-error" : "text-text-secondary"}`}
              >
                {isExpired ? "Expired" : formatExpiry(expiresIn)}
              </span>
            </div>
          )}
          {tokenState.refreshToken && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-16">Refresh:</span>
              <code className="text-[10px] text-text-secondary font-mono truncate flex-1">
                {tokenState.refreshToken.slice(0, 20)}...
              </code>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OAuth2Editor({
  auth,
  onChange,
}: {
  auth: AuthOAuth2;
  onChange: (auth: AuthOAuth2) => void;
}) {
  const selectedCollectionId = useActiveCollectionId();
  const {
    collections,
    selectedEnvironmentId,
    environments,
    setOAuth2Token,
    oauth2Tokens,
  } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const resolveVar = (template: string) => {
    const collection = collections.find((c) => c.id === selectedCollectionId);
    const environment = selectedEnvironmentId
      ? environments.find((e) => e.id === selectedEnvironmentId)
      : null;

    const vars: Record<string, string> = {
      ...(collection?.variables || {}),
      ...(environment?.variables || {}),
      ...(environment?.secrets || {}),
    };
    return template.replace(/\{\{([^}]+)\}\}/g, (_, name) => {
      return vars[name.trim()] || `{{${name.trim()}}}`;
    });
  };

  const storeToken = (data: Record<string, unknown>) => {
    if (!selectedCollectionId) return;
    if (data.access_token) {
      setOAuth2Token(selectedCollectionId, {
        collectionId: selectedCollectionId,
        accessToken: data.access_token as string,
        refreshToken: data.refresh_token as string | undefined,
        tokenType: data.token_type as string | undefined,
        scope: data.scope as string | undefined,
        expiresAt: data.expires_in
          ? Date.now() + (data.expires_in as number) * 1000
          : undefined,
        acquiredAt: Date.now(),
      });
      setTokenError(null);
    } else {
      setTokenError(
        (data.error_description as string) ||
          (data.error as string) ||
          "No access_token in response",
      );
    }
  };

  // Authorization Code / PKCE flow
  const startAuthCodeFlow = async () => {
    setIsLoading(true);
    setTokenError(null);

    const state = uuidv4();
    const authUrl = resolveVar(auth.authorizationUrl || "");
    const clientId = resolveVar(auth.clientId);
    const callbackUrl = resolveVar(
      auth.callbackUrl || "http://localhost:3000/api/oauth2/callback",
    );
    const scope = resolveVar(auth.scope || "");

    let codeVerifier = "";
    let codeChallenge = "";

    if (auth.grantType === "authorization_code_pkce") {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      codeVerifier = btoa(String.fromCharCode(...array))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(codeVerifier),
      );
      codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: callbackUrl,
      state,
    });
    if (scope) params.set("scope", scope);
    if (auth.audience) params.set("audience", resolveVar(auth.audience));
    if (auth.resource) params.set("resource", resolveVar(auth.resource));
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }

    const authWindow = window.open(
      `${authUrl}?${params.toString()}`,
      "oauth2",
      "width=600,height=700",
    );

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "oauth2-callback") {
        window.removeEventListener("message", handleMessage);
        authWindow?.close();

        try {
          const res = await fetch("/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tokenUrl: resolveVar(auth.tokenUrl),
              grantType: auth.grantType,
              code: event.data.code,
              clientId,
              clientSecret: resolveVar(auth.clientSecret),
              callbackUrl,
              codeVerifier: codeVerifier || undefined,
              scope: scope || undefined,
            }),
          });
          const data = await res.json();
          storeToken(data);
        } catch (err) {
          setTokenError(
            err instanceof Error ? err.message : "Token exchange failed",
          );
        }
        setIsLoading(false);
      } else if (event.data?.type === "oauth2-error") {
        window.removeEventListener("message", handleMessage);
        authWindow?.close();
        setTokenError(event.data.error || "Authorization failed");
        setIsLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);

    // Timeout if window is closed without completing
    const check = setInterval(() => {
      if (authWindow?.closed) {
        clearInterval(check);
        window.removeEventListener("message", handleMessage);
        setIsLoading(false);
      }
    }, 1000);
  };

  // Client Credentials flow
  const startClientCredentialsFlow = async () => {
    setIsLoading(true);
    setTokenError(null);

    try {
      const res = await fetch("/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenUrl: resolveVar(auth.tokenUrl),
          grantType: "client_credentials",
          clientId: resolveVar(auth.clientId),
          clientSecret: resolveVar(auth.clientSecret),
          scope: resolveVar(auth.scope || "") || undefined,
          extraParams: {
            ...(auth.audience ? { audience: resolveVar(auth.audience) } : {}),
            ...(auth.resource ? { resource: resolveVar(auth.resource) } : {}),
          },
        }),
      });
      const data = await res.json();
      storeToken(data);
    } catch (err) {
      setTokenError(
        err instanceof Error ? err.message : "Token request failed",
      );
    }
    setIsLoading(false);
  };

  // Password flow
  const startPasswordFlow = async () => {
    setIsLoading(true);
    setTokenError(null);

    try {
      const res = await fetch("/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenUrl: resolveVar(auth.tokenUrl),
          grantType: "password",
          clientId: resolveVar(auth.clientId),
          clientSecret: resolveVar(auth.clientSecret),
          username: resolveVar(auth.username || ""),
          password: resolveVar(auth.password || ""),
          scope: resolveVar(auth.scope || "") || undefined,
        }),
      });
      const data = await res.json();
      storeToken(data);
    } catch (err) {
      setTokenError(
        err instanceof Error ? err.message : "Token request failed",
      );
    }
    setIsLoading(false);
  };

  // Refresh token
  const refreshTokenFlow = async () => {
    const tokenState = selectedCollectionId
      ? oauth2Tokens.get(selectedCollectionId)
      : null;
    if (!tokenState?.refreshToken) return;

    setIsLoading(true);
    setTokenError(null);

    try {
      const res = await fetch("/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenUrl: resolveVar(auth.tokenUrl),
          grantType: "refresh_token",
          clientId: resolveVar(auth.clientId),
          clientSecret: resolveVar(auth.clientSecret),
          refreshToken: tokenState.refreshToken,
          scope: resolveVar(auth.scope || "") || undefined,
        }),
      });
      const data = await res.json();
      storeToken(data);
    } catch (err) {
      setTokenError(
        err instanceof Error ? err.message : "Token refresh failed",
      );
    }
    setIsLoading(false);
  };

  const handleGetToken = () => {
    switch (auth.grantType) {
      case "authorization_code":
      case "authorization_code_pkce":
        startAuthCodeFlow();
        break;
      case "client_credentials":
        startClientCredentialsFlow();
        break;
      case "password":
        startPasswordFlow();
        break;
    }
  };

  const tokenState = selectedCollectionId
    ? oauth2Tokens.get(selectedCollectionId)
    : null;

  const needsAuthUrl =
    auth.grantType === "authorization_code" ||
    auth.grantType === "authorization_code_pkce" ||
    auth.grantType === "implicit";

  const needsCallback = needsAuthUrl;

  const needsPassword = auth.grantType === "password";

  const update = (fields: Partial<AuthOAuth2>) =>
    onChange({ ...auth, ...fields });

  return (
    <div className="space-y-3">
      {/* Grant type selector */}
      <div>
        <label className="block text-xs text-text-muted mb-1">
          Grant Type
        </label>
        <Select
          value={auth.grantType}
          onChange={(v) => update({ grantType: v })}
          options={GRANT_TYPES.map((g) => ({ value: g.value, label: g.label }))}
          className="w-full"
        />
      </div>

      {/* Config fields */}
      <div className="grid grid-cols-1 gap-2.5">
        {needsAuthUrl && (
          <Field
            label="Authorization URL"
            value={auth.authorizationUrl || ""}
            onChange={(v) => update({ authorizationUrl: v })}
            placeholder="https://provider.com/authorize"
            mono
            collectionId={selectedCollectionId}
          />
        )}

        <Field
          label="Token URL"
          value={auth.tokenUrl}
          onChange={(v) => update({ tokenUrl: v })}
          placeholder="https://provider.com/token"
          mono
          collectionId={selectedCollectionId}
        />

        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Client ID"
            value={auth.clientId}
            onChange={(v) => update({ clientId: v })}
            placeholder="{{clientId}}"
            mono
            collectionId={selectedCollectionId}
          />
          <Field
            label="Client Secret"
            value={auth.clientSecret}
            onChange={(v) => update({ clientSecret: v })}
            placeholder="{{clientSecret}}"
            type="password"
            mono
          />
        </div>

        {needsCallback && (
          <Field
            label="Callback URL"
            value={auth.callbackUrl || ""}
            onChange={(v) => update({ callbackUrl: v })}
            placeholder="http://localhost:3000/api/oauth2/callback"
            mono
            hint="Must match the redirect URI registered with the provider"
            collectionId={selectedCollectionId}
          />
        )}

        <Field
          label="Scope"
          value={auth.scope || ""}
          onChange={(v) => update({ scope: v })}
          placeholder="openid profile email"
          hint="Space-separated scopes"
          collectionId={selectedCollectionId}
        />

        {needsPassword && (
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Username"
              value={auth.username || ""}
              onChange={(v) => update({ username: v })}
              placeholder="{{username}}"
              collectionId={selectedCollectionId}
            />
            <Field
              label="Password"
              value={auth.password || ""}
              onChange={(v) => update({ password: v })}
              placeholder="{{password}}"
              type="password"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Audience"
            value={auth.audience || ""}
            onChange={(v) => update({ audience: v })}
            placeholder="https://api.example.com"
            mono
            hint="Optional — required by some providers (Auth0, etc.)"
            collectionId={selectedCollectionId}
          />
          <Field
            label="Resource"
            value={auth.resource || ""}
            onChange={(v) => update({ resource: v })}
            placeholder="https://graph.microsoft.com"
            mono
            hint="Optional — used by Azure AD"
            collectionId={selectedCollectionId}
          />
        </div>
      </div>

      {/* Token actions */}
      <div className="flex items-center gap-2 pt-1">
        {auth.grantType !== "implicit" && (
          <button
            onClick={handleGetToken}
            disabled={isLoading}
            className="bg-accent text-bg-primary px-4 py-1.5 rounded text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? "Getting Token..."
              : tokenState?.accessToken
                ? "Refresh Token"
                : "Get Token"}
          </button>
        )}
        {tokenState?.refreshToken && (
          <button
            onClick={refreshTokenFlow}
            disabled={isLoading}
            className="text-sm text-accent hover:text-accent-hover border border-accent/30 hover:border-accent/60 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            Use Refresh Token
          </button>
        )}
      </div>

      {/* Error */}
      {tokenError && (
        <div className="bg-error/10 border border-error/30 rounded p-2 text-xs text-error">
          {tokenError}
        </div>
      )}

      {/* Token status */}
      <TokenStatus />
    </div>
  );
}

export function AuthEditor({
  auth,
  collectionAuth,
  onChange,
}: AuthEditorProps) {
  const activeCollectionId = useActiveCollectionId();
  const isInheriting = !auth && !!collectionAuth;
  const effectiveAuth = auth || collectionAuth;
  const authType = auth?.type || (isInheriting ? "inherit" : "none");

  const handleTypeChange = (type: string) => {
    switch (type) {
      case "inherit":
        // Signal to parent to remove auth override
        onChange(undefined as unknown as AuthConfig);
        break;
      case "none":
        onChange({ type: "none" });
        break;
      case "bearer":
        onChange({ type: "bearer", token: "" });
        break;
      case "basic":
        onChange({ type: "basic", username: "", password: "" });
        break;
      case "apikey":
        onChange({ type: "apikey", key: "", value: "", in: "header" });
        break;
      case "oauth2":
        onChange({
          type: "oauth2",
          grantType: "authorization_code_pkce",
          authorizationUrl: "",
          tokenUrl: "",
          clientId: "",
          clientSecret: "",
          callbackUrl: "http://localhost:3000/api/oauth2/callback",
          scope: "",
        });
        break;
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-text-muted mb-1">Auth Type</label>
        <Select
          value={authType}
          onChange={handleTypeChange}
          options={[
            ...(collectionAuth
              ? [{ value: "inherit", label: `Inherit from collection (${collectionAuth.type})` }]
              : []),
            { value: "none", label: "No Auth" },
            { value: "bearer", label: "Bearer Token" },
            { value: "basic", label: "Basic Auth" },
            { value: "apikey", label: "API Key" },
            { value: "oauth2", label: "OAuth 2.0" },
          ]}
          className="w-56"
        />
      </div>

      {/* Inherit notice */}
      {isInheriting && collectionAuth && (
        <div className="bg-bg-tertiary border border-border rounded p-3 text-xs text-text-muted">
          <p>
            Using <strong className="text-text-secondary">{collectionAuth.type}</strong> auth
            from collection defaults.
          </p>
          {collectionAuth.type === "oauth2" && (
            <div className="mt-2">
              <OAuth2Editor
                auth={collectionAuth as AuthOAuth2}
                onChange={onChange}
              />
            </div>
          )}
        </div>
      )}

      {/* Bearer */}
      {auth?.type === "bearer" && (
        <Field
          label="Token"
          value={auth.token}
          onChange={(v) => onChange({ ...auth, token: v })}
          placeholder="{{token}} or paste a raw token"
          mono
          hint="Supports {{variables}} from environments and collections"
          collectionId={activeCollectionId}
        />
      )}

      {/* Basic */}
      {auth?.type === "basic" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Username"
            value={auth.username}
            onChange={(v) => onChange({ ...auth, username: v })}
            placeholder="{{username}}"
            collectionId={activeCollectionId}
          />
          <Field
            label="Password"
            value={auth.password}
            onChange={(v) => onChange({ ...auth, password: v })}
            placeholder="{{password}}"
            type="password"
          />
        </div>
      )}

      {/* API Key */}
      {auth?.type === "apikey" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Key Name"
              value={auth.key}
              onChange={(v) => onChange({ ...auth, key: v })}
              placeholder="X-API-Key"
              collectionId={activeCollectionId}
            />
            <Field
              label="Value"
              value={auth.value}
              onChange={(v) => onChange({ ...auth, value: v })}
              placeholder="{{apiKey}}"
              mono
              collectionId={activeCollectionId}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Add to
            </label>
            <Select
              value={auth.in}
              onChange={(v) =>
                onChange({
                  ...auth,
                  in: v as "header" | "query",
                })
              }
              options={[
                { value: "header", label: "Header" },
                { value: "query", label: "Query Parameter" },
              ]}
            />
          </div>
        </div>
      )}

      {/* OAuth2 */}
      {auth?.type === "oauth2" && (
        <OAuth2Editor auth={auth} onChange={(a) => onChange(a)} />
      )}
    </div>
  );
}
