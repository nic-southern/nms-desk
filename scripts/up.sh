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
  echo "replace every replace_me value in .env before starting (WINDSHIFT_API_TOKEN may wait until you mint one)" >&2
  if grep -v 'WINDSHIFT_API_TOKEN=' .env | grep -q 'replace_me'; then
    exit 1
  fi
fi

EDGE_NETWORK=${EDGE_NETWORK:-proxy}
if ! docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1; then
  echo "creating edge network $EDGE_NETWORK (exists on the Console host as proxy)"
  docker network create "$EDGE_NETWORK" >/dev/null
fi

if ! docker network inspect nms-pm >/dev/null 2>&1; then
  echo "nms-pm network is missing; start Windshift (nms-pm) first" >&2
  exit 1
fi

docker compose up -d --build --remove-orphans "$@"
echo "ingest on loopback :4000; UI and ingest host is ${PUBLIC_URL:-https://pm.newmarketsecurity.com}"
