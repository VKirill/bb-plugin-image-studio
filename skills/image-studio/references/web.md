# Web section (site graphics)

Tool `image_studio_web` / `bb image-studio web generate --mode … --prompt "…"` (in a hidden thread). Runs at once, no Send form, always Muse Image on fal.ai. One project per site: the folder of the thread names the site, created on first use. Pass `project` only for another site (`bb image-studio web projects`).

Use it for website graphics: page and section mockups, logo, favicon set, og share card, hero and cover pictures, spot illustrations, icon series, backgrounds, seamless patterns. Not `image_studio_generate`, not `image_studio_gui` (that is for game interfaces). **No SVG yet**: every file is a PNG (plus `favicon.ico` and `site.webmanifest`).

Do not describe the style in `prompt`: the plugin adds the site's theme, style presets, palette, notes and approved references. Say what the picture shows. Text appears only when the request quotes it (`"Acme"`).

## Modes

Files land in `image-studio/web/<site>/<group>/<job>/`.

| group | mode | prompt | writes |
|---|---|---|---|
| concepts | `ideas` | the site / page idea | 4 landing-page directions, each `mockup.png` 1536×1024 (no fixed style: 4 different presets; else 4 takes in the style) |
| concepts | `page` | what the page holds | `page.png`, a long page, longest side ≤ 2048 |
| concepts | `mobile` | the phone screen | `mobile.png` 1080×1920 |
| concepts | `block` | one section (hero, pricing, features, testimonials, footer) | `block.png` 1920×1080 |
| brand | `logo` | the name in quotes | `logo.png`, transparent, longest side ≤ 1024 |
| brand | `favicon` | the mark | favicon set (below) |
| brand | `og` | the card; text only if quoted | `og.png` 1200×630 |
| graphics | `hero` | first-screen image (calm area left for a headline) | `hero.png` 1920×1080 |
| graphics | `cover` | article / blog cover | `cover.png` 1600×900 |
| graphics | `illustrations` | list, at most 6, one per line or `;` ("empty state: no posts; 404: lost astronaut") | `parts/<slug>.png`, transparent, one per entry |
| graphics | `icons` | list, at most 16 | `parts/<slug>.png`, transparent squares (256; 512 for 6 or fewer) |
| graphics | `background` | abstract, low contrast, no text | `background.png` 1920×1080 |
| graphics | `pattern` | the motif | `pattern.png` 1024×1024, seamless tile |

`variants` 1–4 draws takes of one request for every mode except `ideas`, `illustrations` and `icons` (`ideas` always draws four directions).

## Favicon set

Mode `favicon` writes: `favicon.ico` (16/32/48), `favicon-16.png`, `favicon-32.png`, `icon-192.png`, `icon-512.png` (transparent), `apple-touch-icon.png` 180 and `icon-maskable-512.png` (opaque, filled with the site's first palette colour, white without a palette; the mark sits in the central 80%), and `site.webmanifest` (name, icons 192, 512 and maskable 512).

## manifest.json

Every job folder gets `manifest.json`: `{ "section": "web", "mode", "site", "files": [{ "file", "width", "height", "place", "html" }] }`. `place` is where the file goes in a site (`public/favicon.ico`, `public/og.png`, `public/img/<slug>.png` for parts); `html` (when there is one) is the tag that shows it, e.g. `<link rel="icon" href="/favicon.ico" sizes="32x32">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`, `<link rel="manifest" href="/site.webmanifest">`, `<meta property="og:image" content="/og.png">`, `<img src="/hero.png">`. To put the files into a site: read `manifest.json`, copy each `file` to its `place`, add the `html` tags to the page head or markup. Report the finished files and the manifest.

## Site style

Set once per site: `bb image-studio web project --theme "…" --tags minimal|corporate|playful|editorial|brutalist|dark-tech|luxury|flat-illustration|clay-3d --palette background=#0A0A12,accent=#7C5CFF --notes "…"`. Approved art becomes a reference for every later prompt: `bb image-studio web ref --image <path or gallery id>`. List sites: `bb image-studio web projects`; remove: `bb image-studio web delete`.

## CLI

`bb image-studio web generate --mode ideas|page|mobile|block|logo|favicon|og|hero|cover|illustrations|icons|background|pattern --prompt "…" [--variants 1-4] [--json]`
