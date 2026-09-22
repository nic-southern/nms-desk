import assert from "node:assert/strict"
import test from "node:test"

import {
  applyAssetIngest,
  applyLockhavenEnvelope,
  applySessionIngest,
} from "./ingest.ts"
import type {
  NewNote,
  NewTicket,
  TicketNote,
  TicketPatch,
  TicketRecord,
  TicketStore,
} from "./types.ts"

function memoryStore(): TicketStore & { tickets: TicketRecord[]; notes: TicketNote[] } {
  const tickets: TicketRecord[] = []
  const notes: TicketNote[] = []
  let n = 0

  function stamp(input: NewTicket, id: string, number: number): TicketRecord {
    const now = new Date("2026-09-16T12:00:00.000Z")
    return {
      id,
      number,
      title: input.title,
      severity: input.severity,
      category: input.category,
      status: input.status ?? "open",
      source: input.source,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      assigneeEmail: input.assigneeEmail ?? null,
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
      createdBySub: input.createdBySub ?? null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: input.resolvedAt ?? null,
    }
  }

  return {
    tickets,
    notes,
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
      const row = stamp(input, `t-${n}`, n)
      tickets.push(row)
      return row
    },
    async update(id: string, patch: TicketPatch) {
      const idx = tickets.findIndex((t) => t.id === id)
      const current = tickets[idx]
      if (idx < 0 || !current) throw new Error("missing")
      const next = { ...current, ...patch, updatedAt: new Date() }
      tickets[idx] = next
      return next
    },
    async addNote(ticketId: string, note: NewNote) {
      const row: TicketNote = {
        id: `n-${notes.length + 1}`,
        ticketId,
        authorEmail: note.authorEmail,
        authorName: note.authorName,
        body: note.body,
        minutes: note.minutes ?? 0,
        createdAt: new Date(),
      }
      notes.push(row)
      return row
    },
  }
}

const alert = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "vpn_handshake_stale",
  severity: "warning",
  title: "Peer missed handshake",
  status: "open",
  organizationId: null,
  siteId: "22222222-2222-4222-8222-222222222222",
  deviceId: "33333333-3333-4333-8333-333333333333",
  detail: { siteName: "Harbor", deviceName: "pos-01", assetTag: null },
}

test("alert.opened creates a CompTIA-shaped ticket and upserts on repeat", async () => {
  const store = memoryStore()
  const first = await applyLockhavenEnvelope(store, {
    version: 1,
    event: "alert.opened",
    occurredAt: "2026-09-16T12:00:00.000Z",
    alert,
    accessRequest: null,
  })
  assert.equal(first.ignored, false)
  if (first.ignored) throw new Error("expected ticket")
  assert.equal(first.created, true)
  assert.equal(first.ticket.source, "alert")
  assert.equal(first.ticket.severity, "high")
  assert.equal(first.ticket.category, "network")
  assert.equal(first.ticket.siteName, "Harbor")
  assert.equal(first.ticket.deviceName, "pos-01")
  assert.equal(first.ticket.requesterName, "Monitoring")

  const again = await applyLockhavenEnvelope(store, {
    version: 1,
    event: "alert.opened",
    occurredAt: "2026-09-16T12:05:00.000Z",
    alert,
    accessRequest: null,
  })
  assert.equal(again.ignored, false)
  if (again.ignored) throw new Error("expected ticket")
  assert.equal(again.created, false)
  assert.equal(store.tickets.length, 1)
  assert.equal(store.notes.at(-1)?.body.includes("again"), true)
})

test("alert.escalated raises severity; alert.resolved writes a close", async () => {
  const store = memoryStore()
  await applyLockhavenEnvelope(store, {
    version: 1,
    event: "alert.opened",
    occurredAt: "2026-09-16T12:00:00.000Z",
    alert,
    accessRequest: null,
  })
  const escalated = await applyLockhavenEnvelope(store, {
    version: 1,
    event: "alert.escalated",
    occurredAt: "2026-09-16T12:10:00.000Z",
    alert: { ...alert, severity: "critical" },
    accessRequest: null,
  })
  assert.equal(escalated.ignored, false)
  if (escalated.ignored) throw new Error("expected ticket")
  assert.equal(escalated.ticket.severity, "critical")

  const resolved = await applyLockhavenEnvelope(store, {
    version: 1,
    event: "alert.resolved",
    occurredAt: "2026-09-16T12:20:00.000Z",
    alert: { ...alert, status: "resolved" },
    accessRequest: null,
  })
  assert.equal(resolved.ignored, false)
  if (resolved.ignored) throw new Error("expected ticket")
  assert.equal(resolved.ticket.status, "resolved")
  assert.ok(resolved.ticket.resolution)
  assert.equal(store.notes.length, 1) // escalate note only; resolve uses update.notes

  const again = await applyLockhavenEnvelope(store, {
    version: 1,
    event: "alert.resolved",
    occurredAt: "2026-09-16T12:25:00.000Z",
    alert: { ...alert, status: "resolved" },
    accessRequest: null,
  })
  assert.equal(again.ignored, false)
  if (again.ignored) throw new Error("expected ticket")
  assert.equal(again.ticket.status, "resolved")
  assert.equal(store.notes.length, 1)
})

