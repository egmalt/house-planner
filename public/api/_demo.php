<?php

const DEMO_PLAN_MAX_BYTES = 1048576;
const DEMO_RESET_SECONDS = 3600;
const DEMO_WRITES_PER_MINUTE = 30;
const DEMO_MAX_SNAPSHOTS = 20;
const DEMO_HEADER = 'X-House-Demo: 1';

function is_demo(): bool
{
    static $demo = null;
    if ($demo === null) {
        $env = strtolower(trim((string)getenv('HOUSE_DEMO')));
        $demo = in_array($env, ['1', 'true', 'yes', 'on'], true)
            || (find_storage() !== null && !empty(load_config()['demo']));
    }
    return $demo;
}

function demo_plan_file(): string
{
    return webroot_dir() . '/plans/demo.json';
}

function demo_marker(): string
{
    return storage_dir() . '/.demo-reset';
}

function demo_reset_due(): bool
{
    $m = demo_marker();
    clearstatcache(true, $m);
    return !is_file($m) || time() - (int)filemtime($m) >= DEMO_RESET_SECONDS;
}

function demo_open_htaccess(): string
{
    return "<IfModule mod_headers.c>\n"
        . "Header always set Cache-Control \"no-store\"\n"
        . "</IfModule>\n";
}

function demo_open_gates(): void
{
    $want = demo_open_htaccess();
    foreach (['data', 'plans'] as $sub) {
        $d = webroot_dir() . '/' . $sub;
        $f = $d . '/.htaccess';
        if (!is_dir($d) || (is_file($f) && (string)file_get_contents($f) === $want)) {
            continue;
        }
        $tmp = $f . '.tmp.' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $want) === strlen($want) && @rename($tmp, $f)) {
            @chmod($f, 0644);
        } else {
            @unlink($tmp);
        }
    }
}

function demo_prune(int $keepAfter, string $keepFile): array
{
    $dir = storage_dir();
    $kept = [];
    $dropped = 0;
    foreach (list_versions() as $e) {
        $file = basename((string)($e['file'] ?? ''));
        $t = strtotime((string)($e['updatedAt'] ?? '')) ?: 0;
        if ($file === $keepFile || $t >= $keepAfter) {
            $kept[] = $e;
            continue;
        }
        if ($file !== '' && preg_match('/^\d{8}T\d{6}Z-\d+\.json$/', $file)) {
            @unlink($dir . '/versions/' . $file);
        }
        $dropped++;
    }
    $lines = '';
    foreach ($kept as $e) {
        $lines .= json_encode($e, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    }
    atomic_write($dir . '/versions.jsonl', $lines);

    $snapKept = [];
    $snapDropped = 0;
    foreach (list_snapshots() as $e) {
        $t = strtotime((string)($e['createdAt'] ?? '')) ?: 0;
        if ($t >= $keepAfter) {
            $snapKept[] = $e;
            continue;
        }
        $f = snapshot_file((string)($e['id'] ?? ''));
        if ($f !== null) {
            @unlink($f);
        }
        $snapDropped++;
    }
    if (is_file($dir . '/snapshots.jsonl')) {
        $lines = '';
        foreach ($snapKept as $e) {
            $lines .= json_encode($e, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        }
        atomic_write($dir . '/snapshots.jsonl', $lines);
    }

    foreach (glob($dir . '/ratelimit/*.json') ?: [] as $f) {
        if (time() - (int)@filemtime($f) > 120) {
            @unlink($f);
        }
    }
    return ['versionsDropped' => $dropped, 'snapshotsDropped' => $snapDropped];
}

function demo_reset(bool $onlyIfDue): ?array
{
    return with_lock(function () use ($onlyIfDue) {
        if ($onlyIfDue && !demo_reset_due()) {
            return null;
        }
        $src = demo_plan_file();
        if (!is_file($src)) {
            fail(500, 'no_seed', tr('demo plan %s is missing', 'нет демо-плана %s', basename($src)));
        }
        $plan = validate_plan((string)file_get_contents($src));
        $cur = read_current();
        $rev = $cur ? (int)($cur->rev ?? 0) + 1 : 1;
        $entry = commit_plan($plan, $rev, 'demo-reset');
        $stats = demo_prune(time() - DEMO_RESET_SECONDS, $entry['file']);
        touch(demo_marker());
        demo_open_gates();
        return ['rev' => $rev, 'updatedAt' => $entry['updatedAt']] + $stats;
    });
}

function demo_rate_limit(): void
{
    $dir = storage_dir() . '/ratelimit';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        fail(500, 'no_storage', tr('missing storage/ratelimit folder', 'нет папки storage/ratelimit'));
    }
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $h = fopen($dir . '/' . hash('sha256', $ip) . '.json', 'c+');
    if (!$h || !flock($h, LOCK_EX)) {
        fail(500, 'lock_failed', tr('could not acquire lock', 'не удалось взять блокировку'));
    }
    $now = microtime(true);
    $hits = json_decode((string)stream_get_contents($h), true);
    $hits = array_values(array_filter(is_array($hits) ? $hits : [], fn($t) => is_numeric($t) && $now - $t < 60));
    if (count($hits) >= DEMO_WRITES_PER_MINUTE) {
        flock($h, LOCK_UN);
        fclose($h);
        $retry = max(1, (int)ceil(60 - ($now - min($hits))));
        send_json(429, [
            'error' => 'rate_limited',
            'message' => tr('demo: at most %d writes per minute, retry in %d s', 'демо: не больше %d записей в минуту, повторите через %d с', DEMO_WRITES_PER_MINUTE, $retry),
            'retryAfter' => $retry,
        ], ['Retry-After: ' . $retry]);
    }
    $hits[] = round($now, 3);
    ftruncate($h, 0);
    rewind($h);
    fwrite($h, json_encode($hits));
    fflush($h);
    flock($h, LOCK_UN);
    fclose($h);
}

function demo_disabled(string $message): void
{
    fail(403, 'demo_disabled', $message . tr(' — install your own copy: %s', ' — поставьте свою копию: %s', 'https://github.com/egmalt/house-planner'));
}
