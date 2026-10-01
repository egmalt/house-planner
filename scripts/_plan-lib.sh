#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV:-$ROOT/.env.deploy}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

HOUSE_URL="${HOUSE_URL:-${DEPLOY_URL:-}}"
HOUSE_URL="${HOUSE_URL%/}"
HOUSE_PASSWORD="${HOUSE_PASSWORD:-}"
CLIENT_VERSION="${HOUSE_CLIENT_VERSION:-$(sed -n 's/^export const CLIENT_VERSION = \([0-9]*\).*/\1/p' "$ROOT/src/model/schema.ts")}"
API="$HOUSE_URL/api"

die() { echo "$*" >&2; exit 1; }

[ -n "$HOUSE_URL" ] || die "нет HOUSE_URL (адрес сайта, напр. https://plan.example.com) — в env или .env.deploy"
[ -n "$HOUSE_PASSWORD" ] || die "нет HOUSE_PASSWORD — в env или .env.deploy"
command -v curl >/dev/null || die "нет curl"
command -v python3 >/dev/null || die "нет python3"

JAR="$(mktemp)"
cleanup_jar() { rm -f "$JAR"; }

house_login() {
  local body code
  body="$(python3 -c 'import json,sys; print(json.dumps({"password": sys.argv[1]}))' "$HOUSE_PASSWORD")"
  code="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -X POST \
    -H 'Content-Type: application/json' -H 'X-Requested-With: plan-cli' \
    --data-binary "$body" "$API/login.php")"
  case "$code" in
    200) ;;
    401) die "неверный пароль (HOUSE_PASSWORD)" ;;
    503) die "планировщик не установлен: откройте $API/setup.php" ;;
    *) die "вход не удался: HTTP $code от $API/login.php" ;;
  esac
}
