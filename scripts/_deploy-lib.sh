#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV:-$ROOT/.env.deploy}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

DEPLOY_METHOD="${DEPLOY_METHOD:-ssh}"
DEPLOY_SSH="${DEPLOY_SSH:-}"
DEPLOY_SSH_OPTS="${DEPLOY_SSH_OPTS:-}"
DEPLOY_PATH="${DEPLOY_PATH:-}"
DEPLOY_URL="${DEPLOY_URL:-}"
LOCK_DIR="${DEPLOY_LOCK:-${TMPDIR:-/tmp}/house-planner-deploy.lock}"
LOCK_WAIT="${DEPLOY_LOCK_WAIT:-600}"
FTP_HOST="${FTP_HOST:-}"
FTP_USER="${FTP_USER:-}"
FTP_PASSWORD="${FTP_PASSWORD:-}"
FTP_PATH="${FTP_PATH:-}"
FTP_SSL_VERIFY="${FTP_SSL_VERIFY:-yes}"

die() { echo "$*" >&2; exit 1; }

file_size() { stat -c %s "$1" 2>/dev/null || stat -f %z "$1"; }
file_mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1"; }
if command -v md5sum >/dev/null; then MD5_CMD=(md5sum); else MD5_CMD=(md5 -r); fi

ssh_cmd() {
  # shellcheck disable=SC2086
  ssh $DEPLOY_SSH_OPTS "$DEPLOY_SSH" "$@"
}

check_ssh_env() {
  [ -n "$DEPLOY_SSH" ] || die "в .env.deploy нет DEPLOY_SSH (user@host или алиас из ~/.ssh/config)"
  [ -n "$DEPLOY_PATH" ] || die "в .env.deploy нет DEPLOY_PATH (корень сайта на сервере)"
}

check_ftp_env() {
  command -v lftp >/dev/null || die "нет lftp: установите его (brew install lftp, apt install lftp)"
  [ -n "$FTP_HOST" ] && [ -n "$FTP_USER" ] && [ -n "$FTP_PASSWORD" ] || die "в .env.deploy нет FTP_HOST, FTP_USER или FTP_PASSWORD"
  [ -n "$FTP_PATH" ] || die "в .env.deploy нет FTP_PATH (корень сайта на FTP)"
}

ftp_run() {
  LFTP_PASSWORD="$FTP_PASSWORD" lftp -c "set ssl:verify-certificate $FTP_SSL_VERIFY; set net:max-retries 3; set net:timeout 30; set cmd:verbose no; open --env-password -u '$FTP_USER' 'ftp://$FTP_HOST'; $1"
}

ftp_exclude_args() {
  local p rx
  for p in "$@"; do
    rx="$(printf '%s' "$p" | sed 's/[.[\*^$+?(){}|]/\\&/g')"
    case "$p" in
      /*) printf -- '--exclude=^%s\n' "${rx#/}" ;;
      */) printf -- '--exclude=(^|/)%s\n' "$rx" ;;
      *) printf -- '--exclude=(^|/)%s$\n' "$rx" ;;
    esac
  done
}

