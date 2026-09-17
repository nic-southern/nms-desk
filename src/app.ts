import { Hono } from "hono"
import { z } from "zod"

import type { AppConfig } from "./config.ts"
import { isPlaceholder } from "./config.ts"
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  verifyWebhookSignature,
} from "./hmac.ts"
import {
  applyAssetIngest,
  applyLockhavenEnvelope,
  applySessionIngest,
  IngestError,
} from "./ingest.ts"
import type { TicketStore } from "./types.ts"

export function createApp(input: {
  config: AppConfig
  store: TicketStore
  ready?: () => Promise<boolean>
}) {
  const app = new Hono()

  app.get("/health", async (c) => {
    if (isPlaceholder(input.config.zammadToken)) {
      return c.json({ ok: false, error: "not configured" }, 503)
    }
    if (input.ready) {
      try {
        const ok = await input.ready()
        if (!ok) return c.json({ ok: false, error: "store unavailable" }, 503)
      } catch {
        return c.json({ ok: false, error: "store unavailable" }, 503)
      }
    }
    return c.json({ ok: true })
  })

  async function requireHmac(c: {
    req: { header: (name: string) => string | undefined; text: () => Promise<string> }
  }) {
    const timestamp = c.req.header(WEBHOOK_TIMESTAMP_HEADER) ?? ""
    const signature = c.req.header(WEBHOOK_SIGNATURE_HEADER) ?? ""
    const body = await c.req.text()
    const ok = verifyWebhookSignature({
      secret: input.config.ingestHmacSecret,
      timestamp,
      body,
      signature,
    })
    return { ok, body }
  }

  app.post("/ingest/lockhaven", async (c) => {
    const { ok, body } = await requireHmac(c)
    if (!ok) return c.json({ ok: false, error: "unauthorized" }, 401)
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return c.json({ ok: false, error: "invalid json" }, 400)
    }
    try {
      const result = await applyLockhavenEnvelope(input.store, parsed)
      return c.json(result, 200)
    } catch (error) {
      if (error instanceof IngestError || error instanceof z.ZodError) {
        return c.json({ ok: false, error: "invalid payload" }, 400)
      }
      throw error
    }
  })

  app.post("/ingest/session", async (c) => {
    const { ok, body } = await requireHmac(c)
    if (!ok) return c.json({ ok: false, error: "unauthorized" }, 401)
    try {
      const result = await applySessionIngest(input.store, JSON.parse(body))
      return c.json(result, 200)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ ok: false, error: "invalid payload" }, 400)
      }
      throw error
    }
  })

  app.post("/ingest/asset", async (c) => {
    const { ok, body } = await requireHmac(c)
    if (!ok) return c.json({ ok: false, error: "unauthorized" }, 401)
    try {
      const result = await applyAssetIngest(input.store, JSON.parse(body))
      return c.json(result, 200)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ ok: false, error: "invalid payload" }, 400)
      }
      throw error
    }
  })

  return app
}
