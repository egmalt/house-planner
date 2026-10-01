<?php

require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    fail(405, 'method_not_allowed', tr('POST only', 'только POST'));
}
if (trim((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === '') {
    fail(403, 'csrf', tr('X-Requested-With header required', 'нужен заголовок X-Requested-With'));
}

header(auth_cookie('', 0), true);
send_json(200, ['ok' => true]);
