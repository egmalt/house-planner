<?php

require_once __DIR__ . '/_i18n.php';
require_once __DIR__ . '/_demo.php';

const PLAN_MAX_BYTES = 2097152;
const MIN_CLIENT_VERSION = 2;
const PLAN_JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT;
const AUTH_COOKIE = 'hauth';

function webroot_dir(): string
{
    return dirname(__DIR__);
}

function storage_candidates(): array
{
    $out = [];
    $env = getenv('HOUSE_STORAGE');
    if (is_string($env) && $env !== '') {
        $out[] = rtrim($env, '/');
    }
    $out[] = dirname(webroot_dir()) . '/storage';
    $out[] = webroot_dir() . '/storage';
    return $out;
}

function find_storage(): ?string
{
    foreach (storage_candidates() as $dir) {
        if (is_file($dir . '/config.php')) {
            return $dir;
        }
    }
    return null;
}

function storage_dir(): string
{
    static $dir = null;
    if ($dir === null) {
        $dir = find_storage() ?? storage_candidates()[0];
    }
    return $dir;
}

function seed_file(): string
{
    $seed = (string)(load_config()['seed'] ?? '');
    if ($seed === '') {
        return webroot_dir() . '/plans/demo.json';
    }
    return $seed[0] === '/' ? $seed : webroot_dir() . '/' . $seed;
}

function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    return strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function auth_cookie(string $value, int $maxAge): string
{
    $parts = [AUTH_COOKIE . '=' . $value, 'Max-Age=' . $maxAge, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
    if ($maxAge <= 0) {
        $parts[] = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
    if (is_https()) {
        $parts[] = 'Secure';
    }
    return 'Set-Cookie: ' . implode('; ', $parts);
}

function send_json(int $code, $body, array $headers = []): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (is_demo()) {
        header(DEMO_HEADER);
    }
    foreach ($headers as $h) {
        header($h);
    }
    echo json_encode($body, PLAN_JSON_FLAGS), "\n";
    exit;
}

function send_raw_json(int $code, string $json, array $headers = []): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (is_demo()) {
        header(DEMO_HEADER);
    }
    foreach ($headers as $h) {
        header($h);
    }
    echo $json;
    exit;
}

function fail(int $code, string $error, string $message, array $extra = []): void
{
    send_json($code, array_merge(['error' => $error, 'message' => $message], $extra));
}

function load_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $dir = find_storage();
    if ($dir === null) {
        fail(503, 'not_installed', tr('planner is not installed: open api/setup.php', 'планировщик не установлен: откройте api/setup.php'));
    }
    $c = require $dir . '/config.php';
    $config = is_array($c) ? $c : [];
    if (!empty($config['timezone']) && is_string($config['timezone'])) {
        @date_default_timezone_set($config['timezone']);
    }
    return $config;
}

function require_auth(array $config): void
{
    if (is_demo()) {
        return;
    }
    $want = (string)($config['hauth'] ?? '');
    $got = (string)($_COOKIE[AUTH_COOKIE] ?? '');
    if ($want === '' || $got === '' || !hash_equals($want, $got)) {
        fail(401, 'unauthorized', tr('login required: POST api/login.php', 'нужен вход: POST api/login.php'));
    }
}

function etag_headers(int $rev): array
{
    return ['ETag: "' . $rev . '"', 'X-Plan-Rev: ' . $rev];
}

function parse_rev_header(string $v): ?int
{
    $v = trim($v);
    if (strncmp($v, 'W/', 2) === 0) {
        $v = substr($v, 2);
    }
    $v = trim($v, "\" \t");
    return ctype_digit($v) ? (int)$v : null;
}

function author_label(): string
{
    $a = (string)($_SERVER['HTTP_X_PLAN_AUTHOR'] ?? '');
    $a = preg_replace('/[^\w .@:-]+/u', '', $a);
    $a = trim(mb_substr((string)$a, 0, 100));
    return $a === '' ? 'web' : $a;
}

function plan_max_bytes(): int
{
    return is_demo() ? DEMO_PLAN_MAX_BYTES : PLAN_MAX_BYTES;
}

function validate_plan(string $raw)
{
    if (strlen($raw) > plan_max_bytes()) {
        fail(413, 'too_large', tr('plan is larger than %d MB', 'план больше %d МБ', plan_max_bytes() >> 20));
    }
    $p = json_decode($raw);
    if (json_last_error() !== JSON_ERROR_NONE) {
        fail(400, 'bad_json', tr('invalid JSON: %s', 'некорректный JSON: %s', json_last_error_msg()));
    }
    if (!is_object($p)) {
        fail(422, 'invalid_plan', tr('plan must be an object', 'план должен быть объектом'));
    }
    if (!isset($p->site) || !is_object($p->site)) {
        fail(422, 'invalid_plan', tr('missing site object', 'нет объекта site'));
    }
    if (!isset($p->walls) || !is_array($p->walls)) {
        fail(422, 'invalid_plan', tr('missing walls array', 'нет массива walls'));
    }
    if (!isset($p->openings) || !is_array($p->openings)) {
        fail(422, 'invalid_plan', tr('missing openings array', 'нет массива openings'));
    }
    return $p;
}

