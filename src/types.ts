export const ticketSeverities = [
  "low",
  "medium",
  "high",
  "critical",
] as const
export type TicketSeverity = (typeof ticketSeverities)[number]

export const ticketCategories = [
  "hardware",
  "software",
  "network",
  "access",
  "account",
  "other",
] as const
export type TicketCategory = (typeof ticketCategories)[number]

export const ticketStatuses = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
] as const
export type TicketStatus = (typeof ticketStatuses)[number]

export const ticketSources = [
  "manual",
  "alert",
  "vpn_session",
  "asset",
] as const
export type TicketSource = (typeof ticketSources)[number]

export const changeStatuses = [
  "draft",
  "pending_approval",
  "approved",
  "applied",
  "rejected",
  "rolled_back",
] as const
export type ChangeStatus = (typeof changeStatuses)[number]

export const changeActions = [
  "submit",
  "approve",
  "reject",
  "apply",
  "rollback",
] as const
export type ChangeAction = (typeof changeActions)[number]

export type Actor = {
  sub: string
  email: string
  name: string
}

export type TicketRecord = {
  id: string
  number: number
  title: string
  severity: TicketSeverity
  category: TicketCategory
  status: TicketStatus
  source: TicketSource
  requesterName: string
  requesterEmail: string
  assigneeEmail: string | null
  siteName: string | null
  siteId: string | null
  assetTag: string | null
  assetId: string | null
  deviceId: string | null
  deviceName: string | null
  lockhavenAlertId: string | null
  lockhavenSessionId: string | null
  lockhavenAccessRequestId: string | null
  recordingUrl: string | null
  sessionReason: string | null
  notes: string
  timeSpentMinutes: number
  resolution: string | null
  createdBySub: string | null
  createdAt: Date
  updatedAt: Date
  resolvedAt: Date | null
}

export type TicketNote = {
  id: string
  ticketId: string
  authorEmail: string
  authorName: string
  body: string
  minutes: number
  createdAt: Date
}

export type NewTicket = {
  title: string
  severity: TicketSeverity
  category: TicketCategory
  status?: TicketStatus
  source: TicketSource
  requesterName: string
  requesterEmail: string
  assigneeEmail?: string | null
  siteName?: string | null
  siteId?: string | null
  assetTag?: string | null
  assetId?: string | null
  deviceId?: string | null
  deviceName?: string | null
  lockhavenAlertId?: string | null
  lockhavenSessionId?: string | null
  lockhavenAccessRequestId?: string | null
  recordingUrl?: string | null
  sessionReason?: string | null
  notes?: string
  timeSpentMinutes?: number
  resolution?: string | null
  createdBySub?: string | null
  resolvedAt?: Date | null
}

export type TicketPatch = Partial<
  Pick<
    TicketRecord,
    | "title"
    | "severity"
    | "category"
    | "status"
    | "assigneeEmail"
    | "notes"
    | "timeSpentMinutes"
    | "resolution"
    | "resolvedAt"
  >
>

export type NewNote = {
  authorEmail: string
  authorName: string
  body: string
  minutes?: number
}

export type ChangeRecord = {
  id: string
  number: number
  title: string
  summary: string
  status: ChangeStatus
  requestedByEmail: string
  requestedByName: string
  approvedByEmail: string | null
  approvedAt: Date | null
  lockhavenAccessRequestId: string | null
  rollbackPlan: string
  appliedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ChangeEvent = {
  id: string
  changeId: string
  actorEmail: string
  actorName: string
  action: string
  detail: Record<string, unknown>
  createdAt: Date
}

export type TicketStore = {
  findById(id: string): Promise<TicketRecord | null>
  findByAlertId(alertId: string): Promise<TicketRecord | null>
  findByAccessRequestId(accessRequestId: string): Promise<TicketRecord | null>
  findBySessionId(sessionId: string): Promise<TicketRecord | null>
  create(input: NewTicket): Promise<TicketRecord>
  update(id: string, patch: TicketPatch): Promise<TicketRecord>
  addNote(ticketId: string, note: NewNote): Promise<TicketNote>
}

export function mapAlertSeverity(
  severity: string | null | undefined
): TicketSeverity {
  switch (severity) {
    case "critical":
      return "critical"
    case "warning":
      return "high"
    case "notice":
      return "medium"
    default:
      return "low"
  }
}

export function mapAlertCategory(kind: string | null | undefined): TicketCategory {
  const value = (kind ?? "").toLowerCase()
  if (
    value.includes("vpn") ||
    value.includes("firewall") ||
    value.includes("network") ||
    value.includes("handshake")
  ) {
    return "network"
  }
  if (
    value.includes("login") ||
    value.includes("access") ||
    value.includes("session") ||
    value.includes("auth")
  ) {
    return "access"
  }
  if (
    value.includes("agent") ||
    value.includes("device") ||
    value.includes("disk") ||
    value.includes("hardware")
  ) {
    return "hardware"
  }
  if (value.includes("package") || value.includes("software") || value.includes("update")) {
    return "software"
  }
  if (value.includes("account") || value.includes("user")) {
    return "account"
  }
  return "other"
}

export function displayTicketNumber(number: number) {
  return `T-${String(number).padStart(4, "0")}`
}

export function displayChangeNumber(number: number) {
  return `CHG-${String(number).padStart(4, "0")}`
}

export function sourceLabel(source: TicketSource) {
  switch (source) {
    case "alert":
      return "From an alert"
    case "vpn_session":
      return "From a remote session"
    case "asset":
      return "Against inventory"
    default:
      return "Opened here"
  }
}

export function statusLabel(status: TicketStatus) {
  switch (status) {
    case "in_progress":
      return "In progress"
    case "waiting":
      return "Waiting"
    case "resolved":
      return "Resolved"
    case "closed":
      return "Closed"
    default:
      return "Open"
  }
}

export function changeStatusLabel(status: ChangeStatus) {
  switch (status) {
    case "pending_approval":
      return "Pending approval"
    case "approved":
      return "Approved"
    case "applied":
      return "Applied"
    case "rejected":
      return "Rejected"
    case "rolled_back":
      return "Rolled back"
    default:
      return "Draft"
  }
}

export function severityRank(severity: TicketSeverity) {
  return ticketSeverities.indexOf(severity)
}

export function higherSeverity(a: TicketSeverity, b: TicketSeverity): TicketSeverity {
  return severityRank(a) >= severityRank(b) ? a : b
}

export function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}
