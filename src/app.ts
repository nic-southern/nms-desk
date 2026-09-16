import { Hono, type Context } from "hono"
import { randomBytes } from "node:crypto"
import * as client from "openid-client"
import type postgres from "postgres"
import { z } from "zod"

import { transitionChange, ChangeTransitionError } from "./changes.ts"
import type { AppConfig } from "./config.ts"
import {
  createChange,
  createTicketStore,
  getChange,
  listChangeEvents,
  listChanges,
  recordIngest,
  saveChangeTransition,
} from "./db.ts"
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  verifyWebhookSignature,
} from "./hmac.ts"
import {
  changeDetailPage,
  changeForm,
  changeListPage,
  layout,
  signInPage,
  ticketDetailPage,
  ticketForm,
  ticketListPage,
} from "./html.ts"
import {
  applyAssetIngest,
  applyLockhavenEnvelope,
  applySessionIngest,
  IngestError,
} from "./ingest.ts"
import {
  buildLoginUrl,
  buildLogoutUrl,
  callbackUrl,
  finishLogin,
  publicRequestUrl,
  type OidcConfig,
} from "./oidc.ts"
import {
  assertCsrf,
  clearSessionCookie,
  emptySession,
  newCsrf,
  readSession,
  serializeSession,
  type DeskSession,
} from "./session.ts"
import {
  blankToNull,
  ticketCategories,
  ticketSeverities,
  type TicketStatus,
} from "./types.ts"

type Env = {
  Variables: {
    session: DeskSession
    config: AppConfig
  }
}

type DeskContext = Context<Env>

const ticketFormSchema = z.object({
  csrf: z.string(),
  title: z.string().trim().min(1).max(240),
  severity: z.enum(ticketSeverities),
  category: z.enum(ticketCategories),
  requesterName: z.string().trim().min(1).max(200),
  requesterEmail: z.string().trim().email().or(z.literal("")).default(""),
  siteName: z.string().trim().max(200).optional(),
  assetTag: z.string().trim().max(120).optional(),
  deviceName: z.string().trim().max(200).optional(),
  notes: z.string().max(8000).optional(),
  minutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
})

const changeFormSchema = z.object({
  csrf: z.string(),
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(8000),
  rollbackPlan: z.string().trim().min(1).max(8000),
  accessRequestId: z.string().trim().max(120).optional(),
})

