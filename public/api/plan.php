<?php

require __DIR__ . '/_lib.php';

$config = load_config();
require_auth($config);
if (is_demo() && demo_reset_due()) {
    demo_reset(true);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET' || $method === 'HEAD') {
    ensure_seeded();

    if (isset($_GET['versions'])) {
        $list = array_reverse(list_versions());
        $cur = read_current();
        send_json(200, ['rev' => $cur ? (int)$cur->rev : 0, 'versions' => $list]);
    }

    if (isset($_GET['rev'])) {
        $rev = parse_rev_header((string)$_GET['rev']);
        $f = $rev === null ? null : version_file($rev);
        if ($f === null) {
            fail(404, 'not_found', tr('no version rev=%s', 'нет версии rev=%s', $_GET['rev']));
        }
        send_plan_file($f, $rev);
    }

    if (isset($_GET['snapshots'])) {
        send_json(200, ['snapshots' => array_reverse(list_snapshots())]);
    }

    if (isset($_GET['snapshot'])) {
        $f = snapshot_file((string)$_GET['snapshot']);
        if ($f === null) {
            fail(404, 'not_found', tr('no snapshot %s', 'нет снимка %s', $_GET['snapshot']));
        }
        send_plan_file($f);
    }

    send_plan_file(storage_dir() . '/current.json');
}

if ($method !== 'PUT' && $method !== 'POST') {
    header('Allow: GET, HEAD, PUT, POST');
    fail(405, 'method_not_allowed', tr('method not allowed', 'метод не поддерживается'));
}

if (trim((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === '') {
    fail(403, 'csrf', tr('X-Requested-With header required', 'нужен заголовок X-Requested-With'));
}

require_client_version($config);
if (is_demo()) {
    demo_rate_limit();
}

if ($method === 'POST' && isset($_GET['snapshot'])) {
    $b = json_decode((string)file_get_contents('php://input', false, null, 0, 65536));
    $name = is_object($b) && is_string($b->name ?? null) ? trim($b->name) : '';
    if ($name === '' || mb_strlen($name) > 200) {
        fail(422, 'invalid_name', tr('name field required, 1–200 characters', 'нужно поле name, 1–200 символов'));
    }
    ensure_seeded();
    if (is_demo() && count(list_snapshots()) >= DEMO_MAX_SNAPSHOTS) {
        fail(403, 'demo_limit', tr('demo allows at most %d snapshots, old ones are removed at the hourly reset', 'в демо не больше %d снимков, старые удаляются при часовом сбросе', DEMO_MAX_SNAPSHOTS));
    }
    send_json(201, create_snapshot($name, author_label()));
}

$len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len > plan_max_bytes()) {
    fail(413, 'too_large', tr('plan is larger than %d MB', 'план больше %d МБ', plan_max_bytes() >> 20));
}

$ifMatch = parse_rev_header((string)($_SERVER['HTTP_IF_MATCH'] ?? ''));
if ($ifMatch === null) {
    fail(428, 'if_match_required', tr('If-Match: <rev> header required', 'нужен заголовок If-Match: <rev>'));
}

$raw = (string)file_get_contents('php://input', false, null, 0, plan_max_bytes() + 1);
$plan = validate_plan($raw);
$author = author_label();

ensure_seeded();

$result = with_lock(function () use ($plan, $ifMatch, $author) {
    $cur = read_current();
    if (!$cur) {
        fail(500, 'corrupt', tr('current.json is corrupt', 'current.json повреждён'));
    }
    $curRev = (int)$cur->rev;
    if ($curRev !== $ifMatch) {
        send_json(409, [
            'error' => 'conflict',
            'message' => tr('plan has already changed: rev %s, sent %s', 'план уже изменён: rev %s, прислан %s', $curRev, $ifMatch),
            'rev' => $curRev,
            'updatedAt' => $cur->updatedAt ?? null,
            'plan' => apply_fixed_site($cur),
        ], etag_headers($curRev));
    }
    return commit_plan($plan, $curRev + 1, $author);
});

send_json(200, ['rev' => $result['rev'], 'updatedAt' => $result['updatedAt']], etag_headers($result['rev']));
