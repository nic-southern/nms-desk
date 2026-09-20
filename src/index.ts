import { serve } from "@hono/node-server"

import { createApp } from "./app.ts"
import { isPlaceholder, loadConfig } from "./config.ts"
import { createWindshiftStore, windshiftReady } from "./windshift.ts"

async function main() {
  const config = loadConfig()
  if (isPlaceholder(config.ingestHmacSecret)) {
    throw new Error("replace placeholder secrets in .env before starting")
  }
  if (isPlaceholder(config.zammadToken)) {
    throw new Error("set WINDSHIFT_API_TOKEN before starting")
  }

  const store = createWindshiftStore({
    baseUrl: config.zammadUrl,
    token: config.zammadToken,
    workspace: config.zammadGroup,
  })
  const app = createApp({
    config,
    store,
    ready: () =>
      windshiftReady({
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