function atomic_write(string $path, string $data): void
{
    $tmp = $path . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $data) !== strlen($data)) {
        @unlink($tmp);
        fail(500, 'write_failed', tr('could not write %s', 'не удалось записать %s', basename($path)));
    }
    @chmod($tmp, 0600);
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        fail(500, 'write_failed', tr('could not rename %s', 'не удалось переименовать %s', basename($path)));
    }
}

function with_lock(callable $fn)
{
    $dir = storage_dir();
    if (!is_dir($dir . '/versions') && !mkdir($dir . '/versions', 0700, true)) {
        fail(500, 'no_storage', tr('missing storage/versions folder', 'нет папки storage/versions'));
    }
    $h = fopen($dir . '/.lock', 'c');
    if (!$h || !flock($h, LOCK_EX)) {
        fail(500, 'lock_failed', tr('could not acquire lock', 'не удалось взять блокировку'));
    }
    try {
        return $fn();
    } finally {
        flock($h, LOCK_UN);
        fclose($h);
    }
}

function read_current()
{
    $f = storage_dir() . '/current.json';
    if (!is_file($f)) {
        return null;
    }
    $p = json_decode((string)file_get_contents($f));
    return is_object($p) ? $p : null;
}

function iso_now(): string
{
    $t = microtime(true);
    return gmdate('Y-m-d\TH:i:s', (int)$t) . sprintf('.%03dZ', (int)(($t - floor($t)) * 1000));
}

function commit_plan($plan, int $rev, string $author): array
{
    $dir = storage_dir();
    $updatedAt = iso_now();
    $plan = apply_fixed_site($plan);
    $plan->rev = $rev;
    $plan->updatedAt = $updatedAt;
    $plan->author = $author;
    $json = json_encode($plan, PLAN_JSON_FLAGS) . "\n";
    $stamp = gmdate('Ymd\THis\Z', strtotime($updatedAt));
    $file = $stamp . '-' . $rev . '.json';
    atomic_write($dir . '/versions/' . $file, $json);
    atomic_write($dir . '/current.json', $json);
    $entry = [
        'rev' => $rev,
        'updatedAt' => $updatedAt,
        'author' => $author,
        'walls' => count($plan->walls),
        'openings' => count($plan->openings),
        'bytes' => strlen($json),
        'file' => $file,
    ];
    file_put_contents($dir . '/versions.jsonl', json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND);
    return $entry;
}

function ensure_seeded(): void
{
    if (is_file(storage_dir() . '/current.json')) {
        return;
    }
    with_lock(function () {
        if (is_file(storage_dir() . '/current.json')) {
            return;
        }
        $src = seed_file();
        if (!is_file($src)) {
            fail(500, 'no_seed', tr('storage is empty and seed file %s is missing', 'хранилище пусто и нет файла засева %s', basename($src)));
        }
        $plan = validate_plan((string)file_get_contents($src));
        commit_plan($plan, 1, 'seed');
    });
}

function list_versions(): array
{
    $f = storage_dir() . '/versions.jsonl';
    $out = [];
    if (!is_file($f)) {
        return $out;
    }
    foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $e = json_decode($line, true);
        if (is_array($e)) {
            $out[] = $e;
        }
    }
    return $out;
}

function version_file(int $rev): ?string
{
    $m = glob(storage_dir() . '/versions/*-' . $rev . '.json');
    return $m ? $m[0] : null;
}

function require_client_version(array $config): void
{
    $min = (int)($config['min_client_version'] ?? MIN_CLIENT_VERSION);
    $v = trim((string)($_SERVER['HTTP_X_CLIENT_VERSION'] ?? ''));
    if (!ctype_digit($v) || (int)$v < $min) {
        fail(426, 'client_outdated', tr('client is outdated, reload the page', 'клиент устарел, перезагрузи страницу'), ['minClientVersion' => $min]);
    }
}

function load_fixed_site()
{
    static $fixed = false;
    if ($fixed === false) {
        $fixed = null;
        $f = storage_dir() . '/site-fixed.json';
        if (is_file($f)) {
            $d = json_decode((string)file_get_contents($f));
            if (!is_object($d) || !isset($d->site) || !is_object($d->site)) {
                fail(500, 'corrupt', tr('site-fixed.json is corrupt', 'site-fixed.json повреждён'));
            }
            $fixed = $d->site;
        }
    }
    return $fixed;
}

