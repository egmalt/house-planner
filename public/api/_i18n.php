<?php

function ui_lang(): string
{
    static $lang = null;
    if ($lang !== null) {
        return $lang;
    }
    $cookie = $_COOKIE['lang'] ?? '';
    if ($cookie === 'en' || $cookie === 'ru') {
        return $lang = $cookie;
    }
    $best = 'en';
    $bestQ = -1.0;
    foreach (explode(',', $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '') as $part) {
        $bits = explode(';', trim($part));
        $code = strtolower(substr(trim($bits[0]), 0, 2));
        if ($code !== 'en' && $code !== 'ru') {
            continue;
        }
        $q = 1.0;
        if (isset($bits[1]) && preg_match('/q=([\d.]+)/', $bits[1], $m)) {
            $q = (float) $m[1];
        }
        if ($q > $bestQ) {
            $best = $code;
            $bestQ = $q;
        }
    }
    return $lang = $best;
}

function tr(string $en, string $ru, ...$args): string
{
    $s = ui_lang() === 'ru' ? $ru : $en;
    return $args ? vsprintf($s, $args) : $s;
}
