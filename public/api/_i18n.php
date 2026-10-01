<?php

function ui_lang(): string
{
    static $lang = null;
    if ($lang !== null) {
        return $lang;
    }
    $cookie = $_COOKIE['house-lang'] ?? '';
    if ($cookie === 'en' || $cookie === 'ru') {
        return $lang = $cookie;
    }
    return $lang = 'en';
}

function tr(string $en, string $ru, ...$args): string
{
    $s = ui_lang() === 'ru' ? $ru : $en;
    return $args ? vsprintf($s, $args) : $s;
}
