function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`missing ${name}`)
  }
  return value
}

function optional(name: string, fallback: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : fallback
}

export function loadConfig() {
  const port = Number(optional("PORT", "4000"))
  if (!Number.isInteger(port) || port < 1) {
    throw new Error("PORT must be a positive integer")
  }

  return {
    port,
    productName: optional("PRODUCT_NAME", "Tickets"),
    publicHost: optional("PUBLIC_HOST", "tickets.newmarketsecurity.com"),
    publicUrl: optional("PUBLIC_URL", "http://localhost:4000").replace(/\/$/, ""),
    databaseUrl: required("DATABASE_URL"),
    sessionSecret: required("SESSION_SECRET"),
    oidcIssuer: optional(
      "OIDC_ISSUER",
      "https://auth.newmarketsecurity.com/realms/nms"
    ),
    oidcClientId: optional("OIDC_CLIENT_ID", "tickets"),
    oidcClientSecret: required("OIDC_CLIENT_SECRET"),
    oidcScopes: optional("OIDC_SCOPES", "openid profile email"),
    ingestHmacSecret: required("INGEST_HMAC_SECRET"),
  }
}

export type AppConfig = ReturnType<typeof loadConfig>

export function isPlaceholder(value: string) {
  return value === "replace_me" || value.length < 8
}
