# Installation

**English** | [Русский](../ru/install.md)

House Planner is a static React app plus a small PHP API that keeps the plan in files. There is no database and no Node.js process on the server. Pick one of three ways to run it.

| Option | Good for | Needs |
|---|---|---|
| [Docker](#docker) | a home server, a VPS, trying it out | Docker with Compose |
| [Local PHP server](#local-php-server) | development, a quick look | Node.js 22, PHP 8.1+ |
| [Shared hosting](#shared-hosting) | a permanent site with HTTPS | PHP 8.1+ hosting with Apache or LiteSpeed |

## Docker

```bash
git clone https://github.com/egmalt/house-planner.git
cd house-planner
docker compose up -d --build
```

Open <http://localhost:8080/>. On the first run the app asks you to finish setup: open `/api/setup.php` and set a password (at least 8 characters).

**Password from the environment.** To skip the wizard, pass the password on the first start:

```bash
HOUSE_PASSWORD='a-long-password' docker compose up -d --build
```

The password is applied only when the storage is empty. Once installed, `HOUSE_PASSWORD` is ignored, so it is safe to leave it in your `.env`.

**Port.** The container listens on `8080`; the host port is `HOUSE_PORT` (default `8080`):

```bash
HOUSE_PORT=9000 docker compose up -d
```

Compose also reads these variables from a `.env` file next to `docker-compose.yml`.

**Data.** The config, the current plan, every version and every snapshot live in the named volume `house-data`, mounted at `/var/lib/house-planner`. Rebuilding the image and `docker compose restart` keep it. `docker compose down -v` deletes it, so do not use `-v` unless you mean it.

**Changing the password.** Delete the config inside the volume and install again; the plan and history stay:

```bash
docker compose exec house-planner rm /var/lib/house-planner/config.php
HOUSE_PASSWORD='new-password' docker compose up -d --force-recreate
```

or, without `HOUSE_PASSWORD`, run `docker compose restart` and open `/api/setup.php`. Existing logins stop working because the cookie token is regenerated.

**Protecting the wizard.** Between the first start and setting the password, anyone who can reach the port can open `/api/setup.php`. Either start with `HOUSE_PASSWORD`, or set `HOUSE_SETUP_KEY` so the wizard asks for that key too.

**Backup.**

```bash
docker compose exec -T house-planner tar -C /var/lib/house-planner -czf - . > house-backup-$(date +%F).tar.gz
```

**HTTPS.** The container serves plain HTTP. Put it behind a reverse proxy that terminates TLS (Caddy, Traefik, nginx) and forward to `HOUSE_PORT`. The login cookie gets the `Secure` flag when the request comes over HTTPS.

## Local PHP server

Development mode, no build needed. Two terminals:

```bash
npm i
npm run dev:api     # terminal 1: PHP API on 127.0.0.1:8000 from public/
```

```bash
npm run dev         # terminal 2: Vite on http://localhost:5173
```

Open <http://localhost:5173/api/setup.php>, keep the first storage option, set a password, then open <http://localhost:5173/>. Vite proxies `/api`, `/data` and `/plans` to PHP. The storage is `$HOUSE_STORAGE` if set, otherwise `./storage` in the repository root (git-ignored).

`scripts/dev-router.php` repeats the `.htaccess` rules for the PHP built-in server (no direct access to `api/_*.php` and `storage/`, cookie check for `data/` and `plans/`). Still, the built-in server is for your own machine only.

To run the production build locally instead: `npm run build && php -S 127.0.0.1:8000 -t dist`, then <http://127.0.0.1:8000/api/setup.php>.

## Shared hosting

Any hosting with PHP 8.1+ (with the `curl` extension, used by the Petrovich cart) and Apache or LiteSpeed with `mod_rewrite` works. Build locally, upload `dist/`, open `/api/setup.php`. Full walkthrough with `scripts/deploy.sh`, FTP, HTTPS, updates and backups: [deploy.md](deploy.md).

## What setup does

`/api/setup.php` runs once. It:

1. Offers storage locations in order: `$HOUSE_STORAGE`, `<site root>/../storage` (outside the web root, preferred), `<site root>/storage` (inside, closed by `Require all denied`).
2. Creates the storage folder with `config.php` (password hash, random cookie token, seed plan path, time zone).
3. Writes `data/.htaccess` and `plans/.htaccess`, which return `401` without the login cookie.
4. Returns `403` on every later visit.

On the first API request the storage is seeded from `plans/demo.json`: a fictional Nordic single-storey house with a garage on a 30 × 45 m plot in Estonia. Replace it with your own plan in the editor, or import a JSON file from the "⋯" menu.

## Requirements in short

| Component | Version |
|---|---|
| Node.js (build only) | 22 |
| PHP | 8.1+ with `json`, `curl` (for the Petrovich cart) |
| Web server | Apache 2.4 or LiteSpeed with `mod_rewrite`; nginx works if you deny `/storage`, `/data`, `/plans` yourself |
| Browser | a current Chrome, Firefox, Safari or Edge with WebGL 2 |

Next: [usage guide](usage.md).
