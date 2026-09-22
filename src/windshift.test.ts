import assert from "node:assert/strict"
import test from "node:test"

import {
  createWindshiftStore,
  statusIdForTicketStatus,
} from "./windshift.ts"

test("statusIdForTicketStatus maps done/open and fails closed", () => {
  const map = { open: 1, in_progress: 2, done: 3 }
  assert.equal(statusIdForTicketStatus("open", map), 1)
  assert.equal(statusIdForTicketStatus("in_progress", map), 2)
  assert.equal(statusIdForTicketStatus("resolved", map), 3)
  assert.equal(statusIdForTicketStatus("closed", map), 3)
  assert.throws(() => statusIdForTicketStatus("resolved", { open: 1 }), /completed status/)
  assert.throws(() => statusIdForTicketStatus("open", { done: 3 }), /open status/)
})

test("update transitions status then merge-patches; never PATCHes status_id", async () => {
  const calls: Array<{ path: string; method: string; contentType: string; body: string }> = []
  const item = {
    id: 10,
    workspace_item_number: 10,
    key: "NE-10",
    title: "Peer missed handshake",
    description: "Tags: lh-alert-alert-1 source-alert severity-high category-network",
    status_id: 1,
    status: { builtin_key: "open", name: "Open", category: { is_completed: false } },
    created_at: "2026-09-22T07:00:00.000Z",
    updated_at: "2026-09-22T07:00:00.000Z",
    completed_at: null,
  }

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const path = url.replace("http://windshift.test", "")
    const method = (init?.method ?? "GET").toUpperCase()
    const headers = new Headers(init?.headers)
    const body = typeof init?.body === "string" ? init.body : ""
    calls.push({
      path,
      method,
      contentType: headers.get("content-type") ?? "",
      body,
    })

    if (path === "/rest/api/v2/workspaces" && method === "GET") {
      return new Response(
        JSON.stringify({ data: [{ id: 3, key: "NE", name: "NewMarketEntertainment" }] }),
        { status: 200 }
      )
    }
    if (path.endsWith("/priorities") && method === "GET") {
      return new Response(
        JSON.stringify({
          data: [
            { id: 1, builtin_key: "low", name: "Low" },
            { id: 2, builtin_key: "medium", name: "Medium" },
            { id: 3, builtin_key: "high", name: "High" },
          ],
        }),
        { status: 200 }
      )
    }
    if (path.endsWith("/statuses") && method === "GET") {
      return new Response(
        JSON.stringify({
          data: [
            { id: 1, builtin_key: "open", name: "Open" },
            { id: 2, builtin_key: "in_progress", name: "In Progress" },
            { id: 3, builtin_key: "done", name: "Done" },
          ],
        }),
        { status: 200 }
      )
    }
    if (path.endsWith("/item-types") && method === "GET") {
      return new Response(JSON.stringify({ data: [{ id: 1, builtin_key: "task" }] }), {
        status: 200,
      })
    }
    if (path === "/rest/api/v2/items/10/transition" && method === "POST") {
      assert.equal(JSON.parse(body).to_status_id, 3)
      item.status_id = 3
      item.status = {
        builtin_key: "done",
        name: "Done",
        category: { is_completed: true },
      }
      item.completed_at = "2026-09-22T07:26:00.000Z"
      return new Response(JSON.stringify({ data: { item } }), { status: 200 })
    }
    if (path === "/rest/api/v2/items/10" && method === "PATCH") {
      assert.equal(headers.get("content-type"), "application/merge-patch+json")
      const patch = JSON.parse(body) as Record<string, unknown>
      assert.equal("status_id" in patch, false)
      if (typeof patch.description === "string") item.description = patch.description
      return new Response(JSON.stringify({ data: item }), { status: 200 })
    }
    if (path === "/rest/api/v2/items/10/comments" && method === "POST") {
      return new Response(JSON.stringify({ data: { id: 1 } }), { status: 200 })
    }
    if (path === "/rest/api/v2/items/10" && method === "GET") {
      return new Response(JSON.stringify({ data: item }), { status: 200 })
    }
    return new Response(`unexpected ${method} ${path}`, { status: 500 })
  }) as typeof fetch

  const store = createWindshiftStore({
    baseUrl: "http://windshift.test",
    token: "test-token",
    workspace: "NE",
    fetchImpl,
  })

  const updated = await store.update("10", {
    status: "resolved",
    notes: "Alert resolved at 2026-09-22T07:26:00.000Z.",
    resolution: "Alert alert-1 resolved.",
    resolvedAt: new Date("2026-09-22T07:26:00.000Z"),
  })

  assert.equal(updated.status, "resolved")
  const methods = calls.map((c) => `${c.method} ${c.path}`)
  assert.ok(methods.includes("POST /rest/api/v2/items/10/transition"))
  assert.ok(methods.includes("PATCH /rest/api/v2/items/10"))
  assert.ok(methods.includes("POST /rest/api/v2/items/10/comments"))
  assert.equal(
    calls.some((c) => c.method === "PATCH" && c.body.includes("status_id")),
    false
  )
})
