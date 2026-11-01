---
title: Image Studio — Web section (site graphics through Muse)
date: 2026-11-01
source: owner request in thread thr_7qsw7g5jw5 («сделаем новый раздел… через мьюз… пока без svg»)
status: dispatched
---

# Plan: Web section

> [!NOTE]
> A fifth section next to GUI, Characters, Roblox and Model: graphics for websites. Built like the Roblox section:
> one project per site folder, a mode per asset kind, every picture drawn by **Muse Image** and then fitted to what a
> site takes (exact sizes, transparent cut-outs, favicon set, manifest of where each file goes). **No SVG yet.**
> Code lives in the plugin repo root (`bb-plugin-image-studio/`), one level above this checkout.

## Modes

| group (folder) | mode | deliverable |
|---|---|---|
| concepts | `ideas` | 4 landing-page directions (desktop mockup); nothing fixed → 4 presets, else 4 takes in the style |
| concepts | `page` | one page mockup in the fixed style (sections stacked, long page) |
| concepts | `mobile` | one phone screen mockup (9:16) |
| concepts | `block` | one section mockup (hero, pricing, features, testimonials, footer…) at desktop width |
| brand | `logo` | transparent logo (green key → `logo.png`, max 1024) |
| brand | `favicon` | square mark → `favicon.ico` (16/32/48), `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` 180 opaque, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (mark in the 80% safe zone, opaque) |
| brand | `og` | social share card `og.png` 1200×630; text only when the request quotes it |
| graphics | `hero` | first-screen image with a calm area for the headline, `hero.png` 1920×1080 |
| graphics | `cover` | article/blog cover `cover.png` 1600×900 |
| graphics | `illustrations` | list ≤ 6: spot illustrations (empty state, 404, success…) on one sheet, cut into transparent PNGs |
| graphics | `icons` | list ≤ 16: feature icons of one series, cut into transparent square PNGs |
| graphics | `background` | section background, abstract, low contrast, no text, `background.png` 1920×1080 |
| graphics | `pattern` | seamless tile `pattern.png` 1024 |

Each job folder gets `manifest.json`: per file its size and where it goes on a site
(`public/favicon.ico` + `<link rel="icon">`, `<meta property="og:image">`, `site.webmanifest` icons…).

Style presets (chips): minimal, corporate, playful, editorial, brutalist, dark-tech, luxury, flat-illustration, clay-3d.
The palette, theme, notes and approved references of the project go into every prompt (same mechanism as GUI/Roblox).

## Tasks

| id | what | depends |
|---|---|---|
| web-core | `src/web.ts` (modes, presets, job prompts, outputs), favicon/ICO raster, `server.ts`: section `web`, CLI `bb image-studio web …`, agent tool `image_studio_web`, files under `image-studio/web/<site>/<group>/`; `tests/web.test.ts` | — |
| web-panel | panel tab «Сайты» with group tabs, mode hints, project settings (theme, chips, palette, refs), i18n en/ru | web-core |
| web-skill | `skills/image-studio/references/web.md`, SKILL.md routing, PLUGIN_OVERVIEW.md line | web-core |

After ship: PM runs real Muse generations of every mode on a test site project, looks at them, and dispatches a
prompt-tuning task (`web-prompts`) with the findings.

## Later (not now)
- SVG (vtracer / Recraft) for logo and icons.
- Reading the style from the site itself (DESIGN.md, tailwind config, CSS variables).
- Device mockups with a real screenshot, ad banner sizes.

## Steps (writer contract detail)

### web-core
1. `src/web.ts`, shaped like `src/roblox.ts`: `WEB_MODEL = "muse-image"`, `WEB_MODES`, `WEB_CATEGORIES = ["concepts","brand","graphics"]`, `MODE_CATEGORY`, `LIST_MODES = ["illustrations","icons"]`, `MAX_LIST = { illustrations: 6, icons: 16 }`, `VARIANT_MODES` (every non-list mode except `ideas`), `MAX_VARIANTS = 4`, `WEB_PRESETS` (minimal, corporate, playful, editorial, brutalist, dark-tech, luxury, flat-illustration, clay-3d; one style line each), `WebOutput`, `WebJob`, `WebRequest`, `webJobs(request, site)`. Reuse `quoted`, `parseList`, `gameLines`-style site lines (theme, palette, notes, presets, refs) from `src/roblox.ts`/`src/gui.ts`; do not copy Roblox rules (no Roblox avatars, no moderation lines about Roblox).
2. Outputs per mode (aspect sent to Muse → file written):

