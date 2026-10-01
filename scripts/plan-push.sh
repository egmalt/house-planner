#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_plan-lib.sh"

FILE="$ROOT/plans/server.json"
REV=""
AUTHOR="cli"

while [ $# -gt 0 ]; do
  case "$1" in
    -r|--rev) REV="$2"; shift 2 ;;
    -a|--author) AUTHOR="$2"; shift 2 ;;
    -h|--help) echo "usage: scripts/plan-push.sh [файл] [--rev N] [--author метка]   файл (по умолчанию plans/server.json) → новая версия на сервере (HOUSE_URL, HOUSE_PASSWORD)"; exit 0 ;;
    -*) die "неизвестный аргумент: $1" ;;
    *) FILE="$1"; shift ;;
  esac
done

[ -f "$FILE" ] || die "нет файла $FILE"
if [ -z "$REV" ]; then
  REV="$(python3 -c 'import json,sys; r=json.load(open(sys.argv[1])).get("rev"); print(r if isinstance(r,int) else "")' "$FILE")"
  [ -n "$REV" ] || die "в $FILE нет поля rev — укажите --rev N (базовая версия, от которой правили)"
fi

resp="$(mktemp)"
trap 'rm -f "$resp"; cleanup_jar' EXIT

house_login
code="$(curl -s -o "$resp" -w '%{http_code}' -b "$JAR" -X PUT \
  -H 'X-Requested-With: plan-cli' -H "X-Client-Version: $CLIENT_VERSION" -H "X-Plan-Author: $AUTHOR" \
  -H "If-Match: $REV" -H 'Content-Type: application/json' --data-binary @"$FILE" "$API/plan.php")"

case "$code" in
  200)
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("ок: rev %s  %s" % (d["rev"], d["updatedAt"]))' "$resp"
    if [ "$FILE" -ef "$ROOT/plans/server.json" ]; then
      "$ROOT/scripts/plan-pull.sh" >/dev/null && echo "plans/server.json обновлён до серверной версии"
    fi
    ;;
  409)
    conflict="${FILE%.json}.conflict.json"
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); json.dump(d["plan"], open(sys.argv[2],"w"), ensure_ascii=False, indent=2); print("конфликт: на сервере rev %s (%s), а правки от rev %s" % (d["rev"], d["plan"].get("author"), sys.argv[3]))' "$resp" "$conflict" "$REV"
    echo "серверный план сохранён в $conflict — перенесите правки на него и отправьте снова" >&2
    exit 2
    ;;
  *)
    echo "ошибка $code:" >&2; cat "$resp" >&2; exit 1 ;;
esac
