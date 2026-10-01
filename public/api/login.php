<?php

require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    fail(405, 'method_not_allowed', tr('POST only', 'только POST'));
}
if (trim((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === '') {
    fail(403, 'csrf', tr('X-Requested-With header required', 'нужен заголовок X-Requested-With'));
}

$config = load_config();
if (is_demo()) {
    send_json(200, ['ok' => true, 'demo' => true]);
}
$token = (string)($config['hauth'] ?? '');
$hash = (string)($config['password_hash'] ?? '');
$body = json_decode((string)file_get_contents('php://input', false, null, 0, 4096), true);
$password = is_array($body) && is_string($body['password'] ?? null) ? $body['password'] : '';

if ($token === '' || $hash === '' || $password === '' || !password_verify($password, $hash)) {
    sleep(1);
    fail(401, 'wrong_password', tr('wrong password', 'неверный пароль'));
}

header(auth_cookie($token, 31536000), true);
send_json(200, ['ok' => true]);
