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
    ingestHmacSecret: required("INGEST_HMAC_SECRET"),
    zammadUrl: optional(
      "WINDSHIFT_URL",
      optional("ZAMMAD_URL", "http://windshift:8080")
    ).replace(/\/$/, ""),
    zammadToken: optional(
      "WINDSHIFT_API_TOKEN",
      optional("ZAMMAD_INGEST_TOKEN", "")
    ),
    zammadGroup: optional(
      "WINDSHIFT_WORKSPACE",
      optional("ZAMMAD_GROUP", "Users")
    ),
  }
}

export type AppConfig = ReturnType<typeof loadConfig>

export function isPlaceholder(value: string) {
  return !value || value === "replace_me" || value.length < 8
}
