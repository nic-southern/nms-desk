import assert from "node:assert/strict"
import test from "node:test"

import { createApp } from "./app.ts"
import { webhookHeaders } from "./hmac.ts"
import type {
  NewNote,
  NewTicket,
  TicketNote,
  TicketPatch,
  TicketRecord,
  TicketStore,
} from "./types.ts"

function memoryStore(): TicketStore {
  const tickets: TicketRecord[] = []
  let n = 0
  return {
    async findById(id) {
      return tickets.find((t) => t.id === id) ?? null
    },
    async findByAlertId(alertId) {
      return tickets.find((t) => t.lockhavenAlertId === alertId) ?? null
    },
    async findByAccessRequestId(accessRequestId) {
      return tickets.find((t) => t.lockhavenAccessRequestId === accessRequestId) ?? null
    },
    async findBySessionId(sessionId) {
      return tickets.find((t) => t.lockhavenSessionId === sessionId) ?? null
    },
    async create(input: NewTicket) {
      n += 1
      const now = new Date()
      const row: TicketRecord = {
        id: String(n),
        number: n,
        title: input.title,
        severity: input.severity,
        category: input.category,
        status: input.status ?? "open",
        source: input.source,
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        siteName: input.siteName ?? null,
        siteId: input.siteId ?? null,
        assetTag: input.assetTag ?? null,
        assetId: input.assetId ?? null,
        deviceId: input.deviceId ?? null,
        deviceName: input.deviceName ?? null,
        lockhavenAlertId: input.lockhavenAlertId ?? null,
        lockhavenSessionId: input.lockhavenSessionId ?? null,
        lockhavenAccessRequestId: input.lockhavenAccessRequestId ?? null,
        recordingUrl: input.recordingUrl ?? null,
        sessionReason: input.sessionReason ?? null,
        notes: input.notes ?? "",
        timeSpentMinutes: input.timeSpentMinutes ?? 0,
        resolution: input.resolution ?? null,
        createdAt: now,
        updatedAt: now,
        resolvedAt: input.resolvedAt ?? null,
      }
      tickets.push(row)
      return row
    },
    async update(id: string, patch: TicketPatch) {
      const current = tickets.find((t) => t.id === id)
      if (!current) throw new Error("missing")
      Object.assign(current, patch)
      return current
    },
    async addNote(ticketId: string, note: NewNote): Promise<TicketNote> {
      return {
        id: "n-1",
        ticketId,
        authorEmail: note.authorEmail,
        authorName: note.authorName,
        body: note.body,
        minutes: 0,
        createdAt: new Date(),
      }
    },
  }
}

const secret = "channel-secret-value-is-long"
const config = {
  port: 4000,
  ingestHmacSecret: secret,
  zammadUrl: "http://zammad-nginx:8080",
  zammadToken: "token-value-is-long",
  zammadGroup: "Users",
}

test("unsigned ingest is rejected", async () => {
  const app = createApp({ config, store: memoryStore(), ready: async () => true })
  const response = await app.request("/ingest/lockhaven", {
    method: "POST",
    body: JSON.stringify({
      version: 1,
      event: "channel.test",
      occurredAt: "2026-09-16T12:00:00.000Z",
    }),
  })
  assert.equal(response.status, 401)
})

test("signed channel.test is acknowledged without a ticket", async () => {
  const app = createApp({ config, store: memoryStore(), ready: async () => true })
  const body = JSON.stringify({
    version: 1,
    event: "channel.test",
    occurredAt: "2026-09-16T12:00:00.000Z",
    alert: null,
    accessRequest: null,
  })
  const { headers } = webhookHeaders(secret, body)
  const response = await app.request("/ingest/lockhaven", {
    method: "POST",
    headers,
    body,
  })
  assert.equal(response.status, 200)
  const json = (await response.json()) as { ignored: boolean; reason: string }
  assert.equal(json.ignored, true)
  assert.equal(json.reason, "channel.test")
})

test("health is fail-closed when Zammad is down", async () => {
  const app = createApp({
    config,
    store: memoryStore(),
    ready: async () => false,
  })
  const response = await app.request("/health")
  assert.equal(response.status, 503)
})
