import type {
  NewNote,
  NewTicket,
  TicketNote,
  TicketPatch,
  TicketRecord,
  TicketStore,
  TicketSeverity,
  TicketCategory,
  TicketSource,
  TicketStatus,
} from "./types.ts"

export function alertTag(alertId: string) {
  return `lh-alert-${alertId}`
}
export function sessionTag(sessionId: string) {
  return `lh-session-${sessionId}`
}
export function accessTag(accessRequestId: string) {
  return `lh-access-${accessRequestId}`
}

export function ticketTags(input: NewTicket): string[] {
  const tags = [
    `source-${input.source}`,
    `severity-${input.severity}`,
    `category-${input.category}`,
  ]
  if (input.lockhavenAlertId) tags.push(alertTag(input.lockhavenAlertId))
  if (input.lockhavenSessionId) tags.push(sessionTag(input.lockhavenSessionId))
  if (input.lockhavenAccessRequestId) {
    tags.push(accessTag(input.lockhavenAccessRequestId))
  }
  if (input.assetTag) tags.push(`asset-${sanitizeTag(input.assetTag)}`)
  return tags
}

export function sanitizeTag(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80)
}

function articleBody(input: NewTicket): string {
  const lines = [
    input.notes?.trim() || input.title,
    "",
    `Severity: ${input.severity}`,
    `Category: ${input.category}`,
    `Requester: ${input.requesterName}`,
  ]
  if (input.requesterEmail) lines.push(`Requester email: ${input.requesterEmail}`)
  if (input.siteName) lines.push(`Site: ${input.siteName}`)
  if (input.siteId) lines.push(`Site id: ${input.siteId}`)
  if (input.deviceName) lines.push(`Device: ${input.deviceName}`)
  if (input.deviceId) lines.push(`Device id: ${input.deviceId}`)
  if (input.assetTag) lines.push(`Asset: ${input.assetTag}`)
  if (input.assetId) lines.push(`Asset id: ${input.assetId}`)
  if (input.lockhavenAlertId) lines.push(`Alert id: ${input.lockhavenAlertId}`)
  if (input.lockhavenSessionId) lines.push(`Session id: ${input.lockhavenSessionId}`)
  if (input.lockhavenAccessRequestId) {
    lines.push(`Access request: ${input.lockhavenAccessRequestId}`)
  }
  if (input.recordingUrl) lines.push(`Recording: ${input.recordingUrl}`)
  if (input.sessionReason) lines.push(`Reason: ${input.sessionReason}`)
  if (input.resolution) lines.push(`Resolution: ${input.resolution}`)
  if (input.timeSpentMinutes) {
    lines.push(`Time spent: ${input.timeSpentMinutes} minutes`)
  }
  lines.push("", "Tags: " + ticketTags(input).join(" "))
  return lines.join("\n").trim()
}

type WsItem = {
  id: number
  workspace_item_number?: number
  key?: string
  title?: string
  description?: string
  status_id?: number
  priority_id?: number
  created_at?: string
  updated_at?: string
  completed_at?: string | null
  status?: { builtin_key?: string; name?: string; category?: { is_completed?: boolean } }
}

function tagsFromDescription(description: string | undefined): string[] {
  if (!description) return []
  const match = description.match(/Tags:\s*(.+)$/m)
  if (!match) {
    const found: string[] = []
    const re =
      /\b((?:lh-alert|lh-session|lh-access|source|severity|category|asset)-[A-Za-z0-9._-]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(description)) !== null) {
      if (m[1]) found.push(m[1])
    }
    return found
  }
  return (match[1] ?? "").trim().split(/\s+/).filter(Boolean)
}

function tagValue(tags: string[], prefix: string): string | null {
  const found = tags.find((tag) => tag.startsWith(prefix))
  if (!found) return null
  return found.slice(prefix.length) || null
}

function taggedEnum<T extends string>(
  tags: string[],
  prefix: string,
  allowed: readonly T[],
  fallback: T
): T {
  const value = tagValue(tags, prefix)
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T
  }
  return fallback
}

function statusFromItem(raw: WsItem): TicketStatus {
  const key = raw.status?.builtin_key?.toLowerCase() ?? ""
  if (key === "done" || key === "closed" || key === "cancelled" || key === "canceled") {
    return "closed"
  }
  if (raw.status?.category?.is_completed) return "resolved"
  if (key.includes("progress")) return "in_progress"
  if (key.includes("wait")) return "waiting"
  return "open"
}

