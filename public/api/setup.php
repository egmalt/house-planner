<?php

require __DIR__ . '/_install.php';

function setup_page(int $code, string $title, string $body): void
{
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex');
    echo '<!doctype html><html lang="' . ui_lang() . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<meta name="robots" content="noindex,nofollow"><title>' . h(tr('Planner setup', 'Установка планировщика')) . '</title><style>';
    echo '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:#f4f1ec;color:#2b2d33;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}';
    echo '.setup{width:100%;max-width:520px;background:#fff;border:1px solid #ece8e1;border-radius:16px;padding:28px 24px}';
    echo '.setup h1{margin:0 0 12px;font-size:20px}.setup label{display:block;margin:14px 0 4px;font-weight:600}';
    echo '.setup input[type=password],.setup input[type=text]{width:100%;padding:10px 12px;font:inherit;border:1px solid #d8d2c8;border-radius:10px}';
    echo '.setup button{margin-top:18px;width:100%;padding:12px;font:inherit;font-weight:600;color:#fff;background:#f26b1d;border:0;border-radius:10px;cursor:pointer}';
    echo '.setup code{background:#f4f1ec;padding:1px 5px;border-radius:5px;word-break:break-all}.setup .err{color:#d9412b}.setup .warn{color:#a35a00}.setup .muted{color:#8a8f98}';
    echo '.setup .opt{display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-weight:400}';
    echo '</style></head><body><main class="setup"><h1>' . htmlspecialchars($title) . '</h1>' . $body . '</main></body></html>';
    exit;
}

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES);
}

function dir_writable_for(string $dir): bool
{
    if (is_dir($dir)) {
        return is_writable($dir);
    }
    $parent = dirname($dir);
    return is_dir($parent) && is_writable($parent);
}

function storage_options(): array
{
    $out = [];
    $inside = webroot_dir() . '/storage';
    foreach (storage_candidates() as $i => $dir) {
        $out[] = [
            'id' => (string)$i,
            'dir' => $dir,
            'inside' => $dir === $inside,
            'writable' => dir_writable_for($dir),
        ];
    }
    return $out;
}

function server_honours_htaccess(): bool
{
    $sw = strtolower((string)($_SERVER['SERVER_SOFTWARE'] ?? ''));
    return strpos($sw, 'apache') !== false || strpos($sw, 'litespeed') !== false;
}

$existing = find_storage();
if ($existing !== null) {
    setup_page(403, tr('Already installed', 'Уже установлено'), tr('<p>Storage found: <code>%s</code>. Setup is locked.</p>', '<p>Хранилище найдено: <code>%s</code>. Установка заблокирована.</p>', h($existing))
        . tr('<p class="muted">To change the password, delete <code>config.php</code> in the storage and open this page again: the plan and versions stay in place.</p>', '<p class="muted">Чтобы сменить пароль, удалите <code>config.php</code> в хранилище и откройте эту страницу снова: план и версии останутся на месте.</p>')
        . tr('<p><a href="../">Open the planner</a></p>', '<p><a href="../">Открыть планировщик</a></p>'));
}

