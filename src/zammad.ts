import type {
  NewNote,
  NewTicket,
  TicketNote,
  TicketPatch,
  TicketRecord,
  TicketSource,
  TicketStatus,
  TicketStore,
  TicketSeverity,
  TicketCategory,
} from "./types.ts"

export const FALLBACK_CUSTOMER_EMAIL = "monitoring@tickets.local"

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

export function priorityName(severity: TicketSeverity): string {
  switch (severity) {
    case "low":
      return "1 low"
    case "high":
    case "critical":
      return "3 high"
    default:
      return "2 normal"
  }
}

export function stateName(status: TicketStatus): string {
  switch (status) {
    case "resolved":
    case "closed":
      return "closed"
    default:
      return "open"
  }
}

export function customerEmail(input: { requesterEmail?: string | null }) {
  const email = input.requesterEmail?.trim() ?? ""
  return email.length > 0 ? email : FALLBACK_CUSTOMER_EMAIL
}

export function articleBody(input: NewTicket): string {
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
  return lines.join("\n").trim()
}

export function buildCreatePayload(input: NewTicket, group: string) {
  return {
    title: input.title,
    group,
    customer_id: `guess:${customerEmail(input)}`,
    state: stateName(input.status ?? "open"),
    priority: priorityName(input.severity),
    tags: ticketTags(input).join(", "),
    article: {
      subject: input.title,
      body: articleBody(input),
      type: "note",
      internal: true,
      sender: "Agent",
    },
  }
}

export function buildUpdatePayload(patch: TicketPatch) {
  const payload: Record<string, unknown> = {}
  if (patch.title) payload.title = patch.title
  if (patch.status) payload.state = stateName(patch.status)
  if (patch.severity) payload.priority = priorityName(patch.severity)
  return payload
}

export function parseTags(tags: string[] | string | null | undefined): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
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

export function recordFromZammad(
  raw: {
    id: number | string
    number?: string | number
    title?: string
    state?: string
    created_at?: string
    updated_at?: string
    close_at?: string | null
  },
  tags: string[],
  notes = ""
): TicketRecord {
  const status: TicketStatus =
    raw.state === "closed" || raw.state === "merged" ? "closed" : "open"
  const source = taggedEnum(
    tags,
    "source-",
    ["manual", "alert", "vpn_session", "asset"] as const,
    "manual"
  ) as TicketSource
  return {
    id: String(raw.id),
    number: Number.parseInt(String(raw.number ?? raw.id), 10) || Number(raw.id),
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
    status: status === "closed" && notes.toLowerCase().includes("resolved")
      ? "resolved"
      : status,
    source,
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
    resolvedAt: raw.close_at ? new Date(raw.close_at) : null,
  }
}

type ZammadTicket = {
  id: number
  number?: string
  title?: string
  state?: string
  tags?: string[] | string
  created_at?: string
  updated_at?: string
  close_at?: string | null
}

export function createZammadStore(input: {
  baseUrl: string
  token: string
  group?: string
  fetchImpl?: typeof fetch
}): TicketStore {
  const baseUrl = input.baseUrl.replace(/\/$/, "")
  const group = input.group ?? "Users"
  const fetchImpl = input.fetchImpl ?? fetch

  async function api(
    path: string,
    init?: RequestInit
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Token token=${input.token}`,
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

  async function tagsFor(id: string | number): Promise<string[]> {
    const result = await api(`/api/v1/tags?object=Ticket&o_id=${id}`)
    if (!result.ok) return []
    const body = result.body as { tags?: string[] } | string[]
    if (Array.isArray(body)) return parseTags(body)
    return parseTags(body.tags)
  }

  async function load(id: string | number): Promise<TicketRecord | null> {
    const result = await api(`/api/v1/tickets/${id}?expand=true`)
    if (result.status === 404) return null
    if (!result.ok) {
      throw new Error(`zammad ticket ${id} failed: ${result.status}`)
    }
    const raw = result.body as ZammadTicket
    const tags = parseTags(raw.tags).length > 0 ? parseTags(raw.tags) : await tagsFor(raw.id)
    return recordFromZammad(raw, tags)
  }

  async function findByTag(tag: string): Promise<TicketRecord | null> {
    const query = encodeURIComponent(`tags:${tag}`)
    const result = await api(`/api/v1/tickets/search?query=${query}`)
    if (result.ok) {
      const body = result.body as ZammadTicket[] | { tickets?: ZammadTicket[] }
      const list = Array.isArray(body) ? body : (body.tickets ?? [])
      const match = list[0]
      if (match) return load(match.id)
    }

    const listed = await api("/api/v1/tickets?per_page=100")
    if (!listed.ok) return null
    const tickets = listed.body as ZammadTicket[]
    for (const ticket of tickets) {
      const tags = parseTags(ticket.tags).length
        ? parseTags(ticket.tags)
        : await tagsFor(ticket.id)
      if (tags.includes(tag)) {
        return recordFromZammad(ticket, tags)
      }
    }
    return null
  }

  async function addTags(id: string, tags: string[]) {
    for (const item of tags) {
      await api("/api/v1/tags/add", {
        method: "POST",
        body: JSON.stringify({ object: "Ticket", o_id: Number(id), item }),
      })
    }
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
      const result = await api("/api/v1/tickets", {
        method: "POST",
        body: JSON.stringify(buildCreatePayload(ticket, group)),
      })
      if (!result.ok) {
        const detail =
          typeof result.body === "string"
            ? result.body.slice(0, 180)
            : JSON.stringify(result.body).slice(0, 180)
        throw new Error(`zammad create failed: ${result.status} ${detail}`)
      }
      const raw = result.body as ZammadTicket
      const tags = ticketTags(ticket)
      await addTags(String(raw.id), tags)
      return recordFromZammad(raw, tags, ticket.notes ?? "")
    },
    async update(id, patch: TicketPatch) {
      const payload = buildUpdatePayload(patch)
      if (patch.notes || patch.resolution) {
        payload.article = {
          subject: patch.resolution ? "Resolution" : "Update",
          body: patch.resolution ?? patch.notes,
          type: "note",
          internal: true,
          sender: "Agent",
        }
      }
      if (patch.severity) {
        await addTags(id, [`severity-${patch.severity}`])
      }
      const result = await api(`/api/v1/tickets/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
      if (!result.ok) {
        throw new Error(`zammad update failed: ${result.status}`)
      }
      const raw = result.body as ZammadTicket
      const tags = parseTags(raw.tags).length ? parseTags(raw.tags) : await tagsFor(raw.id)
      if (patch.severity) tags.push(`severity-${patch.severity}`)
      const record = recordFromZammad(raw, tags)
      return {
        ...record,
        severity: patch.severity ?? record.severity,
        status: patch.status ?? record.status,
        resolution: patch.resolution ?? record.resolution,
        resolvedAt: patch.resolvedAt ?? record.resolvedAt,
      }
    },
    async addNote(ticketId, note: NewNote): Promise<TicketNote> {
      const result = await api(`/api/v1/tickets/${ticketId}`, {
        method: "PUT",
        body: JSON.stringify({
          article: {
            subject: "Note",
            body: note.body,
            type: "note",
            internal: true,
            sender: "Agent",
          },
        }),
      })
      if (!result.ok) {
        throw new Error(`zammad note failed: ${result.status}`)
      }
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

export async function zammadReady(input: {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
}) {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(
    `${input.baseUrl.replace(/\/$/, "")}/api/v1/users/me`,
    {
      headers: {
        Authorization: `Token token=${input.token}`,
      },
    }
  )
  return response.ok
}
