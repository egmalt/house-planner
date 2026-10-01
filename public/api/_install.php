<?php

require_once __DIR__ . '/_lib.php';

const MIN_PASSWORD = 8;

function write_file(string $path, string $data, int $mode): void
{
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $data) !== strlen($data) || !rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException(tr('could not write %s', 'не удалось записать %s', $path));
    }
    @chmod($path, $mode);
}

function gate_htaccess(string $token): string
{
    return "<IfModule mod_rewrite.c>\n"
        . "RewriteEngine On\n"
        . "RewriteCond %{HTTP_COOKIE} !(^|;\\s*)" . AUTH_COOKIE . "=" . $token . "(;|$)\n"
        . "RewriteRule ^ - [R=401,L]\n"
        . "</IfModule>\n"
        . "<IfModule !mod_rewrite.c>\n"
        . "Require all denied\n"
        . "</IfModule>\n"
        . "<IfModule mod_headers.c>\n"
        . "Header always set Cache-Control \"no-store\"\n"
        . "</IfModule>\n";
}

function deny_htaccess(): string
{
    return "Require all denied\n";
}

function config_php(array $c): string
{
    return "<?php\n\nreturn " . var_export($c, true) . ";\n";
}

function write_gates(?string $token): array
{
    $written = [];
    foreach (['data', 'plans'] as $sub) {
        $d = webroot_dir() . '/' . $sub;
        if (is_dir($d)) {
            write_file($d . '/.htaccess', $token === null ? deny_htaccess() : gate_htaccess($token), 0644);
            $written[] = $sub . '/.htaccess';
        }
    }
    return $written;
}

function install(string $dir, string $password): array
{
    if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
        throw new RuntimeException(tr('could not create %s', 'не удалось создать %s', $dir));
    }
    if (!is_dir($dir . '/versions') && !mkdir($dir . '/versions', 0700, true)) {
        throw new RuntimeException(tr('could not create %s', 'не удалось создать %s', $dir . '/versions'));
    }
    write_file($dir . '/.htaccess', deny_htaccess(), 0644);
    write_file($dir . '/index.html', '', 0644);

    $token = bin2hex(random_bytes(32));
    $config = [
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'hauth' => $token,
        'seed' => 'plans/demo.json',
        'timezone' => 'Europe/Moscow',
        'min_client_version' => MIN_CLIENT_VERSION,
        'installed_at' => gmdate('c'),
    ];
    $written = write_gates($token);
    write_file($dir . '/config.php', config_php($config), 0600);
    return [$token, $written];
}
