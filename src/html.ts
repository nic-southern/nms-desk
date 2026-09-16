import type { Actor } from "./types.ts"
import {
  changeStatusLabel,
  displayChangeNumber,
  displayTicketNumber,
  sourceLabel,
  statusLabel,
  type ChangeEvent,
  type ChangeRecord,
  type TicketNote,
  type TicketRecord,
  type TicketStatus,
} from "./types.ts"

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function dash(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? escapeHtml(trimmed) : "—"
}

function when(date: Date) {
  return escapeHtml(
    date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  )
}

function end(tag: string) {
  return `<` + `/${tag}>`
}

const css = `
:root {
  --bg: #14110e;
  --bg-2: #1c1814;
  --ink: #f3ece3;
  --muted: #b7aa9b;
  --line: #3a322a;
  --brass: #c4a574;
  --brass-2: #e2c9a0;
  --card: #211c17;
  --danger: #d45d4a;
  --ok: #7ea37a;
  --wait: #c4a574;
  --font: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --sans: "Segoe UI", "Helvetica Neue", sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  min-height: 100vh;
  background:
    radial-gradient(1200px 500px at 10% -10%, #2a221c 0%, transparent 50%),
    var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.45;
}
a { color: var(--brass-2); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 24px 20px 64px; }
header.top {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; margin-bottom: 28px; padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.brand { font-family: var(--font); font-size: 22px; letter-spacing: 0.04em; }
.brand small { display: block; color: var(--muted); font-family: var(--sans); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
nav { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
nav a, nav button.link {
  color: var(--ink); background: none; border: 0; font: inherit; cursor: pointer;
}
.who { color: var(--muted); font-size: 13px; }
.flash {
  background: #2a241c; border: 1px solid var(--brass); color: var(--brass-2);
  padding: 10px 14px; margin-bottom: 18px; border-radius: 6px;
}
.toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; align-items: end; }
label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
input, select, textarea, button {
  font: inherit; color: var(--ink);
}
input, select, textarea {
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 6px;
  padding: 8px 10px;
}
textarea { min-height: 110px; width: 100%; }
button, .btn {
  background: var(--brass); color: #1a140e; border: 0; border-radius: 6px;
  padding: 8px 14px; font-weight: 600; cursor: pointer; display: inline-block;
}
button.secondary, a.secondary {
  background: transparent; color: var(--brass-2); border: 1px solid var(--line);
}
button.danger { background: var(--danger); color: white; }
.grid { display: grid; gap: 12px; }
.cards { display: grid; gap: 10px; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 14px 16px;
}
.row { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
.title { font-family: var(--font); font-size: 18px; margin: 0 0 6px; }
.meta { color: var(--muted); font-size: 13px; display: flex; gap: 10px; flex-wrap: wrap; }
.badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px;
  letter-spacing: 0.04em; text-transform: uppercase; border: 1px solid var(--line);
}
.sev-critical { background: #3a1c18; color: #f0b0a6; border-color: #7a3a32; }
.sev-high { background: #3a2a14; color: #efc48a; border-color: #7a5a28; }
.sev-medium { background: #2a2618; color: #e2c9a0; border-color: #5a4a32; }
.sev-low { background: #1c2a1c; color: #c5d7c2; border-color: #3a5a3a; }
.st-open { color: #f0b0a6; }
.st-resolved, .st-closed { color: var(--ok); }
.form { display: grid; gap: 12px; max-width: 720px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 700px) { .form-row { grid-template-columns: 1fr; } .row { flex-direction: column; } }
dl { display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; margin: 0; }
dt { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
dd { margin: 0; }
.notes { display: grid; gap: 10px; margin-top: 18px; }
.note { border-left: 3px solid var(--brass); padding: 8px 12px; background: #1a1612; }
.empty { color: var(--muted); padding: 28px 0; }
.sign-in {
  max-width: 420px; margin: 12vh auto; background: var(--card);
  border: 1px solid var(--line); border-radius: 14px; padding: 32px;
  text-align: center;
}
.sign-in h1 { font-family: var(--font); margin: 0 0 8px; }
.sign-in p { color: var(--muted); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
`

