#!/bin/sh
set -e

: "${HOUSE_STORAGE:=/var/lib/house-planner}"
export HOUSE_STORAGE

mkdir -p "$HOUSE_STORAGE"
php /usr/local/lib/house-planner/boot.php
unset HOUSE_PASSWORD
chown -R www-data:www-data "$HOUSE_STORAGE" /var/www/html/data /var/www/html/plans

exec docker-php-entrypoint "$@"
