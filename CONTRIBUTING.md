# Contributing

Thanks for your interest in House Planner. Bug reports, fixes, new calculations, catalog improvements and translations are all welcome. Issues and pull requests can be written in English or Russian.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## Development setup

You need Node.js 22, PHP 8.1+ and, for the plan scripts, `bash`, `curl` and `python3`.

```bash
git clone https://github.com/egmalt/house-planner.git
cd house-planner
npm ci
```

Run the PHP API and Vite in two terminals:

```bash
npm run dev:api     # terminal 1: php -S 127.0.0.1:8000 -t public scripts/dev-router.php
npm run dev         # terminal 2: Vite on http://localhost:5173
```

Open <http://localhost:5173/api/setup.php> once, keep the first storage option and set any password, then work at <http://localhost:5173/>. Vite proxies `/api`, `/data` and `/plans` to the PHP server, so PHP files in `public/api/` are used as is, without a build, and frontend changes reload instantly.

Notes:

- The storage is `$HOUSE_STORAGE` if set, otherwise `./storage` in the repository root (git-ignored). For a throwaway setup: `HOUSE_STORAGE=/tmp/house-dev npm run dev:api`.
- `scripts/dev-router.php` makes the PHP built-in server behave like Apache with the project's `.htaccess`: `api/_*.php`, `storage/` and dotfiles return `403`, `data/` and `plans/` need the login cookie.
- The setup wizard writes `public/data/.htaccess` and `public/plans/.htaccess`. They are git-ignored, skipped by `scripts/deploy.sh` and removed in the Docker build.
- To check the production build, use Docker (`docker compose up -d --build`, see the [install guide](docs/guide/en/install.md#docker)) or `npm run build && php -S 127.0.0.1:8000 -t dist`.

## Project layout

| Path | What |
|---|---|
| `src/model/` | plan schema (zod), geometry, editing operations, wall estimate |
| `src/canvas/` | 2D editor on Konva: walls, openings, zones, snapping, ruler, selection |
| `src/view3d/` | 3D scene on React Three Fiber, looks, RAL palette |
| `src/map/` | satellite map on MapLibre, geo-referencing, imagery alignment |
| `src/networks/` | sewer, water, electrical (`electric/`) and underfloor heating (`heating/`): editors, calculations, pricing |
| `src/estimate/` | estimate sheet, catalog matching, CSV, Petrovich cart |
| `src/stats/` | room detection and area summary |
| `src/furniture/` | furniture catalog, 2D symbols, 3D models ([README](src/furniture/README.md)) |
| `src/storage/`, `src/store/` | server sync, versions, Zustand store with undo |
| `src/ui/`, `src/styles/` | shared primitives and design tokens ([docs/ui.md](docs/ui.md)) |
| `public/api/` | PHP API: plan storage, login, setup, Petrovich cart ([docs/api.md](docs/api.md)) |
| `public/data/` | price catalog and the «Участок и дом» page data |
| `public/plans/demo.json` | demo plan that seeds an empty storage |
| `scripts/` | deploy, plan pull/push, plan validation |
| `docker/`, `Dockerfile`, `docker-compose.yml` | container image |

## Before opening a pull request

Run the same checks as CI:

```bash
npx tsc -b
npm run build
npm run plan:validate
npm run lint
```

Then check the change in the browser: the plan section, 3D and the estimate at least, and the phone width (under 700 px) if you touched the UI.

## Guidelines

**Keep it focused.** One topic per pull request. Describe what changed and why, and attach a screenshot for visible changes.

**Use what is already installed.** If React, three.js, drei, Konva, MapLibre, zod or Zustand already solve the problem, use them instead of writing your own. New dependencies need a reason in the PR description.

**UI.** Build from the primitives in `src/ui/` and the tokens in `src/styles/tokens.css` ([docs/ui.md](docs/ui.md)), not new colours, shadows or buttons. CSS files contain no comments. Interface strings go through i18next: add every new string to both `src/i18n/locales/en/` and `src/i18n/locales/ru/`, never inline in components.

**Plan format.** `src/model/schema.ts` is the source of truth. When you add or change fields:

- keep old plans valid (new fields optional, unknown fields preserved);
- update [docs/plan-format.md](docs/plan-format.md);
- if older clients could lose the new data when saving, raise `CLIENT_VERSION` in `src/model/schema.ts` and `MIN_CLIENT_VERSION` in `public/api/_lib.php` together;
- make sure `npm run plan:validate` still passes.

**API.** Any change to `public/api/` goes together with [docs/api.md](docs/api.md): methods, headers, status codes and error codes. The API must keep working on plain shared hosting: PHP 8.1+, no Composer, no database, no extensions beyond `json` and `curl`.

**Calculations and norms.** When a check is based on a norm (СП, ПУЭ, ГОСТ, СанПиН), name the document and clause in the warning or in the PR. Calculations are reference only, so keep the wording neutral.

**Catalog.** Each item in `public/data/catalog.json` needs `name`, `kind`, `price`, `unit`, a source (`vendor`, `url`) and `checkedAt`. Do not add affiliate links.

**No personal data.** No real addresses, cadastral numbers, names, phone numbers or private domains in code, demo data, screenshots or tests. Use the fictional demo plot for examples.

## Commit messages

Short imperative subject in English or Russian, details in the body if needed. Reference issues as `#123`.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