export function layout(input: {
  productName: string
  title: string
  user?: Actor | null
  csrf?: string
  flash?: string
  body: string
}) {
  const nav = input.user
    ? `<nav>
        <a href="/tickets">Tickets${end("a")}
        <a href="/tickets/new">New ticket${end("a")}
        <a href="/changes">Changes${end("a")}
        <span class="who">${escapeHtml(input.user.name)}${end("span")}
        <form method="post" action="/logout" style="display:inline">
          <input type="hidden" name="csrf" value="${escapeHtml(input.csrf ?? "")}" />
          <button class="link" type="submit">Sign out${end("button")}
        ${end("form")}
      ${end("nav")}`
    : `<nav><a href="/login">Sign in${end("a")}${end("nav")}`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)} · ${escapeHtml(input.productName)}${end("title")}
  <style>${css}${end("style")}
${end("head")}
<body>
  <div class="wrap">
    <header class="top">
      <div class="brand">${escapeHtml(input.productName)}<small>New Market Security${end("small")}${end("div")}
      ${nav}
    ${end("header")}
    ${input.flash ? `<div class="flash">${escapeHtml(input.flash)}${end("div")}` : ""}
    ${input.body}
  ${end("div")}
${end("body")}
${end("html")}`
}

export function signInPage(productName: string, error?: string) {
  return layout({
    productName,
    title: "Sign in",
    body: `<div class="sign-in">
      <h1>Sign in${end("h1")}
      <p>Use your company account to open and close work.${end("p")}
      ${error ? `<p class="flash">${escapeHtml(error)}${end("p")}` : ""}
      <p><a class="btn" href="/login">Continue${end("a")}${end("p")}
    ${end("div")}`,
  })
}

export function ticketListPage(input: {
  tickets: TicketRecord[]
  status: string
  q: string
}) {
  const rows =
    input.tickets.length === 0
      ? `<p class="empty">No tickets match this view.${end("p")}`
      : `<div class="cards">${input.tickets
          .map(
            (t) => `<a class="card" href="/tickets/${t.id}">
            <div class="row">
              <div>
                <p class="title">${escapeHtml(displayTicketNumber(t.number))} · ${escapeHtml(t.title)}${end("p")}
                <div class="meta">
                  <span>${escapeHtml(sourceLabel(t.source))}${end("span")}
                  <span>${dash(t.requesterName)}${end("span")}
                  <span>${dash(t.siteName)}${end("span")}
                  <span>${dash(t.assetTag ?? t.deviceName)}${end("span")}
                ${end("div")}
              ${end("div")}
              <div>
                <span class="badge sev-${t.severity}">${escapeHtml(t.severity)}${end("span")}
                <div class="meta st-${t.status}">${escapeHtml(statusLabel(t.status))}${end("div")}
              ${end("div")}
            ${end("div")}
          ${end("a")}`
          )
          .join("")}${end("div")}`

  const statuses: Array<TicketStatus | "all"> = [
    "all",
    "open",
    "in_progress",
    "waiting",
    "resolved",
    "closed",
  ]

  return `<form class="toolbar" method="get" action="/tickets">
      <label>Status
        <select name="status">${statuses
          .map(
            (s) =>
              `<option value="${s}" ${input.status === s ? "selected" : ""}>${s === "all" ? "All" : statusLabel(s as TicketStatus)}${end("option")}`
          )
          .join("")}${end("select")}
      ${end("label")}
      <label>Search
        <input name="q" value="${escapeHtml(input.q)}" placeholder="Requester, site, asset" />
      ${end("label")}
      <button type="submit">Filter${end("button")}
      <a class="btn secondary" href="/tickets/new">New ticket${end("a")}
    ${end("form")}
    ${rows}`
}

export function ticketForm(csrf: string) {
  return `<form class="form card" method="post" action="/tickets">
    <input type="hidden" name="csrf" value="${escapeHtml(csrf)}" />
    <h2 class="title">New ticket${end("h2")}
    <label>Summary
      <input name="title" required maxlength="240" />
    ${end("label")}
    <div class="form-row">
      <label>Severity
        <select name="severity">
          <option value="low">Low${end("option")}
          <option value="medium" selected>Medium${end("option")}
          <option value="high">High${end("option")}
          <option value="critical">Critical${end("option")}
        ${end("select")}
      ${end("label")}
      <label>Category
        <select name="category">
          <option value="hardware">Hardware${end("option")}
          <option value="software">Software${end("option")}
          <option value="network">Network${end("option")}
          <option value="access">Access${end("option")}
          <option value="account">Account${end("option")}
          <option value="other">Other${end("option")}
        ${end("select")}
      ${end("label")}
    ${end("div")}
    <div class="form-row">
      <label>Requester name
        <input name="requesterName" required />
      ${end("label")}
      <label>Requester email
        <input name="requesterEmail" type="email" />
      ${end("label")}
    ${end("div")}
    <div class="form-row">
      <label>Site
        <input name="siteName" />
      ${end("label")}
      <label>Asset tag
        <input name="assetTag" placeholder="Leave blank if this is a remote device" />
      ${end("label")}
    ${end("div")}
    <div class="form-row">
      <label>Device name
        <input name="deviceName" placeholder="Optional — not required for inventory" />
      ${end("label")}
      <label>Time spent (minutes)
        <input name="minutes" type="number" min="0" step="1" value="0" />
      ${end("label")}
    ${end("div")}
    <label>Notes
      <textarea name="notes">${end("textarea")}
    ${end("label")}
    <button type="submit">Create ticket${end("button")}
  ${end("form")}`
}

export function ticketDetailPage(input: {
  ticket: TicketRecord
  notes: TicketNote[]
  csrf: string
}) {
  const t = input.ticket
  const notes =
    input.notes.length === 0
      ? `<p class="empty">No notes yet.${end("p")}`
      : `<div class="notes">${input.notes
          .map(
            (n) => `<div class="note">
            <div class="meta">${escapeHtml(n.authorName)} · ${when(n.createdAt)}${n.minutes ? ` · ${n.minutes} min` : ""}${end("div")}
            <pre>${escapeHtml(n.body)}${end("pre")}
          ${end("div")}`
          )
          .join("")}${end("div")}`

  return `<div class="card">
      <div class="row">
        <div>
          <p class="title">${escapeHtml(displayTicketNumber(t.number))} · ${escapeHtml(t.title)}${end("p")}
          <div class="meta">
            <span class="badge sev-${t.severity}">${escapeHtml(t.severity)}${end("span")}
            <span>${escapeHtml(t.category)}${end("span")}
            <span class="st-${t.status}">${escapeHtml(statusLabel(t.status))}${end("span")}
            <span>${escapeHtml(sourceLabel(t.source))}${end("span")}
          ${end("div")}
        ${end("div")}
      ${end("div")}
      <dl style="margin-top:16px">
        <dt>Requester${end("dt")}<dd>${dash(t.requesterName)}${t.requesterEmail ? ` · ${escapeHtml(t.requesterEmail)}` : ""}${end("dd")}
        <dt>Assignee${end("dt")}<dd>${dash(t.assigneeEmail)}${end("dd")}
        <dt>Site${end("dt")}<dd>${dash(t.siteName)}${end("dd")}
        <dt>Asset${end("dt")}<dd>${dash(t.assetTag)}${end("dd")}
        <dt>Device${end("dt")}<dd>${dash(t.deviceName)}${end("dd")}
        <dt>Time spent${end("dt")}<dd>${t.timeSpentMinutes} min${end("dd")}
        <dt>Session${end("dt")}<dd>${dash(t.lockhavenSessionId)}${end("dd")}
        <dt>Recording${end("dt")}<dd>${t.recordingUrl && t.recordingUrl.startsWith("https://") ? `<a href="${escapeHtml(t.recordingUrl)}">Open recording${end("a")}` : "—"}${end("dd")}
        <dt>Reason${end("dt")}<dd>${dash(t.sessionReason)}${end("dd")}
        <dt>Opened${end("dt")}<dd>${when(t.createdAt)}${end("dd")}
        <dt>Resolution${end("dt")}<dd>${dash(t.resolution)}${end("dd")}
      ${end("dl")}
      ${t.notes ? `<p style="margin-top:16px">${escapeHtml(t.notes)}${end("p")}` : ""}
    ${end("div")}
    <div class="card" style="margin-top:14px">
      <h3 class="title">Notes and time${end("h3")}
      ${notes}
      <form class="form" method="post" action="/tickets/${t.id}/notes" style="margin-top:16px">
        <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}" />
        <label>Add a note
          <textarea name="body" required>${end("textarea")}
        ${end("label")}
        <label>Minutes
          <input name="minutes" type="number" min="0" step="1" value="0" />
        ${end("label")}
        <button type="submit">Save note${end("button")}
      ${end("form")}
    ${end("div")}
    <div class="card" style="margin-top:14px">
      <h3 class="title">Close${end("h3")}
      <form class="form" method="post" action="/tickets/${t.id}/resolve">
        <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}" />
        <label>Resolution
          <textarea name="resolution" required>${escapeHtml(t.resolution ?? "")}${end("textarea")}
        ${end("label")}
        <div class="actions">
          <button type="submit">Mark resolved${end("button")}
        ${end("div")}
      ${end("form")}
      <form method="post" action="/tickets/${t.id}/reopen" style="margin-top:10px">
        <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}" />
        <button class="secondary" type="submit">Reopen${end("button")}
      ${end("form")}
    ${end("div")}`
}

export function changeListPage(changes: ChangeRecord[]) {
  if (changes.length === 0) {
    return `<div class="toolbar"><a class="btn" href="/changes/new">New change${end("a")}${end("div")}<p class="empty">No change requests yet.${end("p")}`
  }
  return `<div class="toolbar"><a class="btn" href="/changes/new">New change${end("a")}${end("div")}
    <div class="cards">${changes
      .map(
        (c) => `<a class="card" href="/changes/${c.id}">
        <div class="row">
          <div>
            <p class="title">${escapeHtml(displayChangeNumber(c.number))} · ${escapeHtml(c.title)}${end("p")}
            <div class="meta"><span>${escapeHtml(c.requestedByName)}${end("span")}<span>${when(c.updatedAt)}${end("span")}${end("div")}
          ${end("div")}
          <span class="badge">${escapeHtml(changeStatusLabel(c.status))}${end("span")}
        ${end("div")}
      ${end("a")}`
      )
      .join("")}${end("div")}`
}

export function changeForm(csrf: string) {
  return `<form class="form card" method="post" action="/changes">
    <input type="hidden" name="csrf" value="${escapeHtml(csrf)}" />
    <h2 class="title">New change${end("h2")}
    <label>Summary
      <input name="title" required maxlength="240" />
    ${end("label")}
    <label>What will change
      <textarea name="summary" required>${end("textarea")}
    ${end("label")}
    <label>Rollback plan
      <textarea name="rollbackPlan" required>${end("textarea")}
    ${end("label")}
    <label>Access request ID (optional)
      <input name="accessRequestId" placeholder="Reuse an existing access approval when you have one" />
    ${end("label")}
    <button type="submit">Save draft${end("button")}
  ${end("form")}`
}

export function changeDetailPage(input: {
  change: ChangeRecord
  events: ChangeEvent[]
  csrf: string
}) {
  const c = input.change
  const actions: Array<[string, string, string]> = []
  if (c.status === "draft") actions.push(["submit", "Submit for approval", ""])
  if (c.status === "pending_approval") {
    actions.push(["approve", "Approve", ""])
    actions.push(["reject", "Reject", "danger"])
  }
  if (c.status === "approved") {
    actions.push(["apply", "Mark applied", ""])
    actions.push(["reject", "Reject", "danger"])
  }
  if (c.status === "applied") actions.push(["rollback", "Record rollback", "danger"])

  const buttons = actions
    .map(
      ([action, label, cls]) => `<form method="post" action="/changes/${c.id}/${action}">
        <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}" />
        <button class="${cls}" type="submit">${escapeHtml(label)}${end("button")}
      ${end("form")}`
    )
    .join("")

  const events = input.events
    .map(
      (e) => `<div class="note">
        <div class="meta">${escapeHtml(e.actorName)} · ${escapeHtml(e.action)} · ${when(e.createdAt)}${end("div")}
      ${end("div")}`
    )
    .join("")

  return `<div class="card">
      <p class="title">${escapeHtml(displayChangeNumber(c.number))} · ${escapeHtml(c.title)}${end("p")}
      <div class="meta"><span class="badge">${escapeHtml(changeStatusLabel(c.status))}${end("span")}${end("div")}
      <dl style="margin-top:16px">
        <dt>Requested by${end("dt")}<dd>${escapeHtml(c.requestedByName)}${end("dd")}
        <dt>Approved by${end("dt")}<dd>${dash(c.approvedByEmail)}${end("dd")}
        <dt>Access request${end("dt")}<dd>${dash(c.lockhavenAccessRequestId)}${end("dd")}
        <dt>Applied${end("dt")}<dd>${c.appliedAt ? when(c.appliedAt) : "—"}${end("dd")}
      ${end("dl")}
      <h3 class="title" style="margin-top:18px">What will change${end("h3")}
      <pre>${escapeHtml(c.summary)}${end("pre")}
      <h3 class="title" style="margin-top:18px">Rollback${end("h3")}
      <pre>${escapeHtml(c.rollbackPlan)}${end("pre")}
      <div class="actions">${buttons}${end("div")}
    ${end("div")}
    <div class="card" style="margin-top:14px">
      <h3 class="title">History${end("h3")}
      ${events || `<p class="empty">No history yet.${end("p")}`}
    ${end("div")}`
}
