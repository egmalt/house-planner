<?php

require '/var/www/html/api/_install.php';

function say(string $msg): void
{
    fwrite(STDERR, '[house-planner] ' . $msg . "\n");
}

$storage = find_storage();
$password = (string)getenv('HOUSE_PASSWORD');
$demo = is_demo();

if ($storage !== null) {
    $config = require $storage . '/config.php';
    $token = is_array($config) ? (string)($config['hauth'] ?? '') : '';
    if ($token === '') {
        say('в ' . $storage . '/config.php нет токена hauth');
        exit(1);
    }
    $demo ? demo_open_gates() : write_gates($token);
    say('хранилище ' . $storage . ($password !== '' ? ', HOUSE_PASSWORD не применяется: установка уже выполнена' : ''));
    exit(0);
}

if ($password === '' && $demo) {
    $password = bin2hex(random_bytes(16));
}

if ($password === '') {
    write_gates(null);
    say('не установлено: откройте /api/setup.php и задайте пароль');
    exit(0);
}

if (mb_strlen($password) < MIN_PASSWORD) {
    say('HOUSE_PASSWORD короче ' . MIN_PASSWORD . ' символов');
    exit(1);
}

$dir = storage_candidates()[0];
install($dir, $password);
if ($demo) {
    demo_open_gates();
}
say('установлено, хранилище ' . $dir . ($demo ? ', демо-режим: вход без пароля, сброс каждый час' : ''));