| mode | aspect | output |
|---|---|---|
| ideas | 3:2 | 4 takes, each `mockup.png` cover 1536×1024; no fixed style → 4 different presets, else 4 takes in the style |
| page | 9:16 | `page.png`, longest side ≤ 2048 (limit), opaque |
| mobile | 9:16 | `mobile.png` cover 1080×1920 |
| block | 16:9 | `block.png` cover 1920×1080 |
| logo | 16:9 on green key | `logo.png` transparent, longest side ≤ 1024 |
| favicon | 1:1 on green key | set below |
| og | 16:9 | `og.png` cover 1200×630 |
| hero | 16:9 | `hero.png` cover 1920×1080, calm area for a headline |
| cover | 16:9 | `cover.png` cover 1600×900 |
| illustrations | sheet, green key | `parts/<slug>.png` transparent, one per list entry, ≤ 6 |
| icons | sheet, green key | `parts/<slug>.png` transparent square 256 (≤ 6 → 512), one per list entry, ≤ 16 |
| background | 16:9 | `background.png` cover 1920×1080, no text |
| pattern | 1:1 | `pattern.png` 1024×1024 through `seamless()` |

3. Favicon set (new `WebOutput` kind `favicon`): cut the mark from the green key, trim, then
   - transparent: `favicon-16.png`, `favicon-32.png`, `icon-192.png`, `icon-512.png` (fitSquare, margin 0.06);
   - `favicon.ico`: PNG-in-ICO with 16, 32, 48 entries. Layout: ICONDIR 6 bytes (reserved 0, type 1, count 3, little-endian u16) + 3 × ICONDIRENTRY 16 bytes (width u8, height u8, colorCount 0, reserved 0, planes u16 1, bitCount u16 32, bytesInRes u32, imageOffset u32) + the PNG blobs in the same order. Encoder `encodeIco(pngs: {size, png}[]): Buffer` in `src/image-io.ts`;
   - opaque: `apple-touch-icon.png` 180 (mark at 80% of the side) and `icon-maskable-512.png` (mark inside the central 80%, i.e. fitted to 409 px box), filled with the project's first palette colour, white when there is no palette;
   - `site.webmanifest` with icons 192, 512 and the maskable 512 (`purpose: "maskable"`).
4. `manifest.json` in every job folder: `{ section: "web", mode, site, files: [{ file, width, height, place, html? }] }`, `place` = where it goes on a site (`public/favicon.ico`, `public/og.png`…), `html` = the tag (`<link rel="icon" href="/favicon.ico" sizes="32x32">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`, `<link rel="manifest" href="/site.webmanifest">`, `<meta property="og:image" content="/og.png">`, `<img src="/hero.png">`…). Export `webManifest(job, files)` from `src/web.ts` so tests can check it.
5. `server.ts`: section `web` next to gui/characters/roblox/model (`sectionSchema`, `SECTION_WORD`, mode lists, presets, project creation from the thread folder named after the folder), files under `image-studio/web/<site>/<category>/<job>/`, the output kinds above in the same place Roblox outputs are written, CLI `bb image-studio web projects|project|ref|generate|delete` through `runGuiCommand(..., "web")`, help lines, agent tool `image_studio_web` (prompt, mode, variants, project) with a description like `image_studio_roblox`.
6. `tests/web.test.ts`: every mode gives jobs with the aspect and output above; list limits; ideas presets rule; `encodeIco` header bytes and entry sizes/offsets; favicon set sizes and opacity (corners of apple-touch and maskable are alpha 255, the mark bbox of maskable lies inside the central 80%); `webManifest` places and html; server source registers `image_studio_web` and the `web` CLI.
7. `package.json` version 0.10.0. UI files only if `tsc` forces a type fix for the new section value.

### web-panel
Tab «Сайты»/«Websites» like the Roblox tab (`app.tsx` + new `web-panel.tsx`): group tabs concepts/brand/graphics with their modes, a hint per mode, list field for illustrations/icons, variants for single modes, the gallery of the site's jobs, project settings (theme, preset chips, palette, refs). Strings in `i18n.ts` en/ru. `tests/web-panel.test.ts`: every web mode and group has en and ru label and hint; the tab is registered next to Roblox; the generate call sends section `web`. Version 0.10.1.

### web-skill
`skills/image-studio/references/web.md`: every mode, its files and sizes, manifest.json, project style commands, CLI, no SVG yet. `SKILL.md`: route website graphics to `image_studio_web` (one short line; front-matter description length unchanged). `PLUGIN_OVERVIEW.md`: one line. Check: `tests/skill-frontmatter.test.ts`.