test("alert.resolved fails closed when no ticket exists", async () => {
  const store = memoryStore()
  await assert.rejects(
    () =>
      applyLockhavenEnvelope(store, {
        version: 1,
        event: "alert.resolved",
        occurredAt: "2026-09-16T12:20:00.000Z",
        alert: { ...alert, status: "resolved" },
        accessRequest: null,
      }),
    /No ticket found/
  )
  assert.equal(store.tickets.length, 0)
})

test("access.requested opens a VPN/session ticket with device, site, and reason", async () => {
  const store = memoryStore()
  const result = await applyLockhavenEnvelope(store, {
    version: 1,
    event: "access.requested",
    occurredAt: "2026-09-16T13:00:00.000Z",
    alert: null,
    accessRequest: {
      id: "44444444-4444-4444-8444-444444444444",
      siteId: "site-1",
      deviceId: "device-1",
      deviceName: "shop-pc",
      siteName: "Shop",
      requesterName: "Alex Rivera",
      requesterEmail: "alex@example.com",
      reason: "Printer jam during close",
      serviceType: "vnc",
      expiresAt: "2026-09-16T14:00:00.000Z",
    },
    session: {
      id: "sess-9",
      recordingUrl: "https://console.example/recordings/sess-9",
    },
  })
  assert.equal(result.ignored, false)
  if (result.ignored) throw new Error("expected ticket")
  assert.equal(result.ticket.source, "vpn_session")
  assert.equal(result.ticket.deviceName, "shop-pc")
  assert.equal(result.ticket.siteName, "Shop")
  assert.equal(result.ticket.requesterName, "Alex Rivera")
  assert.equal(result.ticket.lockhavenSessionId, "sess-9")
  assert.equal(result.ticket.sessionReason, "Printer jam during close")
  assert.ok(result.ticket.recordingUrl)
})

test("channel.test does not open a ticket", async () => {
  const store = memoryStore()
  const result = await applyLockhavenEnvelope(store, {
    version: 1,
    event: "channel.test",
    occurredAt: "2026-09-16T12:00:00.000Z",
    alert: null,
    accessRequest: null,
  })
  assert.deepEqual(result, { ok: true, ignored: true, reason: "channel.test" })
  assert.equal(store.tickets.length, 0)
})

test("session ingest is idempotent on session id", async () => {
  const store = memoryStore()
  const payload = {
    technicianName: "Jordan Lee",
    technicianEmail: "jordan@example.com",
    deviceName: "office-01",
    siteName: "Office",
    sessionId: "sess-1",
    reason: "Need a shell",
  }
  const first = await applySessionIngest(store, payload)
  const second = await applySessionIngest(store, payload)
  assert.equal(first.ignored, false)
  assert.equal(second.ignored, false)
  if (first.ignored || second.ignored) throw new Error("expected ticket")
  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(store.tickets.length, 1)
})

test("asset ingest opens a ticket with no VPN device", async () => {
  const store = memoryStore()
  const result = await applyAssetIngest(store, {
    title: "Spare switch unlabeled",
    assetTag: "SW-014",
    assetId: "asset-14",
    siteName: "Warehouse",
    requesterName: "Sam Patel",
    requesterEmail: "sam@example.com",
    category: "hardware",
    notes: "Found on the shelf, no serial facing out.",
  })
  assert.equal(result.ignored, false)
  if (result.ignored) throw new Error("expected ticket")
  assert.equal(result.ticket.source, "asset")
  assert.equal(result.ticket.assetTag, "SW-014")
  assert.equal(result.ticket.deviceId, null)
  assert.equal(result.ticket.deviceName, null)
  assert.equal(result.ticket.siteName, "Warehouse")
})
