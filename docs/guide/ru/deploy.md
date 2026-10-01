# Заливка на виртуальный хостинг

[English](../en/deploy.md) | **Русский**

Подойдёт любой хостинг с PHP 8.1+ (с `curl`) и Apache или LiteSpeed с `mod_rewrite`. Сайт — папка статики плюс `api/*.php`; план живёт в папке `storage/`, которую создаёт мастер установки. Про Docker — в [install.md](install.md#docker).

## 1. Сборка

```bash
npm ci
npm run build
```

Результат — `dist/`: `index.html`, `assets/`, `api/` (PHP), `data/` (каталог и страница участка), `plans/demo.json` (засев), `models/`, `textures/`. Пути относительные, сайт работает и в корне домена, и в подпапке.

## 2. Заливка

### Скриптом `scripts/deploy.sh`

Скопируйте [`.env.deploy.example`](../../../.env.deploy.example) в `.env.deploy` и заполните. По SSH (rsync):

```bash
DEPLOY_URL=https://plan.example.com
DEPLOY_METHOD=ssh
DEPLOY_SSH=user@example.com
DEPLOY_PATH=www/plan.example.com
# DEPLOY_SSH_OPTS="-p 2222 -i ~/.ssh/id_ed25519"
```

По FTP (нужен `lftp`):

```bash
DEPLOY_METHOD=ftp
FTP_HOST=ftp.example.com
FTP_USER=...
FTP_PASSWORD=...
FTP_PATH=www/plan.example.com
```

Дальше:

```bash
scripts/deploy.sh             # сборка, заливка, сверка
scripts/deploy.sh --no-build  # залить готовый dist/
```

Скрипт собирает проект, зеркалит `dist/` в корень сайта с удалением лишних файлов и сверяет каждый файл с сервером: по SSH — контрольные суммы, по FTP — размеры. `storage/`, `data/.htaccess` и `plans/.htaccess` на сервере он не трогает никогда. Замок не даёт запустить две заливки одновременно.

### Вручную

Залейте **содержимое** `dist/` в корень сайта любым FTP-клиентом. При обновлениях не удаляйте и не перезаписывайте `storage/` (если оно внутри корня сайта), `data/.htaccess` и `plans/.htaccess`: там хеш пароля и токен куки.

## 3. Установка

Откройте `https://plan.example.com/api/setup.php`:

1. Выберите место хранилища. Предпочтительно вне корня сайта (`../storage`); внутри корня оно закрыто `.htaccess`.
2. Задайте пароль не короче 8 символов.
3. Готово: мастер пишет `storage/config.php`, закрывает `data/` и `plans/` кукой входа и дальше отвечает `403`.

Чтобы между заливкой и первым заходом мастер не запустил кто-то другой, задайте в панели хостинга переменную окружения `HOUSE_SETUP_KEY` — мастер спросит этот ключ.

## 4. HTTPS

Включите сертификат в панели хостинга (Let's Encrypt обычно выдаётся одной кнопкой) и там же переадресацию HTTP → HTTPS. Кука входа получает `Secure` автоматически при запросе по HTTPS. Без HTTPS пароль идёт открытым текстом — для сайта в интернете этот шаг обязателен.

## Что где лежит на сервере

| Путь | Что | При заливке |
|---|---|---|
| `storage/config.php` | хеш пароля, токен куки, засев, часовой пояс | не трогается |
| `storage/current.json` | текущий план | не трогается |
| `storage/versions/`, `versions.jsonl` | все ревизии и их индекс | не трогается |
| `storage/snapshots/`, `snapshots.jsonl` | именованные снимки | не трогается |
| `storage/site-fixed.json` | необязательные неизменяемые данные участка (граница, привязка, улица, закреплённые зоны) | не трогается |
| `data/.htaccess`, `plans/.htaccess` | проверка куки для файлов данных, пишет мастер | не трогается |
| `data/catalog.json` | каталог цен | заменяется из `public/data/` |
| `data/house.json` | страница «Участок и дом» | заменяется из `public/data/` |
| `data/parcel.geojson` | необязательные смежные участки для карты | заменяется из `public/data/`, удаляется, если его там нет |
| `plans/demo.json` | засев пустого хранилища | заменяется |

Свои `house.json`, `catalog.json` и `parcel.geojson` держите локально в `public/data/`, иначе следующая заливка перезапишет или удалит серверные копии. Если в них личные данные, не добавляйте их в git (например, через `.git/info/exclude`).

## nginx

На nginx `.htaccess` не работает. Вынесите хранилище за корень сайта и закройте папки с данными сами, пропуская только запросы с кукой входа:

```nginx
location ^~ /storage/ { deny all; }
location ~ ^/api/_ { deny all; }
location ~ ^/(data|plans)/ {
    if ($cookie_hauth != "<токен из storage/config.php>") { return 401; }
}
location ~ \.php$ { include fastcgi_params; fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; fastcgi_pass unix:/run/php/php-fpm.sock; }
```

## Обновление

```bash
git pull
npm ci
scripts/deploy.sh
```

План, версии и пароль сохраняются. Если менялся формат плана, новые клиент и сервер вместе поднимают минимальную версию клиента; старые открытые вкладки сами перезагружаются, а не затирают новые поля. Перед обновлением загляните в [CHANGELOG.md](../../../CHANGELOG.md).

## Резервные копии

Всё ценное — папка хранилища. Копируйте её целиком, например:

```bash
ssh user@example.com 'tar -C www -czf - storage' > house-backup-$(date +%F).tar.gz
```

Быстрая копия одного плана — «⋯» → «Экспорт JSON» или `scripts/plan-pull.sh`. Восстановление — вернуть папку на место или импортировать JSON новой ревизией.

## Смена пароля

Удалите `config.php` в хранилище и снова откройте `/api/setup.php`. План и история остаются; прежние входы перестают действовать, потому что создаётся новый токен куки.
