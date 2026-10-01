<?php

// Пример storage/config.php. Обычно его пишет мастер установки api/setup.php.
// Хранилище ищется по порядку: $HOUSE_STORAGE, <корень сайта>/../storage, <корень сайта>/storage.
//
// password_hash — результат password_hash(): php -r 'echo password_hash("пароль", PASSWORD_DEFAULT), "\n";'
// hauth — случайный токен куки входа, 64 hex-символа: php -r 'echo bin2hex(random_bytes(32)), "\n";'
//         Тот же токен должен стоять в data/.htaccess и plans/.htaccess (их тоже пишет setup.php).
// seed — план, которым засевается пустое хранилище; путь от корня сайта или абсолютный.

return [
    'password_hash' => '$2y$10$replace.with.output.of.password_hash.function.......',
    'hauth' => 'replace-with-64-hex-chars',
    'seed' => 'plans/demo.json',
    'timezone' => 'Europe/Moscow',
    'min_client_version' => 2,
];
