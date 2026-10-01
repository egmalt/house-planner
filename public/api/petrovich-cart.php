<?php

require __DIR__ . '/_lib.php';

const PET_API = 'https://api.petrovich.ru';
const PET_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const PET_MAX_ITEMS = 150;
const PET_TIMEOUT = 120;
const PET_BATCH = 50;

$config = load_config();
if (is_demo()) {
    demo_disabled(tr('the Petrovich cart is disabled in the demo', 'в демо корзина Петровича отключена'));
}
require_auth($config);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    fail(405, 'method_not_allowed', tr('POST only', 'только POST'));
}
if (trim((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === '') {
    fail(403, 'csrf', tr('X-Requested-With header required', 'нужен заголовок X-Requested-With'));
}
require_client_version($config);

$body = json_decode((string)file_get_contents('php://input', false, null, 0, 262144));
if (!is_object($body)) {
    fail(400, 'bad_json', tr('body must be a JSON object', 'тело должно быть JSON-объектом'));
}
$city = (string)($body->city ?? '');
if ($city !== 'spb' && $city !== 'vbg') {
    fail(422, 'invalid_city', tr('city: spb or vbg', 'city: spb или vbg'));
}
if (!isset($body->items) || !is_array($body->items) || !$body->items) {
    fail(422, 'invalid_items', tr('non-empty items array required', 'нужен непустой массив items'));
}

$items = [];
foreach ($body->items as $i => $it) {
    $code = is_object($it) ? trim((string)($it->code ?? '')) : '';
    $qty = is_object($it) && is_numeric($it->qty ?? null) ? (float)$it->qty : 0;
    if (!preg_match('/^\d{3,10}$/', $code) || $qty <= 0) {
        fail(422, 'invalid_items', tr('items[%d]: numeric code and qty > 0 required', 'items[%d]: нужен числовой code и qty > 0', $i));
    }
    $q = (int)ceil($qty - 1e-9);
    if (isset($items[$code])) {
        $items[$code]['qty'] += $q;
    } else {
        $items[$code] = ['code' => $code, 'qty' => $q, 'name' => is_string($it->name ?? null) ? $it->name : null];
    }
}
if (count($items) > PET_MAX_ITEMS) {
    fail(413, 'too_many_items', tr('at most %d items per request', 'не больше %d позиций за запрос', PET_MAX_ITEMS));
}

$lock = fopen(storage_dir() . '/.petrovich.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    fail(429, 'busy', tr('the Petrovich cart is already being built, retry in a minute', 'корзина Петровича уже собирается, повтори через минуту'));
}

set_time_limit(PET_TIMEOUT + 15);
ignore_user_abort(true);
$deadline = microtime(true) + PET_TIMEOUT;

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 5,
    CURLOPT_COOKIEFILE => '',
    CURLOPT_USERAGENT => PET_UA,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_ENCODING => '',
]);

function pet_blocked(string $why): void
{
    fail(502, 'petrovich_blocked', tr('Petrovich refused access: %s', 'Петрович не пускает: %s', $why));
}

function pet_http(string $method, string $url, $json = null): array
{
    global $ch, $deadline;
    $left = (int)ceil($deadline - microtime(true));
    if ($left <= 0) {
        fail(504, 'timeout', tr('timed out after %d s', 'не уложились в %d с', PET_TIMEOUT));
    }
    $headers = ['Origin: https://petrovich.ru', 'Referer: https://petrovich.ru/', 'Accept: application/json, text/plain, */*'];
    $post = null;
    if ($json !== null) {
        $post = json_encode($json);
        $headers[] = 'Content-Type: application/json';
    }
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPGET => $method === 'GET',
        CURLOPT_POSTFIELDS => $post,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => min(30, $left),
    ]);
    if ($method === 'GET') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, null);
        curl_setopt($ch, CURLOPT_HTTPGET, true);
    }
    $raw = curl_exec($ch);
    if ($raw === false) {
        if (microtime(true) >= $deadline) {
            fail(504, 'timeout', tr('timed out after %d s', 'не уложились в %d с', PET_TIMEOUT));
        }
        fail(502, 'petrovich_unavailable', tr('Petrovich did not respond: %s', 'Петрович не ответил: %s', curl_error($ch)));
    }
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($code === 403 || $code === 429 || ($code !== 200 && (stripos($raw, 'qrator') !== false || stripos($raw, 'captcha') !== false))) {
        pet_blocked('HTTP ' . $code);
    }
    return [$code, $raw];
}

