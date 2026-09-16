import { serve } from "@hono/node-server"

import { createApp } from "./app.ts"
import { isPlaceholder, loadConfig } from "./config.ts"
import { createSql, migrate } from "./db.ts"
import { discoverOidc } from "./oidc.ts"

async function main() {
  const config = loadConfig()
  if (
    isPlaceholder(config.sessionSecret) ||
    isPlaceholder(config.oidcClientSecret) ||
    isPlaceholder(config.ingestHmacSecret)
  ) {
    throw new Error("replace placeholder secrets in .env before starting")
  }

  const sql = createSql(config.databaseUrl)
  await migrate(sql)
  const oidc = await discoverOidc(config)
  const app = createApp({ config, sql, oidc })

  serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
    console.log(`desk listening on ${info.address}:${info.port}`)
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
