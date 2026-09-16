import { z } from "zod"

import {
  higherSeverity,
  mapAlertCategory,
  mapAlertSeverity,
  type NewTicket,
  type TicketRecord,
  type TicketStore,
} from "./types.ts"

export const lockhavenDeliveryEvents = [
  "alert.opened",
  "alert.resolved",
  "alert.escalated",
  "access.requested",
  "channel.test",
] as const

export const lockhavenEnvelopeSchema = z.object({
  version: z.literal(1),
  event: z.enum(lockhavenDeliveryEvents),
  occurredAt: z.string().min(1),
  alert: z
    .object({
      id: z.string().min(1),
      kind: z.string().optional(),
      severity: z.string().optional(),
      title: z.string().min(1),
      status: z.string().optional(),
      organizationId: z.string().nullable().optional(),
      siteId: z.string().nullable().optional(),
      deviceId: z.string().nullable().optional(),
      detail: z.record(z.unknown()).optional(),
    })
    .nullable()
    .optional(),
  accessRequest: z
    .object({
      id: z.string().min(1),
      organizationId: z.string().optional(),
      siteId: z.string().optional(),
      deviceId: z.string().optional(),
      deviceName: z.string().optional(),
      siteName: z.string().optional(),
      requesterName: z.string().optional(),
      requesterEmail: z.string().optional(),
      reason: z.string().nullable().optional(),
      serviceType: z.string().nullable().optional(),
      expiresAt: z.string().optional(),
    })
    .nullable()
    .optional(),
  session: z
    .object({
      id: z.string().min(1).optional(),
      recordingUrl: z.string().optional(),
      technicianName: z.string().optional(),
      technicianEmail: z.string().optional(),
    })
    .nullable()
    .optional(),
})

export const sessionIngestSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  deviceId: z.string().min(1).optional(),
  deviceName: z.string().min(1).optional(),
  siteId: z.string().min(1).optional(),
  siteName: z.string().min(1).optional(),
  technicianName: z.string().min(1),
  technicianEmail: z.string().email(),
  sessionId: z.string().min(1).optional(),
  accessRequestId: z.string().min(1).optional(),
  recordingUrl: z.string().max(2048).optional(),
  reason: z.string().max(4000).optional(),
  serviceType: z.string().max(80).optional(),
  notes: z.string().max(8000).optional(),
})

