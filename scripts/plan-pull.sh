#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_plan-lib.sh"

OUT="$ROOT/plans/server.json"
REV=""

while [ $# -gt 0 ]; do
  case "$1" in
    -o|--out) OUT="$2"; shift 2 ;;
    -r|--rev) REV="$2"; shift 2 ;;
    -h|--help) echo "usage: scripts/plan-pull.sh [--rev N] [--out файл]   план с сервера → plans/server.json (HOUSE_URL, HOUSE_PASSWORD)"; exit 0 ;;
    *) die "неизвестный аргумент: $1" ;;
  esac
done

mkdir -p "$(dirname "$OUT")"
tmp="$(mktemp)"
trap 'rm -f "$tmp"; cleanup_jar' EXIT

house_login
url="$API/plan.php"
[ -n "$REV" ] && url="$url?rev=$REV"
code="$(curl -s -o "$tmp" -w '%{http_code}' -b "$JAR" "$url")"
[ "$code" = 200 ] || { echo "ошибка $code:" >&2; cat "$tmp" >&2; exit 1; }

python3 - "$tmp" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print(f"rev {d.get('rev')}  {d.get('updatedAt')}  автор {d.get('author')}  стен {len(d['walls'])}  проёмов {len(d['openings'])}")
PY
mv "$tmp" "$OUT"
echo "→ $OUT"
