# Общий дизайн: токены и примитивы

Весь интерфейс (план, 3D, карта, смета, «Участок и дом») собирается из одних токенов и одних примитивов. Своих цветов, теней, радиусов и своих кнопок в разделах не заводим: нужен новый вариант — добавляем его в примитив или токен, а не копию в своём CSS. CSS пишется без комментариев.

## Токены — `src/styles/tokens.css`

Подключены глобально в `src/main.tsx` (вместе с `src/styles/ui.css`), в разделах импортировать не нужно, просто пользоваться `var(--…)`.

| группа | переменные |
|---|---|
| фон и поверхности | `--bg` (фон приложения), `--surface` (карточки), `--surface-2` (ховер), `--surface-3` (подложка сегментов) |
| текст | `--ink`, `--ink-2`, `--muted` |
| линии | `--line`, `--line-strong` |
| акцент | `--accent`, `--accent-hover`, `--accent-soft`, `--accent-ink` |
| статусы | `--ok`/`--ok-soft`, `--warn`/`--warn-soft`, `--danger`/`--danger-soft` |
| радиусы | `--radius-xs` 6, `--radius-sm` 9, `--radius` 12, `--radius-lg` 16, `--radius-pill` |
| тени | `--shadow-sm`, `--shadow`, `--shadow-lg` |
| отступы | `--space-1`…`--space-6` = 4, 8, 12, 16, 24, 32 |
| шрифт | `--font`, `--font-mono`, `--text-xs` 11, `--text-sm` 12.5, `--text-md` 14, `--text-lg` 17, `--text-xl` 22 |
| контролы | `--control-h-sm` 28, `--control-h` 32, `--control-h-lg` 38 |
| раскладка | `--header-h` 52 (шапка), `--header-top`, `--chrome-top` (верх для плавающих панелей под шапкой), `--chrome-left`, `--z-chrome`, `--z-popover` |

Тема одна, светлая. Шапка приложения плавающая: полноэкранный раздел (3D, карта) рисует холст на всю вкладку, а свои панели ставит не выше `var(--chrome-top)`.

## Примитивы — `src/ui/`

Импорт из `src/ui` (barrel `src/ui/index.ts`): `import { Button, Panel, Table, Th, Td } from '../ui'`.

| компонент | пропсы | для чего |
|---|---|---|
| `Button` | `variant: default \| primary \| ghost \| danger`, `size: sm \| md`, `pressed`, `icon`, остальное как у `<button>` | любые кнопки; `primary` — одна главная на экран |
| `IconButton` | `label` (обязателен, идёт в title/aria-label), `active`, `size`, children — svg | иконочные кнопки на тулбарах |
| `Segmented` | `options: {value,label,href?,title?}[]`, `value`, `onChange`, `size` | переключатели режимов; с `href` — ссылки (так сделаны вкладки шапки) |
| `Card` | `padded` (по умолчанию true), `ref` | белая карточка с тенью |
| `Panel` | `title`, `eyebrow`, `actions`, `footer`, `ref` | карточка с шапкой и прокручиваемым телом |
| `Badge` | `tone: neutral \| accent \| ok \| warn \| danger` | статусы и счётчики |
| `Input` | `label`, `suffix` (ед. изм.), `size`, `invalid`, `ref`, остальное как у `<input>` | поля ввода и числа |
| `Checkbox` | `label`, `checked`, `onChange(checked: boolean)` | галочки (куплено и т. п.) |
| `Table`, `Th`, `Td`, `Tr` | `Table dense`, `Th/Td num` (числа вправо, моноширинные цифры), `Tr muted` | таблицы; шапка липкая |
| `CanvasToolbar`, `ToolbarSeparator` | `placement: top-left \| top-right \| top-center \| bottom-*`, `direction: row \| column` | плавающий тулбар поверх холста/3D/карты, сам встаёт под шапку |
| `Menu`, `MenuItem`, `MenuSection` | `Menu trigger={({open,toggle}) => …} width align`, children — узлы или `(close) => узлы`; `MenuItem hint`; `MenuSection title` | выпадающие меню (так сделано «⋯» в шапке) |
| `cx` | `cx('a', cond && 'b')` | склейка классов |

Служебные классы из `ui.css`: `.eyebrow` (мелкий заголовок капсом), `.muted` (серый текст), `.num` (число вправо).

## Навигация

Разделы переключаются только в шапке, адрес раздела — hash: `#/plan`, `#/3d`, `#/map`, `#/estimate`, `#/info`. Список — `src/ui/useSection.ts`. Раздел монтируется лениво из `src/<раздел>/index.tsx` (default export) и получает `plan` из стора, редактируемые разделы ещё `onChange(nextPlan)` — это та же запись, что и в редакторе: с отменой (⌘Z) и автосохранением на сервер. Экспорт/импорт JSON, сброс к исходному и версии — в меню «⋯» справа в шапке.