export function recordFromWindshift(raw: WsItem, notes = ""): TicketRecord {
  const tags = tagsFromDescription(raw.description)
  const status = statusFromItem(raw)
  return {
    id: String(raw.id),
    number: Number(raw.workspace_item_number ?? raw.id) || Number(raw.id),
    title: raw.title ?? "",
    severity: taggedEnum(
      tags,
      "severity-",
      ["low", "medium", "high", "critical"] as const,
      "medium"
    ) as TicketSeverity,
    category: taggedEnum(
      tags,
      "category-",
      ["hardware", "software", "network", "access", "account", "other"] as const,
      "other"
    ) as TicketCategory,
    status:
      status === "closed" && notes.toLowerCase().includes("resolved")
        ? "resolved"
        : status,
    source: taggedEnum(
      tags,
      "source-",
      ["manual", "alert", "vpn_session", "asset"] as const,
      "manual"
    ) as TicketSource,
    requesterName: "Customer",
    requesterEmail: "",
    assigneeEmail: null,
    siteName: null,
    siteId: tagValue(tags, "site-"),
    assetTag: tagValue(tags, "asset-"),
    assetId: null,
    deviceId: null,
    deviceName: null,
    lockhavenAlertId: tagValue(tags, "lh-alert-"),
    lockhavenSessionId: tagValue(tags, "lh-session-"),
    lockhavenAccessRequestId: tagValue(tags, "lh-access-"),
    recordingUrl: null,
    sessionReason: null,
    notes,
    timeSpentMinutes: 0,
    resolution: null,
    createdBySub: null,
    createdAt: raw.created_at ? new Date(raw.created_at) : new Date(),
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : new Date(),
    resolvedAt: raw.completed_at ? new Date(raw.completed_at) : null,
  }
}

function priorityIdFor(severity: TicketSeverity, map: Record<string, number>): number | undefined {
  return (
    map[severity] ??
    map[severity === "high" || severity === "critical" ? "high" : "medium"] ??
    map.medium ??
    map.normal
  )
}