function apply_fixed_site($plan)
{
    $fixed = load_fixed_site();
    if ($fixed === null || !is_object($plan)) {
        return $plan;
    }
    if (!isset($plan->site) || !is_object($plan->site)) {
        $plan->site = new stdClass();
    }
    foreach (['boundary', 'street', 'geo'] as $k) {
        if (property_exists($fixed, $k)) {
            $plan->site->$k = $fixed->$k;
        }
    }
    $locked = [];
    foreach ((isset($fixed->zones) && is_array($fixed->zones)) ? $fixed->zones : [] as $z) {
        if (is_object($z) && !empty($z->locked)) {
            $locked[] = $z;
        }
    }
    $ids = [];
    foreach ($locked as $z) {
        $ids[(string)($z->id ?? '')] = true;
    }
    $zones = $locked;
    foreach ((isset($plan->site->zones) && is_array($plan->site->zones)) ? $plan->site->zones : [] as $z) {
        if (!is_object($z) || !empty($z->locked) || isset($ids[(string)($z->id ?? '')])) {
            continue;
        }
        $zones[] = $z;
    }
    if ($zones || isset($plan->site->zones)) {
        $plan->site->zones = $zones;
    }
    return $plan;
}

function send_plan_file(string $f, ?int $rev = null): void
{
    $p = json_decode((string)file_get_contents($f));
    if (!is_object($p)) {
        fail(500, 'corrupt', tr('%s is corrupt', '%s повреждён', basename($f)));
    }
    $p = apply_fixed_site($p);
    send_raw_json(200, json_encode($p, PLAN_JSON_FLAGS) . "\n", etag_headers($rev ?? (int)($p->rev ?? 0)));
}

function snapshots_dir(): string
{
    return storage_dir() . '/snapshots';
}

function snapshot_slug(string $name): string
{
    static $tr = ['а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd', 'е' => 'e', 'ё' => 'e', 'ж' => 'zh', 'з' => 'z', 'и' => 'i', 'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm', 'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r', 'с' => 's', 'т' => 't', 'у' => 'u', 'ф' => 'f', 'х' => 'h', 'ц' => 'ts', 'ч' => 'ch', 'ш' => 'sh', 'щ' => 'sch', 'ъ' => '', 'ы' => 'y', 'ь' => '', 'э' => 'e', 'ю' => 'yu', 'я' => 'ya'];
    $s = strtr(mb_strtolower($name, 'UTF-8'), $tr);
    $s = trim((string)preg_replace('/[^a-z0-9]+/', '-', $s), '-');
    $s = rtrim(substr($s, 0, 60), '-');
    return $s === '' ? 'snapshot' : $s;
}

function list_snapshots(): array
{
    $f = storage_dir() . '/snapshots.jsonl';
    $out = [];
    if (!is_file($f)) {
        return $out;
    }
    foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $e = json_decode($line, true);
        if (is_array($e)) {
            $out[] = $e;
        }
    }
    return $out;
}

function snapshot_file(string $id): ?string
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,70}$/', $id)) {
        return null;
    }
    $f = snapshots_dir() . '/' . $id . '.json';
    return is_file($f) ? $f : null;
}

function create_snapshot(string $name, string $author): array
{
    return with_lock(function () use ($name, $author) {
        $dir = snapshots_dir();
        if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
            fail(500, 'no_storage', tr('missing storage/snapshots folder', 'нет папки storage/snapshots'));
        }
        $raw = (string)file_get_contents(storage_dir() . '/current.json');
        $cur = json_decode($raw);
        if (!is_object($cur)) {
            fail(500, 'corrupt', tr('current.json is corrupt', 'current.json повреждён'));
        }
        $base = (new DateTime('now'))->format('Y-m-d') . '-' . snapshot_slug($name);
        $id = $base;
        for ($n = 2; is_file($dir . '/' . $id . '.json'); $n++) {
            $id = $base . '-' . $n;
        }
        atomic_write($dir . '/' . $id . '.json', $raw);
        $entry = [
            'id' => $id,
            'name' => $name,
            'rev' => (int)($cur->rev ?? 0),
            'createdAt' => iso_now(),
            'author' => $author,
            'walls' => is_array($cur->walls ?? null) ? count($cur->walls) : 0,
            'openings' => is_array($cur->openings ?? null) ? count($cur->openings) : 0,
        ];
        file_put_contents(storage_dir() . '/snapshots.jsonl', json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND);
        return $entry;
    });
}
