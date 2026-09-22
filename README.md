# nms-desk

Lockhaven HMAC ingest sidecar for New Market Security. The ticket UI is
the existing **Windshift** instance at https://pm.newmarketsecurity.com
(the same app as project management). There is no second Windshift, no
tickets subdomain, and no Zammad.

Public hostname: `pm.newmarketsecurity.com`. Ingest lives on that host at
`/ingest/*`. Windshift serves every other path, including MCP at `/mcp`.

Identity is Windshift native OIDC against realm `nms` at
https://auth.newmarketsecurity.com (client `pm`, PKCE).

This is not part of the Lockhaven application repo. It is not a PSA: no
billing, SLAs, or contracts.

## What ships

- HMAC ingest sidecar that will create/update Windshift items from Lockhaven
  alerts, remote sessions, and asset requests
- CompTIA-style fields as item description, labels, and custom fields
  (severity, category, requester, asset, site, notes, time spent, written
  resolution)
- Change as a Windshift item type/label (open, approve, apply, rollback notes
  live on the item)
- Docker Compose project `nms-desk` on the existing `proxy` network, plus the
  existing `nms-pm` network so ingest can reach Windshift

Secrets stay in `.env`. Do not commit `.env` or real ticket contents.

## Windshift MCP (Grok / Cursor agents)

Windshift ships a first-party MCP server. There is no separate marketplace
package. Enable it with `MCP_ENABLED=true` on the Windshift container (already
on for `pm`). Endpoint:

```text
https://pm.newmarketsecurity.com/mcp
```

Transport: Streamable HTTP. Auth: `Authorization: Bearer <api-token>`.
The token needs `mcp:access` plus the tool scopes you want (`items:read`,
`items:write`, `workspaces:read`, …). Mint the token in Windshift after
signing in (API tokens). Do not put the token in git.

Cursor / Grok MCP config (token from a local env var, not committed):

```json
{
  "mcpServers": {
    "windshift": {
      "url": "https://pm.newmarketsecurity.com/mcp",
      "headers": {
        "Authorization": "Bearer TOKEN"
      }
    }
  }
}
```

Issue tools include `list_items`, `get_item`, `search_items`, `create_item`,
`update_item`, `transition_item`, `list_comments`, `add_comment`,
`list_workspaces`, `set_item_labels`, and `list_recent_activity`. That is
enough for a Grok agent to triage and direct projects/tickets on the one
Windshift instance.

Windshift Admin → AI Connections can also point in-product agents at an
OpenAI-compatible Grok endpoint. That is separate from MCP; MCP is how
Cursor/Grok bots outside Windshift talk to the same items.

## Boot locally

Requires Docker Compose, the `nms-pm` network (or omit the `pm` network),
and a `.env` with real random values (not `replace_me`).

```sh
cp .env.example .env
# set INGEST_HMAC_SECRET; WINDSHIFT_API_TOKEN after you mint one

./scripts/up.sh
```

Compose publishes ingest only on loopback `http://localhost:4000`.

## DNS and TLS for pm.newmarketsecurity.com

Do **not** start a second Caddy from this repo, and do **not** publish 80/443
here. The Console host already terminates TLS. Windshift on `nms-pm` owns the
`pm` hostname except `/ingest*`. This stack only claims `PathPrefix(/ingest)`.

1. DNS for `pm.newmarketsecurity.com` already points at the Console VPS.
2. Copy `.env.example` to `.env` on the host.
3. Host layout: `/opt/nms-desk` (not `/opt/lockhaven`).
4. Start ingest only: `docker compose up -d --build --remove-orphans`

HTTP stays bound to `127.0.0.1:4000`. Ingest is `PathPrefix(/ingest)` at
priority 100 so it does not steal the Windshift UI.

Keep project name `nms-desk`. Do not run a second Lockhaven worker from this
repo.

## Lockhaven ingest

Create a Console webhook channel whose URL is:

`https://pm.newmarketsecurity.com/ingest/lockhaven`

Use `INGEST_HMAC_SECRET` as the channel secret. Signatures must match the
existing Lockhaven headers:

- `X-Lockhaven-Timestamp` — unix seconds
- `X-Lockhaven-Signature` — `sha256=` hex HMAC of `timestamp.body`

Events:

| Event | Result |
| --- | --- |
| `alert.opened` | Open or reopen a Windshift item tagged `lh-alert-{id}` |
| `alert.escalated` | Raise priority, add a note |
| `alert.resolved` | Transition the linked item to Done (fail closed if missing) |
| `access.requested` | Open a remote-session item |
| `channel.test` | Acknowledge, no item |

Direct helpers (same HMAC):

- `POST /ingest/session` — VPN/session item with device, site, technician,
  optional recording URL and reason
- `POST /ingest/asset` — item against an asset tag; device is optional and
  not required

## Safety

- Never commit passwords, HMAC secrets, API tokens, or ticket contents.
- Health is fail-closed: `/health` returns 503 when the Windshift token is
  not ready.