export const assetIngestSchema = z.object({
  title: z.string().min(1).max(240),
  assetId: z.string().min(1).optional(),
  assetTag: z.string().min(1).max(120),
  siteId: z.string().min(1).optional(),
  siteName: z.string().min(1).optional(),
  requesterName: z.string().min(1),
  requesterEmail: z.string().email(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  category: z
    .enum(["hardware", "software", "network", "access", "account", "other"])
    .optional(),
  notes: z.string().max(8000).optional(),
})

export type IngestResult =
  | { ok: true; ignored: true; reason: string }
  | { ok: true; ignored: false; ticket: TicketRecord; created: boolean }

function siteNameFromAlert(
  alert: NonNullable<z.infer<typeof lockhavenEnvelopeSchema>["alert"]>
) {
  const detail = alert.detail ?? {}
  const fromDetail =
    (typeof detail.siteName === "string" && detail.siteName) ||
    (typeof detail.site === "string" && detail.site) ||
    null
  return fromDetail
}

function deviceNameFromAlert(
  alert: NonNullable<z.infer<typeof lockhavenEnvelopeSchema>["alert"]>
) {
  const detail = alert.detail ?? {}
  if (typeof detail.deviceName === "string") return detail.deviceName
  if (typeof detail.hostname === "string") return detail.hostname
  return null
}

function assetFromAlert(
  alert: NonNullable<z.infer<typeof lockhavenEnvelopeSchema>["alert"]>
) {
  const detail = alert.detail ?? {}
  return {
    assetId: typeof detail.assetId === "string" ? detail.assetId : null,
    assetTag: typeof detail.assetTag === "string" ? detail.assetTag : null,
  }
}

export async function applyLockhavenEnvelope(
  store: TicketStore,
  raw: unknown
): Promise<IngestResult> {
  const envelope = lockhavenEnvelopeSchema.parse(raw)

  if (envelope.event === "channel.test") {
    return { ok: true, ignored: true, reason: "channel.test" }
  }

  if (
    envelope.event === "alert.opened" ||
    envelope.event === "alert.resolved" ||
    envelope.event === "alert.escalated"
  ) {
    if (!envelope.alert) {
      throw new IngestError("Alert events require an alert snapshot")
    }
    return applyAlertEvent(store, envelope.event, envelope)
  }

  if (envelope.event === "access.requested") {
    if (!envelope.accessRequest) {
      throw new IngestError("Session events require an access request snapshot")
    }
    return applyAccessRequest(store, envelope)
  }

  return { ok: true, ignored: true, reason: "unhandled" }
}

async function applyAlertEvent(
  store: TicketStore,
  event: "alert.opened" | "alert.resolved" | "alert.escalated",
  envelope: z.infer<typeof lockhavenEnvelopeSchema>
): Promise<IngestResult> {
  const alert = envelope.alert!
  const existing = await store.findByAlertId(alert.id)
  const asset = assetFromAlert(alert)
  const severity = mapAlertSeverity(alert.severity)
  const occurred = envelope.occurredAt

  if (!existing) {
    if (event === "alert.resolved") {
      const ticket = await store.create({
        title: alert.title,
        severity,
        category: mapAlertCategory(alert.kind),
        status: "resolved",
        source: "alert",
        requesterName: "Monitoring",
        requesterEmail: "",
        siteId: alert.siteId ?? null,
        siteName: siteNameFromAlert(alert),
        deviceId: alert.deviceId ?? null,
        deviceName: deviceNameFromAlert(alert),
        assetId: asset.assetId,
        assetTag: asset.assetTag,
        lockhavenAlertId: alert.id,
        notes: `Alert resolved at ${occurred}.`,
        resolution: `Alert ${alert.id} resolved.`,
        resolvedAt: new Date(occurred),
      } satisfies NewTicket)
      return { ok: true, ignored: false, ticket, created: true }
    }

    const ticket = await store.create({
      title: alert.title,
      severity,
      category: mapAlertCategory(alert.kind),
      status: "open",
      source: "alert",
      requesterName: "Monitoring",
      requesterEmail: "",
      siteId: alert.siteId ?? null,
      siteName: siteNameFromAlert(alert),
      deviceId: alert.deviceId ?? null,
      deviceName: deviceNameFromAlert(alert),
      assetId: asset.assetId,
      assetTag: asset.assetTag,
      lockhavenAlertId: alert.id,
      notes: `Opened from alert ${alert.id} (${alert.kind ?? "unknown"}).`,
    })
    if (event === "alert.escalated") {
      await store.addNote(ticket.id, {
        authorEmail: "",
        authorName: "Monitoring",
        body: `Alert escalated at ${occurred}.`,
      })
    }
    return { ok: true, ignored: false, ticket, created: true }
  }

  if (event === "alert.opened") {
    await store.addNote(existing.id, {
      authorEmail: "",
      authorName: "Monitoring",
      body: `Alert reported again at ${occurred}.`,
    })
    const ticket =
      existing.status === "resolved" || existing.status === "closed"
        ? await store.update(existing.id, { status: "open", resolvedAt: null, resolution: null })
        : existing
    return { ok: true, ignored: false, ticket, created: false }
  }

  if (event === "alert.escalated") {
    const nextSeverity = higherSeverity(existing.severity, severity)
    const ticket = await store.update(existing.id, { severity: nextSeverity })
    await store.addNote(existing.id, {
      authorEmail: "",
      authorName: "Monitoring",
      body: `Alert escalated at ${occurred}. Severity set to ${nextSeverity}.`,
    })
    return { ok: true, ignored: false, ticket, created: false }
  }

  await store.addNote(existing.id, {
    authorEmail: "",
    authorName: "Monitoring",
    body: `Alert resolved at ${occurred}.`,
  })
  const ticket = await store.update(existing.id, {
    status: existing.status === "closed" ? "closed" : "resolved",
    resolution: existing.resolution ?? `Alert ${alert.id} resolved.`,
    resolvedAt: existing.resolvedAt ?? new Date(occurred),
  })
  return { ok: true, ignored: false, ticket, created: false }
}

async function applyAccessRequest(
  store: TicketStore,
  envelope: z.infer<typeof lockhavenEnvelopeSchema>
): Promise<IngestResult> {
  const request = envelope.accessRequest!
  const existing = await store.findByAccessRequestId(request.id)
  if (existing) {
    await store.addNote(existing.id, {
      authorEmail: request.requesterEmail ?? "",
      authorName: request.requesterName ?? "Technician",
      body: `Remote session requested again at ${envelope.occurredAt}.`,
    })
    return { ok: true, ignored: false, ticket: existing, created: false }
  }

  const session = envelope.session
  const title =
    request.serviceType && request.deviceName
      ? `${request.serviceType} session on ${request.deviceName}`
      : request.deviceName
        ? `Remote session on ${request.deviceName}`
        : "Remote session"

  const ticket = await store.create({
    title,
    severity: "medium",
    category: "access",
    status: "open",
    source: "vpn_session",
    requesterName: request.requesterName || session?.technicianName || "Technician",
    requesterEmail: request.requesterEmail || session?.technicianEmail || "",
    siteId: request.siteId ?? null,
    siteName: request.siteName ?? null,
    deviceId: request.deviceId ?? null,
    deviceName: request.deviceName ?? null,
    lockhavenAccessRequestId: request.id,
    lockhavenSessionId: session?.id ?? null,
    recordingUrl: session?.recordingUrl ?? null,
    sessionReason: request.reason ?? null,
    notes: request.reason
      ? `Reason: ${request.reason}`
      : `Opened from a remote session request (${request.id}).`,
  })
  return { ok: true, ignored: false, ticket, created: true }
}

export async function applySessionIngest(
  store: TicketStore,
  raw: unknown
): Promise<IngestResult> {
  const input = sessionIngestSchema.parse(raw)
  if (input.sessionId) {
    const existing = await store.findBySessionId(input.sessionId)
    if (existing) {
      return { ok: true, ignored: false, ticket: existing, created: false }
    }
  }
  if (input.accessRequestId) {
    const existing = await store.findByAccessRequestId(input.accessRequestId)
    if (existing) {
      return { ok: true, ignored: false, ticket: existing, created: false }
    }
  }

  const title =
    input.title ??
    (input.deviceName
      ? `Remote session on ${input.deviceName}`
      : "Remote session")

  const ticket = await store.create({
    title,
    severity: "medium",
    category: "access",
    status: "open",
    source: "vpn_session",
    requesterName: input.technicianName,
    requesterEmail: input.technicianEmail,
    siteId: input.siteId ?? null,
    siteName: input.siteName ?? null,
    deviceId: input.deviceId ?? null,
    deviceName: input.deviceName ?? null,
    lockhavenSessionId: input.sessionId ?? null,
    lockhavenAccessRequestId: input.accessRequestId ?? null,
    recordingUrl: input.recordingUrl ?? null,
    sessionReason: input.reason ?? null,
    notes:
      input.notes ??
      (input.reason ? `Reason: ${input.reason}` : "Opened from a remote session."),
  })
  return { ok: true, ignored: false, ticket, created: true }
}

export async function applyAssetIngest(
  store: TicketStore,
  raw: unknown
): Promise<IngestResult> {
  const input = assetIngestSchema.parse(raw)
  const ticket = await store.create({
    title: input.title,
    severity: input.severity ?? "medium",
    category: input.category ?? "hardware",
    status: "open",
    source: "asset",
    requesterName: input.requesterName,
    requesterEmail: input.requesterEmail,
    siteId: input.siteId ?? null,
    siteName: input.siteName ?? null,
    assetId: input.assetId ?? null,
    assetTag: input.assetTag,
    deviceId: null,
    deviceName: null,
    notes: input.notes ?? `Opened against inventory ${input.assetTag}.`,
  })
  return { ok: true, ignored: false, ticket, created: true }
}

export class IngestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IngestError"
  }
}
