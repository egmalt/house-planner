#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_deploy-lib.sh"

EXCLUDES=(.DS_Store cgi-bin/ /storage/ /data/.htaccess /plans/.htaccess)
BUILD=1

for a in "$@"; do
  case "$a" in
    --no-build) BUILD=0 ;;
    -h|--help)
      cat <<USAGE
usage: scripts/deploy.sh [--no-build]
  npm run build → заливка dist/ в корень сайта → сверка с сервером.
  Настройки берутся из .env.deploy (пример: .env.deploy.example):
  DEPLOY_METHOD=ssh — rsync по SSH (DEPLOY_SSH, DEPLOY_PATH, DEPLOY_SSH_OPTS);
  DEPLOY_METHOD=ftp — lftp mirror (FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_PATH).
  Не трогаются на сервере: ${EXCLUDES[*]}
USAGE
      exit 0 ;;
    *) die "неизвестный аргумент: $a" ;;
  esac
done

case "$DEPLOY_METHOD" in
  ssh) check_ssh_env ;;
  ftp) check_ftp_env ;;
  *) die "DEPLOY_METHOD: ssh или ftp, а не '$DEPLOY_METHOD'" ;;
esac

cd "$ROOT"
lock_acquire

if [ "$BUILD" = 1 ] && ! npm run build; then
  echo "СБОРКА УПАЛА — заливка отменена" >&2
  exit 2
fi
[ -f dist/index.html ] || die "нет dist/index.html — заливка отменена"

if [ "$DEPLOY_METHOD" = ftp ]; then
  ftp_sync_dir "$ROOT/dist" "$FTP_PATH" "${EXCLUDES[@]}"
  ftp_verify_dir "$ROOT/dist" "$FTP_PATH" "${EXCLUDES[@]}"
else
  sync_dir "$ROOT/dist" "$DEPLOY_PATH" "${EXCLUDES[@]}"
  verify_dir "$ROOT/dist" "$DEPLOY_PATH" "${EXCLUDES[@]}"
fi
[ -n "$DEPLOY_URL" ] && echo "URL: $DEPLOY_URL/"
[ -n "$DEPLOY_URL" ] && echo "первый запуск: $DEPLOY_URL/api/setup.php"
exit 0
