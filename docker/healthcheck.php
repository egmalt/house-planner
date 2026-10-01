<?php

$ctx = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 4]]);
foreach (['/' => [200], '/api/plan.php' => [200, 401, 503]] as $path => $codes) {
    $http_response_header = [];
    @file_get_contents('http://127.0.0.1:8080' . $path, false, $ctx);
    $code = preg_match('#^HTTP/\S+ (\d{3})#', $http_response_header[0] ?? '', $m) ? (int)$m[1] : 0;
    if (!in_array($code, $codes, true)) {
        fwrite(STDERR, $path . ' -> ' . $code . "\n");
        exit(1);
    }
}
