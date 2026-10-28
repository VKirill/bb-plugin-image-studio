---
title: Image Studio — «предмет» (item) в разделе «Текстура по модели»
date: 2026-10-28
source: запрос Кирилла через тред LAVA BONK (thr_vgdyg342s5)
status: implemented 2026-10-28 (accepted Lane Pilot tasks shipped; runtime acceptance pending)
depends_on: 0.8.16 (model-guide-fix2, model-blueprint-nb21)
---

# План: предмет (item) как единица конвейера

> [!NOTE]
> Сейчас каждый запуск — отдельная папка (`model/<проект>/<run>/`), и концепт, чертёж, модель, болванка и текстуры одного предмета ничем не связаны. Предмет связывает их и позволяет агенту продолжить с любого шага.

## Устройство

**Где живёт предмет.** Источник правды — файл `image-studio/model/<проект>/items/<item>/item.json` в папке игры (агент читает его без плагина). В KV плагина — только индекс предметов проекта (id, имя, статусы шагов, миниатюры) для быстрой панели. При расхождении побеждает `item.json`.

**Файлы.** Новые запуски с `--item` пишутся в `items/<item>/<шаг>-<run>/`. Старые запуски и внешние файлы **не переносятся**, а прикрепляются ссылкой: старые записи дублей ссылаются на свои пути, и перенос их сломал бы.

**Шаги** (по порядку): `concept → blueprint → model → uv-guide → texture → preview → export`.
У каждого шага: статус (`—` пусто / `…` в работе / `✓` готово), список записей (запуск или файл: пути, промпт, модель, шлюз, цена, время, источник `generated|attached`) и выбранная запись (`selected`, `selectedBy`: агент, пользователь в панели или CLI).

```text
items/plunger-scepter/item.json
{ id, name, project, gameId, createdAt, updatedAt,
  steps: { concept: {status, selected, selectedBy, entries:[…]}, blueprint: {…}, model: {…},
           "uv-guide": {…}, texture: {…}, preview: {…}, export: {…} } }
```

Цена за картинку — из небольшой таблицы в коде (известно: Muse/fal $0.01, nano-banana-2.1/kie 1K $0.02), неизвестное — `null`.

## Интерфейс

- **CLI:** `bb image-studio model item create|list|show|attach|select|export`:
  - `attach --item <id> --step model --file assets/3d/x.fbx`;
  - `attach --step concept --image <путь|id галереи>`;
  - `select --step texture --take <id>`.
- **`--item <id>`** у `model generate` (texture-uv, blueprint): создаёт предмет, если его нет, и пишет результат в нужный шаг. Без `--item` всё работает как сейчас.
- **Инструмент агента `image_studio_item`:** `action: create|show|attach|select|export`. У `image_studio_model` появляется параметр `item`.
- **Связь шагов:** texture-uv с `item` сам берёт модель из шага `model`, а концепт — из `concept`, если они не переданы. Blueprint берёт концепт так же.
- **Export:** выбранный дубль превращается в файлы под движок:
  - `color.png` и `normal.png` (из цвета, как в режиме roblox texture);
  - модель с назначенным материалом (Blender `export`: FBX с текстурой);
  - `export.json` с назначением для Roblox (SurfaceAppearance ColorMap/NormalMap или MeshPart TextureID).

## Панель

- В разделе «Текстура по модели» — подвкладка **«Предметы»**: список карточек. В карточке лента миниатюр шагов слева направо со статусом ✓/…/—, у текстуры отмечен выбранный дубль. Выбрать дубль можно кликом.
- В общей галерее картинки предмета (листы чертежа, ответы Muse) помечены значком с id предмета. Клик ведёт в карточку: у записи галереи появляется поле `itemId`.

## Задачи

| id | что | зависит |
|---|---|---|
| item-core | `src/item.ts` (схема, чтение/запись `item.json` на хосте, индекс KV), CLI `model item …`, инструмент `image_studio_item`, `--item`/`item` у generate, подстановка модели и концепта из шагов, `selected`, `itemId` в галерее, таблица цен; тесты на схему, attach/select, запись шага при generate | — |
| item-export | шаг export: Blender `export` (FBX с материалом), `normal.png`, `export.json` | item-core |
| item-panel | подвкладка «Предметы», карточка с лентой шагов, выбор дубля, значок в галерее | item-core |
| item-skill | скилл: конвейер предмета через item (концепт → чертёж → модель в Blender → развёртка → текстура → экспорт), примеры CLI и инструмента | item-core |

Проверки по задачам: `npx tsc --noEmit`, `node --test --experimental-strip-types tests/*.test.ts`. Сборку `bb plugin build` делает PM перед выпуском.

## Приёмка

1. Предмет `plunger-scepter` в lava-arena собирается **из уже готовых файлов** без генераций:
   - concept: `assets/concept/weapons/plunger-scepter.png`;
   - blueprint: `image-studio/model/lava-arena/255ac411`;
   - model: `assets/3d/plunger-scepter/plunger-scepter_untextured.fbx`;
   - uv-guide и texture: `2f72e94f`, выбранный дубль;
   - preview, затем export.
2. `item.json` показывает все шаги ✓. Агент без контекста по `item show` понимает, с какого шага продолжать.
3. В панели карточка показывает ленту шагов, выбранный дубль отмечен, значок в галерее ведёт в карточку.
4. Повторный texture-uv с `--item plunger-scepter` без `--file` берёт модель и концепт из предмета.

## Решения (одобрено 2026-10-28)

- **Export:** FBX без вшитых текстур плюс отдельные PNG-карты (`color`, `normal`; `roughness`/`metal`, если есть), а также `.blend` как исходник. Масштаб FBX — настройка проекта `fbxScale`, по умолчанию `0.01` для Roblox (`global_scale 0.01`: Roblox читает сантиметры FBX как studs). `export.json`: пути файлов, масштаб, куда что в Roblox (MeshPart + SurfaceAppearance.ColorMap/NormalMap/RoughnessMap/MetalnessMap).
- **Concept:** только прикрепление — файлом или id из галереи разделов roblox/character.

## Status (2026-10-28)
| task | version | status | run |
|---|---|---|---|
| item-core | 0.9.0 | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| item-export | 0.9.1 | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| item-panel | 0.9.2 | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| item-fixes | 0.9.3 | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| item-skill | — | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |

Acceptance items 1–4 above are not yet run: the plunger-scepter item has not been assembled from the existing files on the host, and the panel and gallery badge have not been checked in BB.

## History
### 2026-10-28
- Accepted Lane Pilot run `lprun_7ab1f614e5bf4e9cac43bc49529371b0` completed item-core, item-export, item-panel, item-fixes and item-skill. The item-fixes repair path is `item detach` followed by `item select`; the skill's troubleshooting lines describe it.
