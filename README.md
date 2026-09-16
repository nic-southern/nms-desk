# nms-desk

Company service desk for New Market Security. Tickets, change requests, and signed ingest from Lockhaven. Identity comes from realm nms at https://auth.newmarketsecurity.com.

Public hostname: tickets.newmarketsecurity.com

This is not part of the Lockhaven application repo and does not share a database with Lockhaven or Keycloak. It is not a PSA: no billing, SLAs, or contracts in v1.

## What ships

- CompTIA-style tickets: severity, category, requester, asset, site, notes, time spent, and a written resolution
- Ticket from a Lockhaven alert webhook (create/update, HMAC)
- Ticket from a VPN / remote session (device, site, technician, reason, optional recording)
- Ticket against an asset that has no VPN device
- Thin audited change object (submit / approve / apply / rollback), with an optional access-request id so approvals already recorded in Lockhaven can be reused
- SSO against Keycloak client tickets
- Docker Compose project nms-desk on the existing proxy network

Secrets stay in .env. Do not commit .env or real ticket contents.

## Boot locally

Requires Docker Compose and a .env with real random values (not replace_me). Keycloak must already be reachable for sign-in; ingest HMAC tests do not need it.

    cp .env.example .env
    ./scripts/up.sh

scripts/up.sh creates the edge network (proxy by default) if it is missing. Compose publishes the app only on loopback:

- App: http://localhost:4000
- Health: http://localhost:4000/health
- Ingest: POST /ingest/lockhaven, /ingest/session, /ingest/asset

Postgres is not published to the host network.

## DNS and TLS

Do not start a second Caddy from this repo, and do not publish 80/443 here. The Console host already terminates TLS. This stack joins that edge network and lets the existing watcher pick up labels.

1. DNS for tickets.newmarketsecurity.com already points at the Console VPS.
2. Copy .env.example to .env on the host. Set PUBLIC_HOST=tickets.newmarketsecurity.com, PUBLIC_URL=https://tickets.newmarketsecurity.com, OIDC_ISSUER=https://auth.newmarketsecurity.com/realms/nms, OIDC_CLIENT_ID=tickets, OIDC_CLIENT_SECRET to the same value as TICKETS_CLIENT_SECRET in /opt/nms-idp/.env, EDGE_NETWORK=proxy.
3. Host layout: /opt/nms-desk (not /opt/lockhaven).
4. Point the live tickets client at this origin: ./scripts/update-tickets-client.sh
5. Start this project only: docker compose up -d --build

HTTP stays bound to 127.0.0.1:4000. Labels cover caddy-docker-proxy and Traefik on the proxy network.

Keep project name nms-desk. Do not run a second Lockhaven worker from this repo.

## Lockhaven ingest

Webhook URL: https://tickets.newmarketsecurity.com/ingest/lockhaven

Use INGEST_HMAC_SECRET as the channel secret. Headers: X-Lockhaven-Timestamp (unix seconds) and X-Lockhaven-Signature (sha256= hex HMAC of timestamp.body).

Events: alert.opened opens or reopens a ticket keyed by alert id; alert.escalated raises severity; alert.resolved writes a close; access.requested opens a remote-session ticket; channel.test acknowledges with no ticket.

Direct helpers (same HMAC): POST /ingest/session and POST /ingest/asset. Asset tickets do not require a VPN device.

## Safety

Never commit passwords, HMAC secrets, session secrets, or ticket contents. Postgres is not published. Health is fail-closed: /health returns 503 when the store is down.
