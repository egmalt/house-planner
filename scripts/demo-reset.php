<?php

// Hourly reset of the public demo: current.json back to plans/demo.json,
// versions and snapshots older than an hour removed, data/ and plans/ opened.
// Cron, as the web server user:
//   0 * * * * php /path/to/scripts/demo-reset.php --webroot=/path/to/site
// --webroot defaults to ../public next to this script (dev checkout).

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$webroot = dirname(__DIR__) . '/public';
foreach (array_slice($argv, 1) as $arg) {
    if (strncmp($arg, '--webroot=', 10) === 0) {
        $webroot = rtrim(substr($arg, 10), '/');
    } else {
        fwrite(STDERR, "использование: php scripts/demo-reset.php [--webroot=<корень сайта>]\n");
        exit(2);
    }
}

$lib = $webroot . '/api/_lib.php';
if (!is_file($lib)) {
    fwrite(STDERR, "нет $lib — укажите --webroot\n");
    exit(2);
}
require $lib;

if (find_storage() === null) {
    fwrite(STDERR, "хранилище не найдено: планировщик не установлен\n");
    exit(1);
}
if (!is_demo()) {
    fwrite(STDERR, "демо-режим выключен ('demo' => true в config.php или HOUSE_DEMO=1), сброс не выполняется\n");
    exit(1);
}

$r = demo_reset(false);
printf(
    "сброшено: rev %d, %s, удалено версий %d, снимков %d\n",
    $r['rev'],
    $r['updatedAt'],
    $r['versionsDropped'],
    $r['snapshotsDropped']
);
