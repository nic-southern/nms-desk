import assert from "node:assert/strict"
import test from "node:test"

import type { NewTicket } from "./types.ts"
import {
  FALLBACK_CUSTOMER_EMAIL,
  alertTag,
  articleBody,
  buildCreatePayload,
  buildUpdatePayload,
  createZammadStore,
  priorityName,
  recordFromZammad,
  ticketTags,
} from "./zammad.ts"

const sample: NewTicket = {
  title: "Peer missed handshake",
  severity: "high",
  category: "network",
  source: "alert",
  requesterName: "Monitoring",
  requesterEmail: "",
  siteName: "Harbor",
  deviceName: "pos-01",
  lockhavenAlertId: "alert-1",
  notes: "Opened from alert alert-1 (vpn).",
}

test("maps CompTIA fields onto Zammad tags, priority, and article body", () => {
  const payload = buildCreatePayload(sample, "Users")
  assert.equal(payload.customer_id, `guess:${FALLBACK_CUSTOMER_EMAIL}`)
  assert.equal(payload.priority, "3 high")
  assert.equal(payload.state, "open")
  assert.match(payload.tags, /lh-alert-alert-1/)
  assert.match(payload.tags, /severity-high/)
  assert.match(payload.tags, /category-network/)
  assert.match(payload.tags, /source-alert/)
  assert.match(articleBody(sample), /Site: Harbor/)
  assert.match(articleBody(sample), /Device: pos-01/)
  assert.equal(priorityName("medium"), "2 normal")
  assert.equal(priorityName("critical"), "3 high")
  assert.ok(ticketTags(sample).includes(alertTag("alert-1")))
})

test("closes resolved tickets in Zammad", () => {
  const payload = buildUpdatePayload({ status: "resolved", resolution: "Alert alert-1 resolved." })
  assert.equal(payload.state, "closed")
})

test("parses Zammad tags back into desk fields", () => {
  const record = recordFromZammad(
    { id: 12, number: "22012", title: "Peer missed handshake", state: "open" },
    ["source-alert", "severity-high", "category-network", "lh-alert-alert-1"]
  )
  assert.equal(record.id, "12")
  assert.equal(record.source, "alert")
  assert.equal(record.severity, "high")
  assert.equal(record.category, "network")
  assert.equal(record.lockhavenAlertId, "alert-1")
})

test("store creates a ticket then finds it by alert tag", async () => {
  const tickets: Record<string, unknown>[] = []
  const tagsById = new Map<number, string[]>()

  const store = createZammadStore({
    baseUrl: "http://zammad.example",
    token: "test-token",
    fetchImpl: async (url, init) => {
      const path = String(url)
      if (path.endsWith("/api/v1/tickets") && init?.method === "POST") {
        const created = {
          id: 7,
          number: "22007",
          title: "Peer missed handshake",
          state: "open",
          created_at: "2026-09-16T12:00:00.000Z",
          updated_at: "2026-09-16T12:00:00.000Z",
        }
        tickets.push(created)
        return new Response(JSON.stringify(created), { status: 201 })
      }
      if (path.includes("/api/v1/tags/add") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { o_id: number; item: string }
        const list = tagsById.get(body.o_id) ?? []
        list.push(body.item)
        tagsById.set(body.o_id, list)
        return new Response("{}", { status: 200 })
      }
      if (path.includes("/api/v1/tickets/search")) {
        assert.match(path, /tags%3Alh-alert-alert-1/)
        return new Response(JSON.stringify([{ id: 7, title: "Peer missed handshake" }]), {
          status: 200,
        })
      }
      if (path.includes("/api/v1/tickets/7")) {
        return new Response(
          JSON.stringify({
            id: 7,
            number: "22007",
            title: "Peer missed handshake",
            state: "open",
            tags: tagsById.get(7) ?? [],
          }),
          { status: 200 }
        )
      }
      return new Response("not found", { status: 404 })
    },
  })

  const created = await store.create(sample)
  assert.equal(created.id, "7")
  const found = await store.findByAlertId("alert-1")
  assert.equal(found?.id, "7")
  assert.ok((tagsById.get(7) ?? []).includes("lh-alert-alert-1"))
})
