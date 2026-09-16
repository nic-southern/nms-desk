import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import type { Actor } from "./types.ts"

export type DeskSession = {
  user?: Actor
  idToken?: string
  csrf: string
  flash?: string
  oidc?: {
    state: string
    nonce: string
    verifier: string
    returnTo: string
  }
}

const COOKIE = "desk_session"

export function cookieName() {
  return COOKIE
}

export function newCsrf() {
  return randomBytes(16).toString("base64url")
}

export function emptySession(): DeskSession {
  return { csrf: newCsrf() }
}

function encode(secret: string, session: DeskSession) {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url"
  )
  const sig = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

function decode(secret: string, value: string | undefined): DeskSession | null {
  if (!value) return null
  const dot = value.lastIndexOf(".")
  if (dot <= 0) return null
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = createHmac("sha256", secret).update(payload).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!parsed || typeof parsed !== "object" || typeof parsed.csrf !== "string") {
      return null
    }
    return parsed as DeskSession
  } catch {
    return null
  }
}

export function readSession(secret: string, cookieHeader: string | undefined) {
  const cookies = parseCookies(cookieHeader)
  return decode(secret, cookies[COOKIE]) ?? emptySession()
}

export function serializeSession(
  secret: string,
  session: DeskSession,
  secure: boolean
) {
  const value = encode(secret, session)
  const parts = [
    `${COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=43200",
  ]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

export function clearSessionCookie(secure: boolean) {
  const parts = [
    `${COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(";")) {
    const idx = part.indexOf("=")
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    out[key] = val
  }
  return out
}

export function assertCsrf(session: DeskSession, provided: unknown) {
  if (typeof provided !== "string" || provided.length < 8) {
    throw new Error("Missing confirmation token")
  }
  const a = Buffer.from(session.csrf)
  const b = Buffer.from(provided)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("This form expired. Refresh and try again.")
  }
}
