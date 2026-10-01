# Deploying to shared hosting

**English** | [Русский](../ru/deploy.md)

Target: any hosting with PHP 8.1+ (with `curl`) and Apache or LiteSpeed with `mod_rewrite`. The site is a folder of static files plus `api/*.php`; the plan lives in a `storage/` folder that the setup wizard creates. For Docker see [install.md](install.md#docker).

## 1. Build

```bash
npm ci
npm run build
```

The result is `dist/`: `index.html`, `assets/`, `api/` (PHP), `data/` (catalog and site notes), `plans/demo.json` (seed), `models/`, `textures/`. Paths are relative, so the site works both at a domain root and in a subfolder.

## 2. Upload

### With `scripts/deploy.sh`

Copy [`.env.deploy.example`](../../../.env.deploy.example) to `.env.deploy` and fill it in. Over SSH (rsync):

```bash
DEPLOY_URL=https://plan.example.com
DEPLOY_METHOD=ssh
DEPLOY_SSH=user@example.com
DEPLOY_PATH=www/plan.example.com
# DEPLOY_SSH_OPTS="-p 2222 -i ~/.ssh/id_ed25519"
```

Over FTP (needs `lftp`):

```bash
DEPLOY_METHOD=ftp
FTP_HOST=ftp.example.com
FTP_USER=...
FTP_PASSWORD=...
FTP_PATH=www/plan.example.com
```

Then:

```bash
scripts/deploy.sh             # build, upload, verify
scripts/deploy.sh --no-build  # upload the existing dist/
```

The script builds, mirrors `dist/` to the site root with deletion of stale files, and compares checksums (SSH) or sizes (FTP) of every file with the server. It never touches `storage/`, `data/.htaccess` and `plans/.htaccess` on the server. A lock prevents two deploys from running at once.

### By hand

Upload the **contents** of `dist/` to the site root with any FTP client. On updates, do not delete or overwrite `storage/` (if it is inside the site root), `data/.htaccess` and `plans/.htaccess`: they hold your password hash and cookie token.

## 3. Install

Open `https://plan.example.com/api/setup.php`:

1. Choose where to keep the storage. Outside the site root (`../storage`) is preferred; inside the site root it is closed by `.htaccess`.
2. Set a password, at least 8 characters.
3. Done: the wizard writes `storage/config.php`, closes `data/` and `plans/` behind the login cookie and answers `403` from then on.

To make sure nobody else runs the wizard between upload and your first visit, set the `HOUSE_SETUP_KEY` environment variable in the hosting panel; the wizard will ask for it.

## 4. HTTPS

Enable a certificate in the hosting panel (most hosts issue Let's Encrypt in one click) and turn on the HTTP → HTTPS redirect there. The login cookie gets `Secure` automatically on HTTPS requests. Without HTTPS the password travels in clear text, so do not skip this step for a public site.

## Where things are on the server

| Path | What | In deploy |
|---|---|---|
| `storage/config.php` | password hash, cookie token, seed path, time zone | never touched |
| `storage/current.json` | current plan | never touched |
| `storage/versions/`, `versions.jsonl` | every saved revision and its index | never touched |
| `storage/snapshots/`, `snapshots.jsonl` | named snapshots | never touched |
| `storage/site-fixed.json` | optional locked site data (boundary, geo, street, locked zones) | never touched |
| `data/.htaccess`, `plans/.htaccess` | cookie check for data files, written by setup | never touched |
| `data/catalog.json` | price catalog | replaced from `public/data/` |
| `data/house.json` | «Участок и дом» page | replaced from `public/data/` |
| `data/parcel.geojson` | optional neighbouring parcels for the map | replaced from `public/data/`, deleted if absent there |
| `plans/demo.json` | seed for an empty storage | replaced |

Keep your own `house.json`, `catalog.json` and `parcel.geojson` in `public/data/` locally, otherwise the next deploy overwrites or removes the server copies. If they contain personal data, keep them out of git (for example with `.git/info/exclude`).

## nginx

`.htaccess` does nothing on nginx. Put the storage outside the web root and deny the data folders yourself, letting only requests with the login cookie through:

```nginx
location ^~ /storage/ { deny all; }
location ~ ^/api/_ { deny all; }
location ~ ^/(data|plans)/ {
    if ($cookie_hauth != "<token from storage/config.php>") { return 401; }
}
location ~ \.php$ { include fastcgi_params; fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; fastcgi_pass unix:/run/php/php-fpm.sock; }
```

## Updating

```bash
git pull
npm ci
scripts/deploy.sh
```

The plan, versions and password stay. If the plan format changed, the new client and server raise the minimum client version together; old open tabs reload themselves instead of overwriting new fields. Read [CHANGELOG.md](../../../CHANGELOG.md) before updating.

## Backups

Everything that matters is the storage folder. Copy it whole, for example:

```bash
ssh user@example.com 'tar -C www -czf - storage' > house-backup-$(date +%F).tar.gz
```

For a quick copy of the plan alone, use «⋯» → «Экспорт JSON» or `scripts/plan-pull.sh`. To restore, put the folder back, or import the JSON as a new revision.

## Changing the password

Delete `config.php` in the storage folder and open `/api/setup.php` again. The plan and history stay; existing logins stop working because a new cookie token is generated.
