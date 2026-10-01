<?php

// Router for the PHP built-in server in development: npm run dev:api.
// php -S ignores .htaccess, so this repeats its rules: no direct access to
// api/_*.php, storage/ and dotfiles; data/ and plans/ need the login cookie
// (except in demo mode, where they are open).

$path = rawurldecode((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));

function dev_deny(int $code): bool
{
    http_response_code($code);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['error' => $code === 401 ? 'unauthorized' : 'forbidden']), "\n";
    return true;
}

if (preg_match('#(^|/)\.#', $path) || preg_match('#^/api/_#', $path) || preg_match('#^/storage(/|$)#', $path)) {
    return dev_deny(403);
}

if (preg_match('#^/(data|plans)/#', $path)) {
    require __DIR__ . '/../public/api/_lib.php';
    $dir = find_storage();
    if ($dir === null) {
        return dev_deny(403);
    }
    $config = require $dir . '/config.php';
    $token = is_array($config) ? (string)($config['hauth'] ?? '') : '';
    if (!is_demo() && ($token === '' || !hash_equals($token, (string)($_COOKIE[AUTH_COOKIE] ?? '')))) {
        return dev_deny(401);
    }
}

return false;
