# Библиотека мебели

Типовые предметы интерьера для плана: каталог с реальными размерами, архитектурные символы для 2D (react-konva), иконки для панели (SVG) и 3D-модели (r3f). Единицы — мм, `x/y` — центр предмета, ось Y вниз, `rotationDeg` по часовой на плане. Локальная система предмета: ширина `w` по X, глубина `d` по Y, **задняя сторона (к стене) — `-d/2`, фронт — `+d/2`**. В 3D фронт смотрит в `+z`, поворот `rotation.y = -rotationDeg`.

## API

`FURNITURE_CATALOG`, `FURNITURE_CATEGORIES`, `furnitureDef(type)`, `resolveFurniture(item)` → `{ def, w, d, h, elevation }` (размеры item перекрывают каталожные). `createFurniture(type, x, y, id, rotationDeg?)`.

`<FurnitureSymbol2D item selected? showClearance? ghost? {...groupProps} />` — Konva `Group` в мм-координатах плана, линии не масштабируются (`strokeScaleEnabled=false`). При `selected` рисуется рамка и зона подхода `clearance`. Остальные пропсы (`onMouseDown`, `draggable`, `listening`, `name`…) уходят в `Group`.

`<FurnitureIcon type size? />` — SVG-иконка из того же символа.

`<FurnitureModel item look?="real|model" baseY? placed? modelsBase? castShadow? />` — сама ставит себя в `x/y/rotation` (метры, `M = 0.001`). Если позиционирует вызывающий — `placed={false}`, тогда применяется только подъём `elevation` (навесные шкафы, бойлер, настенный котёл). Внутри `Suspense` не нужен: GLB грузятся со своим заглушечным боксом. `preloadFurnitureModels()` — предзагрузка всех GLB.

## Как добавить предмет

Строка в `FURNITURE_CATALOG` (`catalog.ts`): `type`, русское имя, категория, `[w, d, h]`, опции `resizable`, `clearance { front, side }`, `elevation`.

2D-символ — функция в `symbols.ts`, возвращающая массив примитивов (`rect`, `circle`, `ellipse`, `line`, `path` в SVG-синтаксисе, `group` с поворотом) в локальных мм с центром в нуле, и ветка в `furnitureSymbol`. Стили: `s: 'main' | 'thin'`, `f: 'paper' | 'tone' | 'dark' | 'water' | 'none'`, `dash` — для того, что выше секущей плоскости. Один символ сразу работает и в Konva, и в иконке.

3D — либо GLB: положить файл в `public/models/furniture/`, строка в `KENNEY_MODELS` (`models.ts`) с `rotY`, если фронт модели не в `+z`, и `primary` — какие отделки перекрашивает `item.color`. Модель автоматически вписывается в `w×h×d` по габаритному боксу, материалы по имени меняются на палитру проекта (`materials3d.ts`, режимы «Макет»/«Материалы»). Либо процедурно: компонент в `procedural.tsx` из `Box`/`Cyl` (скругления через drei `RoundedBox`), имя в `PROCEDURAL` и ветка в `ProceduralFurniture`. Лицензию нового GLB дописать в `public/models/furniture/LICENSES.md`.

## Стенд

`npx vite --config prototypes/furniture/vite.config.ts` → http://localhost:5188. Параметры: `?view=2d|icons|3d`, `look=model`, `cat=kitchen`, `only=bed-1600,toilet`, `cols`, `zoom`, `scale`, `sel=<type>` (выделение с зоной подхода), `top=1` (3D сверху), `walls=1`. Снимки — `prototypes/furniture/shots/`.
