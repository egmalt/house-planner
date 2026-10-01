# Public demo

**English** | [Русский](../ru/demo.md)

Demo mode turns an installation into an open sandbox: the planner opens without a password, every visitor sees everyone's edits, and once an hour the plan goes back to the original `plans/demo.json`. This is how the demo on the project site works; you don't need it for your own house — install a regular copy.

## What changes

No login: the API doesn't check the cookie, the password screen never shows, `data/` and `plans/` are open. A thin bar at the top says the demo is shared and resets hourly and links to GitHub. Every hour the plan resets to `plans/demo.json`, and versions and snapshots older than an hour are deleted. Abuse limits: plan size up to 1 MB, at most 30 saves per minute per IP (then `429`), at most 20 snapshots, the Petrovich cart is disabled (the button is inactive, the API answers `403 demo_disabled`). Details and response codes are in [docs/api.md](../../api.md#демо-режим) (Russian).

## Docker

```bash
HOUSE_DEMO=1 docker compose up -d --build
```

No password needed: the boot script installs the planner with a random password and opens `data/` and `plans/`. The reset is lazy: the first request after an hour since the previous reset triggers it.

## Shared hosting

Install the planner as usual ([deploy.md](deploy.md)), then add this key to `storage/config.php`:

```php
'demo' => true,
```

and a cron job running as the web server user:

```cron
0 * * * * php /home/user/house-planner/scripts/demo-reset.php --webroot=/home/user/www/plan.example.com
```

`--webroot` is the site root where `dist/` was uploaded; the script loads `api/_lib.php` and `plans/demo.json` from there and finds the storage the same way the API does (`HOUSE_STORAGE`, `../storage`, `storage`). The first run opens `data/` and `plans/` right away. Without cron the lazy reset works as in Docker.

## Turning it off

Remove the `demo` key (or the `HOUSE_DEMO` variable), then lock the static files again: in Docker run `docker compose exec house-planner rm /var/lib/house-planner/config.php` and `HOUSE_PASSWORD=<password> docker compose up -d` (the demo install's password is random and unknown); on shared hosting delete `config.php` in the storage and run `api/setup.php` with a new password (the plan and versions stay). Rotating the cookie token this way is recommended, since `data/` and `plans/` were open during the demo.
