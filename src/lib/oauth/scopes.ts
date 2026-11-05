const supportedScopes = new Set([
  "email",
  "openid",
  "profile",
  // Supabase advertises phone as a standard OIDC scope. Some MCP clients
  // request every advertised identity scope by default. Identity scopes never
  // replace the explicit workspace/media grant or its RLS checks.
  "phone",
  "offline_access",
])

export const isSupportedConsentScope = (scope: string) =>
  scope
    .split(/\s+/)
    .filter(Boolean)
    .every((value) => supportedScopes.has(value))
