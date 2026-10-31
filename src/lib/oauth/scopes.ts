const supportedScopes = new Set([
  "email",
  "openid",
  "profile",
  "offline_access",
])

export const isSupportedConsentScope = (scope: string) =>
  scope
    .split(/\s+/)
    .filter(Boolean)
    .every((value) => supportedScopes.has(value))
