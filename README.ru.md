# House Planner

Планировщик частного дома на своём хостинге: 2D-план в реальном масштабе, 3D, план на спутниковой карте, инженерные сети и смета с ценами — всё хранится на вашем PHP-хостинге.

От команды [homedesignsai.pro](https://homedesignsai.pro) — ИИ, который помогает с дизайном дома.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/egmalt/house-planner/ci.yml?branch=main&label=build)](https://github.com/egmalt/house-planner/actions/workflows/ci.yml)
[![Node 22](https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PHP 8.x](https://img.shields.io/badge/PHP-8.x-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![Self-hosted](https://img.shields.io/badge/self--hosted-yes-blueviolet)](docs/guide/ru/install.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Live demo](https://img.shields.io/badge/live%20demo-app.homedesignsai.pro-f26b1d)](https://app.homedesignsai.pro)

[English](README.md) | **Русский**

![House Planner: демо-дом в 3D, вид «Материалы»](docs/screenshots/hero.png)

<table>
<tr><td align="center"><img src="docs/screenshots/plan.png" width="300" alt="2D-редактор плана"><br><sub>2D-редактор плана</sub></td><td align="center"><img src="docs/screenshots/3d.png" width="300" alt="3D с низкими стенами"><br><sub>3D с низкими стенами</sub></td><td align="center" rowspan="2"><img src="docs/screenshots/mobile.png" width="150" alt="Просмотр с телефона"><br><sub>Просмотр с телефона</sub></td></tr>
<tr><td align="center"><img src="docs/screenshots/map.png" width="300" alt="План на спутниковой карте"><br><sub>План на спутниковой карте</sub></td><td align="center"><img src="docs/screenshots/estimate.png" width="300" alt="Смета на листе A4"><br><sub>Смета на листе A4</sub></td></tr>
<tr><td align="center"><img src="docs/screenshots/networks.png" width="300" alt="Электрика: группы и трассы"><br><sub>Электрика: группы и трассы</sub></td><td align="center"><img src="docs/screenshots/heating.png" width="300" alt="Петли тёплого пола"><br><sub>Петли тёплого пола</sub></td><td align="center"><img src="docs/screenshots/versions.png" width="300" alt="Версии и снимки"><br><sub>Версии и снимки</sub></td></tr>
</table>

**[Живое демо](https://app.homedesignsai.pro)**: общая копия без входа, сбрасывается каждый час, см. [демо-режим](docs/guide/ru/demo.md). Интерфейс на английском и русском.

## Возможности

**2D-редактор плана**
- Черчение в миллиметрах в реальном масштабе: стены с толщиной и материалом, двери, окна, гаражные ворота, мебель из каталога с реальными размерами, зоны участка (отсыпка, газон, мощение).
- Привязка к концам стен и сетке 100 мм, размерные линии, линейка (`M`, цепочкой), отмена и повтор.
- Поворот вида шагом 15° и «Север вверх», выделение здания (`B`), чтобы сдвинуть или повернуть дом целиком, подписи комнат с площадью в чистоте по стенам.
- Сводка площадей: общая и жилая, комнаты, спальни, санузлы, пятно застройки, процент застройки участка.

**3D**
- Два вида: «Макет» (чистые объёмы) и «Материалы» (текстуры по материалу стен и отделке фасада).
- Цвет стен и акцента из палитры RAL, низкие стены (1 м и уровень пола), чтобы смотреть планировку сверху, камеры 3/4, сверху, спереди.

**Участок и карта**
- План поверх спутникового снимка по геопривязке (широта и долгота начала координат плана и поворот).
- Граница участка из GeoJSON (например, кадастровый участок), смежные участки из `data/parcel.geojson`, ручное выравнивание снимка.
- Необязательные неизменяемые данные участка на сервере: юридическую границу нельзя сдвинуть из редактора.

**Инженерные сети** (каждая — слой со своим редактором, расчётом и группой в смете)
- **Канализация** с септиком: трасса от приборов, стояки, ревизии, выпуски; уклоны, отметки лотка, фитинги, проверки расстояний.
- **Электрика**: розетки, выключатели, светильники, щит и группы; автотрасса по стенам, длины кабеля, автоматы и УЗО, проверки нагрузки и падения напряжения, правила для мокрых зон (ПУЭ, ГОСТ Р 50571).
- **Водопровод** лучевой: скважина или колодец, насос, фильтр, бойлер, коллекторы холодной и горячей воды, отдельная линия к каждому прибору, теплоизоляция и греющий кабель снаружи.
- **Водяной тёплый пол**: автораскладка петель по комнатам, краевые зоны, разрезка петель длиннее 80 м, теплоотдача против теплопотерь, расходы и балансировка, место коллектора.

**Смета**
- Количества считаются по плану и сетям, цены — из JSON-каталога, лист A4 для печати.
- Галочки «Куплено» с фактической ценой и датой, выгрузка CSV для Excel, корзина в Петровиче одной кнопкой.

**Хранение и доступ**
- План хранится на сервере в JSON; каждое сохранение — пронумерованная версия, плюс именованные снимки с восстановлением.
- Оптимистичная блокировка (`If-Match` / `409`): несколько вкладок и скрипты правят без потерь.
- Вход по одному паролю, файлы данных закрыты кукой, на телефоне — режим просмотра.

## Быстрый старт

### Docker

```bash
git clone https://github.com/egmalt/house-planner.git
cd house-planner
docker compose up -d --build
```

Откройте <http://localhost:8080/> и задайте пароль в мастере `/api/setup.php`. Без мастера — передать пароль при первом старте: `HOUSE_PASSWORD='длинный-пароль' docker compose up -d --build`. Порт задаёт `HOUSE_PORT` (по умолчанию `8080`). План, все версии и конфигурация лежат в томе `house-data` и переживают пересборку и перезапуск. `HOUSE_PASSWORD` применяется только к пустому хранилищу; чтобы потом сменить пароль, удалите `config.php` из тома (`docker compose exec house-planner rm /var/lib/house-planner/config.php`) и запустите снова с новым `HOUSE_PASSWORD` или через мастер. Резервные копии и HTTPS за обратным прокси — в [руководстве по установке](docs/guide/ru/install.md#docker).

### Режим разработки

Нужны Node.js 22 и PHP 8.1+. Два терминала:

```bash
npm i
npm run dev:api     # терминал 1: PHP API на 127.0.0.1:8000 прямо из public/
```

```bash
npm run dev         # терминал 2: Vite на http://localhost:5173 с горячей перезагрузкой
```

Откройте <http://localhost:5173/api/setup.php>, задайте пароль и работайте на <http://localhost:5173/>. Vite проксирует `/api`, `/data` и `/plans` на PHP-сервер, сборка не нужна. Хранилище — `$HOUSE_STORAGE`, если задан, иначе `./storage` в корне репозитория (в `.gitignore`). `scripts/dev-router.php` повторяет правила `.htaccess` для встроенного сервера PHP; он только для своей машины.

Подробнее — в [руководстве по установке](docs/guide/ru/install.md).

## Свой хостинг

Подойдёт любой виртуальный хостинг с **PHP 8.1+** (с расширением `curl` для корзины Петровича) и **Apache или LiteSpeed** с `mod_rewrite`. Ни базы данных, ни Node.js на сервере не нужно.

1. **Сборка** локально: `npm ci && npm run build`. Получается статическая папка `dist/` с PHP API в `dist/api/`.
2. **Заливка** содержимого `dist/` в корень сайта: `scripts/deploy.sh` (rsync по SSH или зеркало по FTP, настройки в `.env.deploy`, пример — [`.env.deploy.example`](.env.deploy.example)) или любой FTP-клиент.
3. **Мастер установки**: один раз откройте `https://ваш-сайт/api/setup.php`. Он выбирает место хранилища, спрашивает пароль (от 8 символов), пишет `storage/config.php` с хешем пароля и случайным токеном куки и закрывает этой кукой `data/` и `plans/`. Дальше мастер отвечает `403`. Переменная окружения `HOUSE_SETUP_KEY` заставит мастер спросить дополнительный ключ.
4. **Хранилище** ищется по порядку: `$HOUSE_STORAGE`, `<корень сайта>/../storage` (вне корня сайта, предпочтительно), `<корень сайта>/storage` (внутри, закрыто `.htaccess`). В нём `config.php`, `current.json`, все версии в `versions/` и снимки в `snapshots/`.
5. **HTTPS**: включите на хостинге (Let's Encrypt обычно одной кнопкой). Кука входа — `HttpOnly`, `SameSite=Lax`, на HTTPS автоматически получает `Secure`.

На nginx без Apache `.htaccess` не работает: закройте `/storage`, `/data` и `/plans` в конфигурации сервера. Пошагово, с обновлением и резервными копиями — в [руководстве по заливке](docs/guide/ru/deploy.md).

## Формат плана

План — один JSON-документ в целых миллиметрах: `site` (размер, граница, геопривязка, зоны), `materials`, `walls` (осевая линия `a → b`, толщина, высота, материал), `openings` (двери, окна, ворота со смещением вдоль стены), `furniture`, `rooms`, `estimate` и `networks` (`sewer`, `electric`, `water`, `heating`). Источник истины — zod-схема в [`src/model/schema.ts`](src/model/schema.ts); `npm run plan:validate` проверяет ею демо-план.

Полное описание: [docs/plan-format.md](docs/plan-format.md). HTTP API: [docs/api.md](docs/api.md).

## Работа с ИИ-ассистентом

План — обычный JSON со строгой схемой, поэтому его может править любой LLM-ассистент: «добавь стену 5 м из угла дома на восток», «окно 1200 по центру стены w2», «проведи раковину в санузле к стояку». Цикл:

```bash
scripts/plan-pull.sh                    # сервер → plans/server.json
# правка plans/server.json руками или ассистентом
node scripts/plan-validate.mts plans/server.json
scripts/plan-push.sh                    # → новая версия на сервере
```

`plan-push.sh` ходит в тот же API с версиями, что и браузер: если план за это время изменился, он сохраняет серверную копию в `*.conflict.json` и выходит с кодом `2`, ничего не перезаписывая. Открытые вкладки подхватывают новую версию сами. Руководство с промптом и подводными камнями — [правка плана через JSON](docs/guide/ru/plan-via-chat.md).

## Стек

React 19, TypeScript, Vite, Zustand + zundo (отмена), zod, Konva / react-konva (2D), three.js с React Three Fiber, drei и postprocessing (3D), three-bvh-csg (проёмы), clipper2 (смещение полигонов), MapLibre GL и proj4 (карта), PHP без фреймворка для API с хранением в файлах и `flock`.

## Планы

- Кровля: формы, уклоны, стропильная система и кровельные материалы в 3D и в смете.
- Фундамент: плита, лента, сваи — объёмы и арматура.
- Водопровод с расчётом напора и подбором насоса.
- Экспорт в PDF и DXF.
- Больше языков интерфейса: сейчас английский и русский, переводы приветствуются.

## Оговорки

- **Цены** в `public/data/catalog.json` — пример, собранный по магазинам Санкт-Петербурга на дату из поля `checkedAt` каждой позиции. Это не оферта, цены устаревают — заменяйте своими.
- **Нормы** (СП, ПУЭ, СанПиН, ГОСТ) используются как справочные проверки. Расчёты не заменяют проект, сделанный специалистом.
- Демо-план — вымышленный одноэтажный дом в северном стиле с гаражом на участке 30 × 45 м в Эстонии.

## Частые вопросы

Хостинг, пароль, резервные копии, обновление, свой участок, каталог, телефон, работа без интернета — в [FAQ](docs/guide/ru/faq.md). Повседневная работа в редакторе — в [руководстве пользователя](docs/guide/ru/usage.md).

## Участие

Задачи и пул-реквесты приветствуются. Сначала прочитайте [CONTRIBUTING.md](CONTRIBUTING.md); участвуя, вы соглашаетесь с [кодексом поведения](CODE_OF_CONDUCT.md). Об уязвимостях — [SECURITY.md](SECURITY.md). Изменения — [CHANGELOG.md](CHANGELOG.md).

## Авторы

House Planner делает и поддерживает команда [homedesignsai.pro](https://homedesignsai.pro). Связь: [hello@homedesignsai.pro](mailto:hello@homedesignsai.pro).

## Лицензия

[MIT](LICENSE). У сторонних текстур и моделей мебели свои лицензии — см. `public/textures/LICENSE.txt` и `public/models/furniture/LICENSES.md`.