export function createApp(input: {
  config: AppConfig
  sql: postgres.Sql
  oidc: OidcConfig
}) {
  const store = createTicketStore(input.sql)
  const app = new Hono<Env>()
  const secure = input.config.publicUrl.startsWith("https://")

  app.use("*", async (c, next) => {
    c.set("config", input.config)
    c.set("session", readSession(input.config.sessionSecret, c.req.header("cookie")))
    await next()
    const session = c.get("session")
    if (session.flash) {
      session.flash = undefined
    }
    if (!c.res.headers.get("set-cookie")?.includes("desk_session=")) {
      c.header("Set-Cookie", serializeSession(input.config.sessionSecret, session, secure))
    }
  })

  app.get("/health/live", (c) => c.json({ ok: true }))

  app.get("/health", async (c) => {
    try {
      const ok = await store.ping()
      if (!ok) {
        return c.json({ ok: false, error: "store unavailable" }, 503)
      }
      return c.json({ ok: true })
    } catch {
      return c.json({ ok: false, error: "store unavailable" }, 503)
    }
  })

  app.get("/login", async (c) => {
    const session = c.get("session")
    if (session.user) return c.redirect("/tickets")
    const state = randomBytes(16).toString("base64url")
    const nonce = randomBytes(16).toString("base64url")
    const verifier = client.randomPKCECodeVerifier()
    session.oidc = {
      state,
      nonce,
      verifier,
      returnTo: c.req.query("returnTo") || "/tickets",
    }
    const url = await buildLoginUrl({
      oidc: input.oidc,
      publicUrl: input.config.publicUrl,
      scopes: input.config.oidcScopes,
      state,
      nonce,
      verifier,
    })
    return c.redirect(url.href)
  })

  const handleCallback = async (c: DeskContext) => {
    const session = c.get("session")
    if (!session.oidc) {
      return html(c, signInPage(input.config.productName, "Sign-in expired. Try again."), 400)
    }
    try {
      const current = publicRequestUrl(input.config.publicUrl, c.req.url)
      if (!current.searchParams.has("state")) {
        current.searchParams.set("state", session.oidc.state)
      }
      const result = await finishLogin({
        oidc: input.oidc,
        publicUrl: input.config.publicUrl,
        currentUrl: current,
        verifier: session.oidc.verifier,
        state: session.oidc.state,
        nonce: session.oidc.nonce,
      })
      const returnTo = session.oidc.returnTo || "/tickets"
      session.user = result.actor
      session.idToken = result.idToken
      session.oidc = undefined
      session.csrf = newCsrf()
      c.set("session", session)
      c.header("Set-Cookie", serializeSession(input.config.sessionSecret, session, secure))
      return c.redirect(returnTo.startsWith("/") ? returnTo : "/tickets")
    } catch (error) {
      session.oidc = undefined
      return html(
        c,
        signInPage(
          input.config.productName,
          error instanceof Error ? "We could not complete sign-in." : "We could not complete sign-in."
        ),
        401
      )
    }
  }

  app.get("/api/auth/callback/tickets", (c) => handleCallback(c))
  app.get("/api/auth/oauth2/callback/tickets", (c) => handleCallback(c))

  app.post("/logout", async (c) => {
    const session = c.get("session")
    const body = await c.req.parseBody()
    try {
      assertCsrf(session, body.csrf)
    } catch {
      return c.redirect("/")
    }
    const idToken = session.idToken
    c.set("session", emptySession())
    c.header("Set-Cookie", clearSessionCookie(secure))
    try {
      const url = buildLogoutUrl({
        oidc: input.oidc,
        publicUrl: input.config.publicUrl,
        idToken,
      })
      return c.redirect(url.href)
    } catch {
      return c.redirect("/")
    }
  })

  app.get("/", (c) => {
    if (!c.get("session").user) {
      return html(c, signInPage(input.config.productName))
    }
    return c.redirect("/tickets")
  })

  app.get("/tickets", async (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    const status = (c.req.query("status") || "open") as TicketStatus | "all"
    const q = c.req.query("q") || ""
    const tickets = await store.listTickets({ status, q })
    return page(
      c,
      "Tickets",
      ticketListPage({ tickets, status, q })
    )
  })

  app.get("/tickets/new", (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    return page(c, "New ticket", ticketForm(c.get("session").csrf))
  })

  app.post("/tickets", async (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    const session = c.get("session")
    const parsed = ticketFormSchema.safeParse(await c.req.parseBody())
    if (!parsed.success) {
      session.flash = "Check the ticket fields and try again."
      return c.redirect("/tickets/new")
    }
    try {
      assertCsrf(session, parsed.data.csrf)
    } catch {
      session.flash = "This form expired. Refresh and try again."
      return c.redirect("/tickets/new")
    }
    const assetTag = blankToNull(parsed.data.assetTag)
    const deviceName = blankToNull(parsed.data.deviceName)
    const ticket = await store.create({
      title: parsed.data.title,
      severity: parsed.data.severity,
      category: parsed.data.category,
      source: assetTag && !deviceName ? "asset" : "manual",
      requesterName: parsed.data.requesterName,
      requesterEmail: parsed.data.requesterEmail,
      siteName: blankToNull(parsed.data.siteName),
      assetTag,
      deviceName,
      notes: parsed.data.notes ?? "",
      timeSpentMinutes: parsed.data.minutes ?? 0,
      createdBySub: user.sub,
    })
    if ((parsed.data.minutes ?? 0) > 0 || parsed.data.notes) {
      await store.addNote(ticket.id, {
        authorEmail: user.email,
        authorName: user.name,
        body: parsed.data.notes || "Ticket opened.",
        minutes: parsed.data.minutes ?? 0,
      })
    }
    session.flash = "Ticket opened."
    return c.redirect(`/tickets/${ticket.id}`)
  })

  app.get("/tickets/:id", async (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    const ticket = await store.findById(c.req.param("id"))
    if (!ticket) return page(c, "Not found", `<p class="empty">That ticket does not exist.` + `<` + `/p>`, 404)
    const notes = await store.listNotes(ticket.id)
    return page(c, ticket.title, ticketDetailPage({ ticket, notes, csrf: c.get("session").csrf }))
  })

  app.post("/tickets/:id/notes", async (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    const session = c.get("session")
    const ticket = await store.findById(c.req.param("id"))
    if (!ticket) return c.redirect("/tickets")
    const body = await c.req.parseBody()
    try {
      assertCsrf(session, body.csrf)
    } catch {
      session.flash = "This form expired. Refresh and try again."
      return c.redirect(`/tickets/${ticket.id}`)
    }
    const note = String(body.body ?? "").trim()
    const minutes = Number(body.minutes ?? 0)
    if (!note) {
      session.flash = "Write a note before saving."
      return c.redirect(`/tickets/${ticket.id}`)
    }
    await store.addNote(ticket.id, {
      authorEmail: user.email,
      authorName: user.name,
      body: note,
      minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0,
    })
    if (ticket.status === "open") {
      await store.update(ticket.id, { status: "in_progress" })
    }
    return c.redirect(`/tickets/${ticket.id}`)
  })

  app.post("/tickets/:id/resolve", async (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    const session = c.get("session")
    const ticket = await store.findById(c.req.param("id"))
    if (!ticket) return c.redirect("/tickets")
    const body = await c.req.parseBody()
    try {
      assertCsrf(session, body.csrf)
    } catch {
      return c.redirect(`/tickets/${ticket.id}`)
    }
    const resolution = String(body.resolution ?? "").trim()
    if (!resolution) {
      session.flash = "A written close is required."
      return c.redirect(`/tickets/${ticket.id}`)
    }
    await store.addNote(ticket.id, {
      authorEmail: user.email,
      authorName: user.name,
      body: `Resolved: ${resolution}`,
    })
    await store.update(ticket.id, {
      status: "resolved",
      resolution,
      resolvedAt: new Date(),
    })
    session.flash = "Ticket resolved."
    return c.redirect(`/tickets/${ticket.id}`)
  })

  app.post("/tickets/:id/reopen", async (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    const session = c.get("session")
    const ticket = await store.findById(c.req.param("id"))
    if (!ticket) return c.redirect("/tickets")
    const body = await c.req.parseBody()
    try {
      assertCsrf(session, body.csrf)
    } catch {
      return c.redirect(`/tickets/${ticket.id}`)
    }
    await store.addNote(ticket.id, {
      authorEmail: user.email,
      authorName: user.name,
      body: "Ticket reopened.",
    })
    await store.update(ticket.id, {
      status: "open",
      resolution: null,
      resolvedAt: null,
    })
    return c.redirect(`/tickets/${ticket.id}`)
  })

  app.get("/changes", async (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    const changes = await listChanges(input.sql)
    return page(c, "Changes", changeListPage(changes))
  })

  app.get("/changes/new", (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    return page(c, "New change", changeForm(c.get("session").csrf))
  })

  app.post("/changes", async (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    const session = c.get("session")
    const parsed = changeFormSchema.safeParse(await c.req.parseBody())
    if (!parsed.success) {
      session.flash = "Check the change fields and try again."
      return c.redirect("/changes/new")
    }
    try {
      assertCsrf(session, parsed.data.csrf)
    } catch {
      session.flash = "This form expired. Refresh and try again."
      return c.redirect("/changes/new")
    }
    const change = await createChange(input.sql, {
      title: parsed.data.title,
      summary: parsed.data.summary,
      rollbackPlan: parsed.data.rollbackPlan,
      requestedByEmail: user.email,
      requestedByName: user.name,
      lockhavenAccessRequestId: blankToNull(parsed.data.accessRequestId),
    })
    session.flash = "Change saved as a draft."
    return c.redirect(`/changes/${change.id}`)
  })

  app.get("/changes/:id", async (c) => {
    const user = requireUser(c)
    if (!user) return c.redirect("/login")
    const change = await getChange(input.sql, c.req.param("id"))
    if (!change) return page(c, "Not found", `<p class="empty">That change does not exist.` + `<` + `/p>`, 404)
    const events = await listChangeEvents(input.sql, change.id)
    return page(c, change.title, changeDetailPage({ change, events, csrf: c.get("session").csrf }))
  })

  for (const action of ["submit", "approve", "reject", "apply", "rollback"] as const) {
    app.post(`/changes/:id/${action}`, async (c) => {
      const user = requireUser(c)
      if (!user) return c.redirect("/login")
      const session = c.get("session")
      const change = await getChange(input.sql, c.req.param("id"))
      if (!change) return c.redirect("/changes")
      const body = await c.req.parseBody()
      try {
        assertCsrf(session, body.csrf)
      } catch {
        return c.redirect(`/changes/${change.id}`)
      }
      try {
        const next = transitionChange({
          status: change.status,
          action,
          actor: user,
          lockhavenAccessRequestId: change.lockhavenAccessRequestId,
        })
        await saveChangeTransition(input.sql, {
          id: change.id,
          status: next.status,
          approvedByEmail: next.approvedByEmail,
          approvedAt: next.approvedAt,
          appliedAt: next.appliedAt,
          actorEmail: user.email,
          actorName: user.name,
          action: next.event.action,
          detail: next.event.detail,
        })
      } catch (error) {
        session.flash =
          error instanceof ChangeTransitionError
            ? error.message
            : "That change could not be updated."
      }
      return c.redirect(`/changes/${change.id}`)
    })
  }

  app.post("/ingest/lockhaven", async (c) => ingest(c, "lockhaven"))
  app.post("/ingest/session", async (c) => ingest(c, "session"))
  app.post("/ingest/asset", async (c) => ingest(c, "asset"))

  async function ingest(
    c: DeskContext,
    source: "lockhaven" | "session" | "asset"
  ) {
    const body = await c.req.text()
    const timestamp = c.req.header(WEBHOOK_TIMESTAMP_HEADER) ?? ""
    const signature = c.req.header(WEBHOOK_SIGNATURE_HEADER) ?? ""
    const ok = verifyWebhookSignature({
      secret: input.config.ingestHmacSecret,
      timestamp,
      body,
      signature,
    })
    if (!ok) {
      return c.json({ ok: false, error: "invalid signature" }, 401)
    }
    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      return c.json({ ok: false, error: "invalid json" }, 400)
    }
    try {
      const result =
        source === "session"
          ? await applySessionIngest(store, payload)
          : source === "asset"
            ? await applyAssetIngest(store, payload)
            : await applyLockhavenEnvelope(store, payload)
      const event =
        source === "lockhaven" &&
        payload &&
        typeof payload === "object" &&
        "event" in payload
          ? String((payload as { event: string }).event)
          : source
      const ticketId = result.ignored ? null : result.ticket.id
      await recordIngest(input.sql, {
        source,
        event,
        ticketId,
        payload,
      })
      if (result.ignored) {
        return c.json({ ok: true, ignored: true })
      }
      return c.json({
        ok: true,
        created: result.created,
        ticketId: result.ticket.id,
        number: result.ticket.number,
      })
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof IngestError) {
        return c.json(
          { ok: false, error: error instanceof Error ? error.message : "invalid payload" },
          400
        )
      }
      throw error
    }
  }

  function requireUser(c: DeskContext) {
    return c.get("session").user ?? null
  }

  function page(
    c: DeskContext,
    title: string,
    body: string,
    status = 200
  ) {
    const session = c.get("session")
    return html(
      c,
      layout({
        productName: input.config.productName,
        title,
        user: session.user,
        csrf: session.csrf,
        flash: session.flash,
        body,
      }),
      status
    )
  }

  function html(
    c: DeskContext,
    body: string,
    status = 200
  ) {
    return c.html(body, { status: status as 200 })
  }

  return app
}

export { callbackUrl }
