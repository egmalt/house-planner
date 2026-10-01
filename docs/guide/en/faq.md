# FAQ

**English** | [Русский](../ru/faq.md)

### Do I need a server or a database?

You need a web server with PHP 8.1+; you do not need a database. The plan, its versions and the config are plain files in a `storage/` folder. Cheap shared hosting with Apache or LiteSpeed is enough, and so is the Docker image or `php -S` on your own computer. Node.js is needed only to build the frontend. See [install.md](install.md).

### How do I change the password?

Delete `config.php` in the storage folder and open `/api/setup.php` again. The plan and history stay; everyone is logged out because a new cookie token is generated. In Docker: `docker compose exec house-planner rm /var/lib/house-planner/config.php`, then restart with a new `HOUSE_PASSWORD` or use the wizard. Details: [install.md](install.md#docker), [deploy.md](deploy.md#changing-the-password).

### Can several people use it? Are there user accounts?

There is one password per installation and no accounts or roles: everyone who knows the password can edit. Concurrent editing is safe, though: every save carries the revision it was based on, so two tabs, two people or a script never silently overwrite each other. Each revision records an author label (`web`, `cli`, or whatever `plan-push.sh --author` sets). For separate projects, run separate installations: another folder on the hosting or another Docker container with its own port and volume.

### Where is my data, and how do I back it up?

In the storage folder: `config.php`, `current.json` (current plan), `versions/` (every saved revision, kept forever), `snapshots/` (named snapshots). On shared hosting it is usually `../storage` next to the site root; in Docker it is the `house-data` volume. Back up the whole folder. For a copy of the plan alone use «⋯» → «Экспорт JSON» or `scripts/plan-pull.sh`. Commands: [deploy.md](deploy.md#backups).

### How do I update to a new version?

`git pull`, `npm ci`, `scripts/deploy.sh` (or upload the new `dist/` by hand without touching `storage/`, `data/.htaccess`, `plans/.htaccess`). In Docker: `git pull && docker compose up -d --build`. The storage is not affected. Check [CHANGELOG.md](../../../CHANGELOG.md) first.

### How do I load my own plot?

1. Get the parcel polygon in WGS84 longitude/latitude as GeoJSON. In Russia you can export it from the public cadastral map (НСПД) or draw it in any GIS tool (QGIS, geojson.io).
2. Open «Карта», expand «Граница из GeoJSON», paste a `Polygon`, `Feature` or `FeatureCollection`, keep «Вычислить geo по полигону» on and choose which vertex becomes the plan origin.
3. «Пересчитать», check the area and size, then «Применить к плану». The boundary becomes `site.boundary` in millimetres and `site.geo` ties the plan to the map.
4. If the satellite image is offset from the boundary, align the image with the shift and rotation controls; only the image correction is stored.

Neighbouring parcels can be shown from `public/data/parcel.geojson` (a `FeatureCollection`). To lock the legal boundary so it cannot be moved from the editor or a script, put `site-fixed.json` into the storage folder, see `storage.example/site-fixed.example.json` and [docs/api.md](../../api.md).

### How do I add a material to the catalog?

The catalog is `public/data/catalog.json`, an array of items:

```json
{ "id": "block-d500-600x300x200", "name": "Gas block D500 600×300×200", "kind": "block",
  "vendor": "Store name", "url": "https://…", "sku": "123456",
  "thickness": 300, "length": 600, "height": 200,
  "price": 290, "unit": "шт", "checkedAt": "2026-10-01" }
```

`kind` decides where the item is used (`sip`, `pir`, `block`, `timber`, `door`, `window`, `gate`, `insulation`, `sewer`, `water`, `heating`, `electric` and others); `unit` is `шт` (piece), `м²`, `м` and so on; `preferred: true` wins over cheaper matches; `sku` is the Petrovich product code. The matching rules for each network are in [docs/plan-format.md](../../plan-format.md). The catalog is loaded at runtime, so after editing it is enough to upload `data/catalog.json`; no rebuild is needed. A material used only in one plan can instead go into the plan's own `materials` with a `price`.

### Are the prices real?

They are an example collected from stores in Saint Petersburg on the date in each item's `checkedAt`. They are not an offer, they go stale, and they may not match your region. Treat the catalog as a template and keep your own.

### Are the building code checks reliable?

They are reference checks based on Russian codes (СП 30.13330, ПУЭ, ГОСТ Р 50571, СанПиН) and simplified engineering formulas. They catch typical mistakes early, but do not replace a design by a licensed engineer or local regulations.

### Does it work on a phone?

Yes, for viewing. On screens narrower than 700 px or touch-only devices the app switches to read-only: plan, 3D, map, estimate and the site page work; nothing is written to the server. Editing needs a mouse or trackpad.

### How does the Petrovich cart work?

«Смета» → «Собрать корзину в Петровиче». The server-side `api/petrovich-cart.php` opens an anonymous session on petrovich.ru, finds the products by code, adds them to a cart, gets a public estimate link and clears the cart. You get one link per section (house, garage, electrical, sewer, water, underfloor heating, other); anyone can open it and move the items to their own cart in one click.

Limitations:

- Only lines with a Petrovich product code (`sku`, or a `petrovich.ru/product/<code>/` URL) are included. Other stores are skipped.
- Two cities: Saint Petersburg and Vyborg. Items out of stock in the chosen city are skipped and listed.
- Up to 150 distinct items per request, one request at a time (a second one gets `429`), 120 s timeout.
- Prices in the reply are Petrovich retail prices without cart discounts.
- It uses Petrovich's website API, not an official integration: it may break when they change it, and their bot protection may block your hosting's IP (`502 petrovich_blocked`).
- Every call creates a new estimate on their side that cannot be deleted anonymously, so do not call it in a loop.
- Needs the PHP `curl` extension.

### Can I use it without internet?

Mostly. Run it locally (Docker or `php -S`) and the editor, 3D, networks and estimate work on a local network without internet access. Internet is needed for satellite imagery (Esri World Imagery tiles), for the Petrovich cart and for product links. The app loads no fonts or scripts from third-party CDNs.

### Which interface languages are there?

English and Russian. English is the default regardless of the browser language; switch in the "⋯" menu → Language (the choice is remembered) or link with `?lang=ru` / `?lang=en`. Translations to other languages are welcome: strings live in `src/i18n/locales/<language>/`, see [CONTRIBUTING.md](../../../CONTRIBUTING.md).

### What is the license?

[MIT](../../../LICENSE): use, modify and host it, including commercially, keeping the copyright notice. Bundled textures and furniture models have their own licenses, listed in `public/textures/LICENSE.txt` and `public/models/furniture/LICENSES.md`.
