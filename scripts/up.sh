#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env ]; then
  echo "copy .env.example to .env and set replace_me secrets first" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
. ./.env
set +a

if grep -q 'replace_me' .env; then
  echo "replace every replace_me value in .env before starting (ZAMMAD_INGEST_TOKEN may wait until configure-zammad.sh)" >&2
  if grep -v 'ZAMMAD_INGEST_TOKEN=' .env | grep -q 'replace_me'; then
    exit 1
  fi
fi

EDGE_NETWORK=${EDGE_NETWORK:-proxy}
if ! docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1; then
  echo "creating edge network $EDGE_NETWORK (exists on the Console host as proxy)"
  docker network create "$EDGE_NETWORK" >/dev/null
fi

docker compose up -d --build "$@"
echo "after rails is healthy, run ./scripts/update-tickets-client.sh and ./scripts/configure-zammad.sh"