function pet_api(string $method, string $path, array $query, $json = null)
{
    global $city;
    $query += ['city_code' => $city, 'client_id' => 'pet_site'];
    [$code, $raw] = pet_http($method, PET_API . $path . '?' . http_build_query($query), $json);
    $d = json_decode($raw);
    if (!is_object($d)) {
        fail(502, 'petrovich_bad_reply', tr('Petrovich returned non-JSON for %s (HTTP %s)', 'Петрович ответил не JSON на %s (HTTP %s)', $path, $code));
    }
    return $d;
}

function pet_state($d): int
{
    return (int)($d->state->code ?? 0);
}

function pet_start_session(): void
{
    [$code, $page] = pet_http('GET', 'https://petrovich.ru/product/106004/');
    if (!preg_match('#(https://api\.petrovich\.ru/session/v3/init\.js[^"\']*)#', $page, $m)) {
        pet_blocked(tr('no init.js on the page (HTTP %s)', 'нет init.js на странице (HTTP %s)', $code));
    }
    [, $reply] = pet_http('GET', html_entity_decode($m[1]));
    if (strpos($reply, '"started":true') === false) {
        pet_blocked(tr('session did not start', 'сессия не стартовала'));
    }
}

function pet_pause(): void
{
    usleep(random_int(300000, 500000));
}

function pet_in_stock($p): bool
{
    if (!empty($p->is_not_in_stock)) {
        return false;
    }
    return true;
}

pet_start_session();

$found = [];
foreach (array_chunk(array_keys($items), PET_BATCH) as $chunk) {
    $d = pet_api('GET', '/catalog/v5/search-d', ['q' => implode(',', $chunk), 'limit' => PET_BATCH]);
    foreach ((array)($d->data->products ?? []) as $p) {
        $c = (string)($p->code ?? '');
        if ($c !== '' && isset($items[$c]) && !empty($p->product_guid)) {
            $found[$c] = $p;
        }
    }
    pet_pause();
}
foreach ($items as $c => $_) {
    if (isset($found[$c])) {
        continue;
    }
    $d = pet_api('GET', '/catalog/v5/products/' . $c, []);
    if (pet_state($d) === 20001 && !empty($d->data->product->product_guid)) {
        $found[$c] = $d->data->product;
    }
    pet_pause();
}

$added = [];
$missing = [];
$total = 0;
foreach ($items as $c => $it) {
    $p = $found[$c] ?? null;
    if (!$p) {
        $missing[] = ['code' => (string)$c, 'reason' => 'not_found'];
        continue;
    }
    if (!pet_in_stock($p)) {
        $missing[] = ['code' => (string)$c, 'reason' => 'no_stock', 'name' => (string)($p->title ?? '')];
        continue;
    }
    $d = pet_api('POST', '/cart/v2/products/' . $p->product_guid, [], ['qty' => $it['qty']]);
    if (pet_state($d) !== 200) {
        $missing[] = ['code' => (string)$c, 'reason' => 'add_failed', 'name' => (string)($p->title ?? ''), 'detail' => (string)($d->state->title ?? '')];
    } else {
        $price = isset($p->price->retail) ? (float)$p->price->retail : null;
        $added[] = ['code' => (string)$c, 'qty' => $it['qty'], 'name' => (string)($p->title ?? $it['name'] ?? ''), 'price' => $price];
        if ($price !== null) {
            $total += $price * $it['qty'];
        }
    }
    pet_pause();
}

if (!$added) {
    send_json(422, ['error' => 'nothing_added', 'message' => tr('no items were added', 'ни одной позиции не добавлено'), 'url' => null, 'added' => [], 'missing' => $missing]);
}

$link = pet_api('GET', '/cart/v2/link', []);
$url = (string)($link->data->shareLink ?? '');
pet_api('DELETE', '/cart/v2/items', []);
if ($url === '') {
    fail(502, 'petrovich_no_link', tr('Petrovich did not return an estimate link', 'Петрович не выдал ссылку на смету'), ['added' => $added, 'missing' => $missing]);
}

send_json(200, ['url' => $url, 'city' => $city, 'added' => $added, 'missing' => $missing, 'total' => round($total, 2)]);
