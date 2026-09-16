#!/bin/sh
# Apply the tickets OIDC client to the live nms realm. Run on the droplet.
# Reads only the keys it needs from /opt/nms-idp/.env and does not print secrets.
set -eu

IDP_ENV=${IDP_ENV:-/opt/nms-idp/.env}
PUBLIC_URL=${PUBLIC_URL:-https://tickets.newmarketsecurity.com}

if [ ! -f "$IDP_ENV" ]; then
  echo "missing $IDP_ENV" >&2
  exit 1
fi

env_get() {
  python3 - "$1" "$2" <<'PY'
import sys
path, key = sys.argv[1], sys.argv[2]
for raw in open(path, encoding="utf-8"):
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    if line.startswith(key + "="):
        sys.stdout.write(line.split("=", 1)[1])
        break
PY
}

CLIENT_ID=$(env_get "$IDP_ENV" TICKETS_CLIENT_ID)
CLIENT_ID=${CLIENT_ID:-tickets}
TICKETS_CLIENT_SECRET=$(env_get "$IDP_ENV" TICKETS_CLIENT_SECRET)
KC_BOOTSTRAP_ADMIN_USERNAME=$(env_get "$IDP_ENV" KC_BOOTSTRAP_ADMIN_USERNAME)
KC_BOOTSTRAP_ADMIN_PASSWORD=$(env_get "$IDP_ENV" KC_BOOTSTRAP_ADMIN_PASSWORD)
KC_CONTAINER=${KC_CONTAINER:-nms-idp-keycloak-1}

if [ -z "${TICKETS_CLIENT_SECRET:-}" ] || [ "$TICKETS_CLIENT_SECRET" = "replace_me" ]; then
  echo "TICKETS_CLIENT_SECRET is not set in the identity host env" >&2
  exit 1
fi

kcadm() {
  docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"
}

kcadm config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
  --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

CLIENT_UUID=$(kcadm get clients -r nms -q "clientId=$CLIENT_ID" --fields id,clientId \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]]*\)".*/\1/p' | head -n 1)

if [ -z "$CLIENT_UUID" ]; then
  echo "could not find OIDC client $CLIENT_ID in realm nms" >&2
  exit 1
fi

kcadm update "clients/$CLIENT_UUID" -r nms \
  -s "rootUrl=$PUBLIC_URL" \
  -s "baseUrl=$PUBLIC_URL" \
  -s 'redirectUris=["'"$PUBLIC_URL"'/api/auth/callback/tickets","'"$PUBLIC_URL"'/api/auth/oauth2/callback/tickets"]' \
  -s 'webOrigins=["'"$PUBLIC_URL"'"]' \
  -s 'attributes."post.logout.redirect.uris"="'"$PUBLIC_URL"'/*"' \
  >/dev/null

echo "updated realm nms client $CLIENT_ID redirect URIs for $PUBLIC_URL"
