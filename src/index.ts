import { serve } from "@hono/node-server"

import { createApp } from "./app.ts"
import { isPlaceholder, loadConfig } from "./config.ts"
import { createZammadStore, zammadReady } from "./zammad.ts"

async function main() {
  const config = loadConfig()
  if (isPlaceholder(config.ingestHmacSecret)) {
    throw new Error("replace placeholder secrets in .env before starting")
  }

  const store = createZammadStore({
    baseUrl: config.zammadUrl,
    token: config.zammadToken,
    group: config.zammadGroup,
  })
  const app = createApp({
    config,
    store,
    ready: () =>
      zammadReady({
        baseUrl: config.zammadUrl,
        token: config.zammadToken,
      }),
  })

  serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
    console.log(`ingest listening on ${info.address}:${info.port}`)
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