$key = getenv('HOUSE_SETUP_KEY');
$needKey = is_string($key) && $key !== '';
$options = storage_options();
$errors = [];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $password = (string)($_POST['password'] ?? '');
    $repeat = (string)($_POST['repeat'] ?? '');
    $choice = (string)($_POST['storage'] ?? '');
    if ($needKey && !hash_equals($key, (string)($_POST['key'] ?? ''))) {
        $errors[] = tr('wrong setup key', 'неверный ключ установки');
    }
    if (mb_strlen($password) < MIN_PASSWORD) {
        $errors[] = tr('password is shorter than %d characters', 'пароль короче %d символов', MIN_PASSWORD);
    }
    if ($password !== $repeat) {
        $errors[] = tr('passwords do not match', 'пароли не совпадают');
    }
    $picked = null;
    foreach ($options as $o) {
        if ($o['id'] === $choice) {
            $picked = $o;
        }
    }
    if ($picked === null || !$picked['writable']) {
        $errors[] = tr('the selected storage folder is not writable', 'выбранная папка хранилища недоступна для записи');
    }
    if (!$errors) {
        try {
            [, $written] = install($picked['dir'], $password);
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
        }
        if (!$errors) {
            $warn = '';
            if (!server_honours_htaccess()) {
                $warn = tr('<p class="warn">The server does not look like Apache or LiteSpeed, so it probably ignores <code>.htaccess</code> files. '
                    . 'Block access to <code>/storage</code>, <code>/data</code> and <code>/plans</code> in the web server config.</p>', '<p class="warn">Сервер не похож на Apache или LiteSpeed: файлы <code>.htaccess</code> он, скорее всего, не читает. '
                    . 'Закройте доступ к <code>/storage</code>, <code>/data</code> и <code>/plans</code> в конфигурации веб-сервера.</p>');
            }
            if ($picked['inside']) {
                $warn .= tr('<p class="warn">The storage is inside the site and protected only by <code>.htaccess</code>. If possible, move it one level above the site root.</p>', '<p class="warn">Хранилище лежит внутри сайта и закрыто только <code>.htaccess</code>. Если есть возможность, перенесите его на уровень выше корня сайта.</p>');
            }
            setup_page(200, tr('Done', 'Готово'), tr('<p>Storage: <code>%s</code></p>', '<p>Хранилище: <code>%s</code></p>', h($picked['dir']))
                . tr('<p>Protected by the login cookie: %s.</p>', '<p>Закрыты по куке входа: %s.</p>', $written ? '<code>' . implode('</code>, <code>', array_map('h', $written)) . '</code>' : tr('no data and plans folders', 'нет папок data и plans'))
                . $warn
                . tr('<p>This page will not open again. <a href="../">Go to the planner</a> and sign in with the new password.</p>', '<p>Повторно эта страница не откроется. <a href="../">Перейти к планировщику</a> и войти с новым паролем.</p>'));
        }
    }
}

$first = null;
foreach ($options as $o) {
    if ($o['writable'] && !$o['inside'] && $first === null) {
        $first = $o['id'];
    }
}
if ($first === null) {
    foreach ($options as $o) {
        if ($o['writable'] && $first === null) {
            $first = $o['id'];
        }
    }
}

$body = tr('<p class="muted">First run: set a password and a location for the plan storage. After setup this page is locked.</p>', '<p class="muted">Первый запуск: задайте пароль и место для хранилища плана. После установки эта страница блокируется.</p>');
foreach ($errors as $e) {
    $body .= '<p class="err">' . h($e) . '</p>';
}
$body .= '<form method="post" autocomplete="off">';
if ($needKey) {
    $body .= '<label for="key">' . tr('Setup key', 'Ключ установки') . '</label><input id="key" name="key" type="text" required>';
}
$body .= '<label for="password">' . tr('Password', 'Пароль') . '</label><input id="password" name="password" type="password" minlength="' . MIN_PASSWORD . '" required autofocus>';
$body .= '<label for="repeat">' . tr('Repeat password', 'Повторите пароль') . '</label><input id="repeat" name="repeat" type="password" minlength="' . MIN_PASSWORD . '" required>';
$body .= '<label>' . tr('Storage', 'Хранилище') . '</label>';
foreach ($options as $o) {
    $note = $o['inside'] ? tr('inside the site, protected by .htaccess', 'внутри сайта, закрывается .htaccess') : tr('outside the site root', 'вне корня сайта');
    $body .= '<label class="opt"><input type="radio" name="storage" value="' . h($o['id']) . '"'
        . ($o['id'] === $first ? ' checked' : '') . ($o['writable'] ? '' : ' disabled') . '>'
        . '<span><code>' . h($o['dir']) . '</code><br><span class="muted">' . $note . ($o['writable'] ? '' : tr(', not writable', ', нет прав на запись')) . '</span></span></label>';
}
$body .= '<button type="submit"' . ($first === null ? ' disabled' : '') . '>' . tr('Install', 'Установить') . '</button></form>';
if ($first === null) {
    $body .= tr('<p class="err">No writable folder. Create one of the listed folders and give PHP write access.</p>', '<p class="err">Нет папки, доступной для записи. Создайте одну из перечисленных и дайте PHP права на запись.</p>');
}
setup_page(200, tr('Planner setup', 'Установка планировщика'), $body);