md5_filter() {
  awk -v ex="$1" 'BEGIN { n = split(ex, e, " ") }
    { p = $0; sub(/^[0-9a-f]+  /, "", p); b = p; sub(/.*\//, "", b)
      for (i = 1; i <= n; i++) {
        x = e[i]
        if (substr(x, 1, 1) == "/") { x = substr(x, 2); if (index(p, x) == 1) next }
        else if (x ~ /\/$/) { if (index(p, x) == 1 || index(p, "/" x) > 0) next }
        else if (b == x) next
      }
      print }'
}

ftp_sync_dir() {
  local src="$1" dst="$2"; shift 2
  [ -d "$src" ] || die "нет папки $src"
  local ex="" l
  while IFS= read -r l; do ex="$ex '$l'"; done < <(ftp_exclude_args "$@")
  ftp_run "mkdir -p -f '$dst'; mirror --reverse --delete --no-perms --parallel=4 $ex '$src/' '$dst/'"
}

ftp_verify_dir() {
  local src="$1" dst="$2"; shift 2
  local ex="$*"
  local tmp; tmp="$(mktemp -d)"
  (cd "$src" && find . -type f | while IFS= read -r f; do printf '%s  %s\n' "$(file_size "$f")" "${f#./}"; done | LC_ALL=C sort -k2) | md5_filter "$ex" > "$tmp/local"
  ftp_run "cd '$dst' && find -l ." | awk '/^-/ { s = $3; p = $0; sub(/^[^ ]+ +[^ ]+ +[^ ]+ +[^ ]+ +[^ ]+ +/, "", p); sub(/^\.\//, "", p); print s "  " p }' | LC_ALL=C sort -k2 | md5_filter "$ex" > "$tmp/remote"
  local n; n=$(wc -l < "$tmp/local" | tr -d ' ')
  if diff -u "$tmp/local" "$tmp/remote" > "$tmp/diff"; then
    echo "размеры: совпадают ($n файлов; исключены: $ex)"
    rm -rf "$tmp"
  else
    echo "размеры: РАСХОЖДЕНИЕ" >&2
    cat "$tmp/diff" >&2
    rm -rf "$tmp"
    return 1
  fi
}

lock_acquire() {
  local waited=0 pid
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      echo "замок: процесс $pid мёртв — снимаю замок" >&2
      rm -rf "$LOCK_DIR"; continue
    fi
    if [ -z "$pid" ] && [ -d "$LOCK_DIR" ] && [ $(( $(date +%s) - $(file_mtime "$LOCK_DIR" 2>/dev/null || date +%s) )) -gt 60 ]; then
      echo "замок: без PID дольше минуты — снимаю" >&2
      rm -rf "$LOCK_DIR"; continue
    fi
    if [ "$waited" -ge "$LOCK_WAIT" ]; then
      echo "замок: жду уже ${LOCK_WAIT}с, держит PID ${pid:-?} — выхожу" >&2
      exit 75
    fi
    [ $((waited % 30)) -eq 0 ] && echo "замок: занят (PID ${pid:-?}), жду…" >&2
    sleep 2; waited=$((waited + 2))
  done
  echo $$ > "$LOCK_DIR/pid"
  trap 'lock_release' EXIT
  trap 'exit 130' INT TERM
}

lock_release() {
  [ "$(cat "$LOCK_DIR/pid" 2>/dev/null)" = "$$" ] && rm -rf "$LOCK_DIR"
  return 0
}

sync_dir() {
  local src="$1" dst="$2"; shift 2
  [ -d "$src" ] || die "нет папки $src"
  local args=() p
  for p in "$@"; do args+=("--exclude=$p"); done
  ssh_cmd "mkdir -p '$dst'"
  rsync -rlptz --delete --no-perms --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
    -e "ssh $DEPLOY_SSH_OPTS" "${args[@]}" "$src/" "$DEPLOY_SSH:$dst/"
}

verify_dir() {
  local src="$1" dst="$2"; shift 2
  local ex="$*"
  local tmp; tmp="$(mktemp -d)"
  (cd "$src" && find . -type f -print0 | xargs -0 "${MD5_CMD[@]}" | sed -E 's#^([0-9a-f]+) +\./#\1  #' | LC_ALL=C sort -k2) | md5_filter "$ex" > "$tmp/local"
  ssh_cmd "cd '$dst' && find . -type f -print0 | xargs -0 -r md5sum | sed 's#  \./#  #' | LC_ALL=C sort -k2" | md5_filter "$ex" > "$tmp/remote"
  local n; n=$(wc -l < "$tmp/local" | tr -d ' ')
  if diff -u "$tmp/local" "$tmp/remote" > "$tmp/diff"; then
    echo "md5: совпадает ($n файлов; исключены: $ex)"
    rm -rf "$tmp"
  else
    echo "md5: РАСХОЖДЕНИЕ" >&2
    cat "$tmp/diff" >&2
    rm -rf "$tmp"
    return 1
  fi
}