export function createWindshiftStore(input: {
  baseUrl: string
  token: string
  workspace: string
  fetchImpl?: typeof fetch
}): TicketStore {
  const baseUrl = input.baseUrl.replace(/\/$/, "")
  const fetchImpl = input.fetchImpl ?? fetch
  let workspaceId: number | null = null
  let priorityMap: Record<string, number> = {}
  let statusMap: Record<string, number> = {}
  let defaultItemTypeId: number | null = null

  async function api(
    path: string,
    init?: RequestInit
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    })
    const text = await response.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }
    return { ok: response.ok, status: response.status, body }
  }

  async function ensureMeta() {
    if (workspaceId != null && defaultItemTypeId != null) return
    const ws = await api("/rest/api/v2/workspaces")
    if (!ws.ok) throw new Error(`windshift workspaces failed: ${ws.status}`)
    const list = ((ws.body as { data?: Array<{ id: number; key: string; name: string }> })
      .data ?? []) as Array<{ id: number; key: string; name: string }>
    const want = input.workspace.trim()
    const match =
      list.find((w) => String(w.id) === want) ||
      list.find((w) => w.key.toLowerCase() === want.toLowerCase()) ||
      list.find((w) => w.name.toLowerCase() === want.toLowerCase())
    if (!match) {
      throw new Error(`windshift workspace not found: ${want}`)
    }
    workspaceId = match.id

    const pri = await api(`/rest/api/v2/workspaces/${workspaceId}/priorities`)
    if (pri.ok) {
      const rows = ((pri.body as { data?: Array<{ id: number; builtin_key?: string; name?: string }> })
        .data ?? [])
      priorityMap = {}
      for (const row of rows) {
        const key = (row.builtin_key || row.name || "").toLowerCase()
        if (key) priorityMap[key] = row.id
        if (key === "normal") priorityMap.medium = row.id
      }
    }

    const st = await api(`/rest/api/v2/workspaces/${workspaceId}/statuses`)
    if (st.ok) {
      const rows = ((st.body as { data?: Array<{ id: number; builtin_key?: string; name?: string }> })
        .data ?? [])
      statusMap = {}
      for (const row of rows) {
        const key = (row.builtin_key || row.name || "").toLowerCase()
        if (key) statusMap[key] = row.id
      }
    }

    const types = await api(`/rest/api/v2/workspaces/${workspaceId}/item-types`)
    if (types.ok) {
      const rows = ((types.body as { data?: Array<{ id: number; builtin_key?: string }> }).data ??
        [])
      defaultItemTypeId =
        rows.find((r) => r.builtin_key === "task")?.id ??
        rows.find((r) => r.builtin_key === "bug")?.id ??
        rows.find((r) => r.builtin_key === "story")?.id ??
        rows[0]?.id ??
        null
    }
  }

  async function load(id: string | number): Promise<TicketRecord | null> {
    const result = await api(`/rest/api/v2/items/${id}`)
    if (result.status === 404) return null
    if (!result.ok) throw new Error(`windshift item ${id} failed: ${result.status}`)
    const raw = (result.body as { data: WsItem }).data
    return recordFromWindshift(raw, raw.description ?? "")
  }

  async function findByTag(tag: string): Promise<TicketRecord | null> {
    await ensureMeta()
    const q = encodeURIComponent(tag)
    const result = await api(
      `/rest/api/v2/items/search?q=${q}&workspace_id=${workspaceId}&page_size=50`
    )
    if (!result.ok) return null
    const list = ((result.body as { data?: WsItem[] }).data ?? []) as WsItem[]
    for (const item of list) {
      const tags = tagsFromDescription(item.description)
      if (tags.includes(tag) || (item.description ?? "").includes(tag)) {
        return recordFromWindshift(item, item.description ?? "")
      }
    }
    return null
  }

  return {
    async findById(id) {
      return load(id)
    },
    async findByAlertId(alertId) {
      return findByTag(alertTag(alertId))
    },
    async findByAccessRequestId(accessRequestId) {
      return findByTag(accessTag(accessRequestId))
    },
    async findBySessionId(sessionId) {
      return findByTag(sessionTag(sessionId))
    },
    async create(ticket: NewTicket) {
      await ensureMeta()
      const payload: Record<string, unknown> = {
        title: ticket.title.slice(0, 240),
        workspace_id: workspaceId,
        description: articleBody(ticket),
        inherit_project: false,
        is_task: false,
        label_ids: [],
        milestone_ids: [],
        custom_field_values: {},
      }
      if (defaultItemTypeId != null) payload.item_type_id = defaultItemTypeId
      const priorityId = priorityIdFor(ticket.severity, priorityMap)
      if (priorityId != null) payload.priority_id = priorityId
      if (ticket.status === "resolved" || ticket.status === "closed") {
        const done = statusMap.done ?? statusMap.closed
        if (done != null) payload.status_id = done
      }

      const result = await api("/rest/api/v2/items", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (!result.ok) {
        throw new Error(`windshift create failed: ${result.status}`)
      }
      const raw = (result.body as { data: WsItem }).data
      return recordFromWindshift(raw, ticket.notes ?? "")
    },
    async update(id, patch: TicketPatch) {
      await ensureMeta()
      const payload: Record<string, unknown> = {}
      if (patch.title) payload.title = patch.title
      if (patch.severity) {
        const priorityId = priorityIdFor(patch.severity, priorityMap)
        if (priorityId != null) payload.priority_id = priorityId
      }
      if (patch.status === "resolved" || patch.status === "closed") {
        const done = statusMap.done ?? statusMap.closed
        if (done != null) payload.status_id = done
      } else if (patch.status === "open") {
        if (statusMap.open != null) payload.status_id = statusMap.open
      } else if (patch.status === "in_progress") {
        const progress =
          statusMap["in_progress"] ?? statusMap["in-progress"] ?? statusMap.progress
        if (progress != null) payload.status_id = progress
      }
      if (patch.resolution || patch.notes) {
        const current = await load(id)
        const extra = patch.resolution
          ? `\n\nResolution: ${patch.resolution}`
          : patch.notes
            ? `\n\n${patch.notes}`
            : ""
        payload.description = `${current?.notes ?? ""}${extra}`.trim()
      }
      if (Object.keys(payload).length > 0) {
        const result = await api(`/rest/api/v2/items/${id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        if (!result.ok) throw new Error(`windshift update failed: ${result.status}`)
      }
      if (patch.resolution || patch.notes) {
        await api(`/rest/api/v2/items/${id}/comments`, {
          method: "POST",
          body: JSON.stringify({
            content: patch.resolution ?? patch.notes,
          }),
        })
      }
      const record = await load(id)
      if (!record) throw new Error(`windshift item ${id} missing after update`)
      return {
        ...record,
        severity: patch.severity ?? record.severity,
        status: patch.status ?? record.status,
        resolution: patch.resolution ?? record.resolution,
        resolvedAt: patch.resolvedAt ?? record.resolvedAt,
      }
    },
    async addNote(ticketId, note: NewNote): Promise<TicketNote> {
      const result = await api(`/rest/api/v2/items/${ticketId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: note.body }),
      })
      if (!result.ok) throw new Error(`windshift note failed: ${result.status}`)
      return {
        id: `note-${ticketId}`,
        ticketId,
        authorEmail: note.authorEmail,
        authorName: note.authorName,
        body: note.body,
        minutes: note.minutes ?? 0,
        createdAt: new Date(),
      }
    },
  }
}

export async function windshiftReady(input: {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
}) {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(
    `${input.baseUrl.replace(/\/$/, "")}/rest/api/v2/workspaces`,
    {
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/json",
      },
    }
  )
  return response.ok
}
