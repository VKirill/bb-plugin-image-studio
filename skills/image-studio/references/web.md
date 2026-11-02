# Web section (site graphics)

Tool `image_studio_web` / `bb image-studio web generate --mode … --prompt "…"` (in a hidden thread). Runs at once, no Send form, always Muse Image on fal.ai. One project per site: the folder of the thread names the site, created on first use. Pass `project` only for another site (`bb image-studio web projects`).

Use it for website graphics: page and section mockups, logo, favicon set, og share card, hero and cover pictures, spot illustrations, icon series, backgrounds, seamless patterns. Not `image_studio_generate`, not `image_studio_gui` (that is for game interfaces). **No SVG yet**: every file is a PNG (plus `favicon.ico` and `site.webmanifest`).

Do not describe the style in `prompt`: the plugin adds the site's theme, style presets, palette, notes and approved references. Say what the picture shows. Text appears only when the request quotes it (`"Acme"`).

Prompt rules after the 0.10.3 tuning (from the real Muse acceptance run):

- Layout modes (`ideas`, `page`, `mobile`, `block`, `og`) get theme + presets + palette. Mockups are drawn as flat 2D screenshots edge to edge — the page background reaches all four edges, no card, no browser chrome, no device frame — with the site's own display name as the brand wordmark. `mobile` adds a status bar with 9:41.
- Picture modes (`hero`, `cover`, `background`, `pattern`, `illustrations`, `icons`, `logo`, `favicon`) get theme + colours only — the palette as plain hex colours, never labelled words, and no layout-preset sentences (grids, fonts, margins would put interface into a photo). `hero` keeps its left 40% calm and even for a headline; `cover` writes no text unless the request quotes it; `background` is an even low-contrast tone under the site's text colour; `pattern` keeps motifs inside the tile with a plain margin at the edges.
- The four `ideas` differ by layout type: a split hero with an image on the right, a centered hero over a full-bleed photo, an editorial layout with a big serif headline and asymmetric columns, a layout led by a product grid. With a fixed style the four takes keep it and still differ by layout.
- Two or more style presets are written as one direction: "a blend of A and B; where they disagree, follow the site theme".
- fal transient failures (503, `downstream_service_unavailable`, a finished request without an image URL) are retried twice before the job fails.

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

Mode `favicon` keys the green out of the Muse picture and trims the mark, then writes: `favicon.ico` (16/32/48), `favicon-16.png`, `favicon-32.png`, `icon-192.png`, `icon-512.png` (transparent), `apple-touch-icon.png` 180 and `icon-maskable-512.png` (opaque, filled with the palette's `button` colour — `highlight` when there is no button, white when the palette is empty; the mark sits in the central 80%), and `site.webmanifest` (the site's display name, a `short_name` of at most 12 characters, `theme_color` = the fill, `background_color` = the palette background or white, icons 192, 512 and maskable 512).

## manifest.json

Every job folder gets `manifest.json`: `{ "section": "web", "mode", "site", "files": [{ "file", "width", "height", "place", "html", "note" }] }`. `place` is where the file goes in a site (`public/favicon.ico`, `public/og.png`, `public/img/<slug>.png` for parts); concept mockups (`ideas`, `page`, `mobile`, `block`) get `place: null` with `note: "design reference, not a site asset"` — they are not copied into a site. `html` (when there is one) is the tag that shows it, e.g. `<link rel="icon" href="/favicon.ico" sizes="32x32">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`, `<link rel="manifest" href="/site.webmanifest">`, `<img src="/hero.png" alt="" width="1920" height="1080">`. The og tag is `<meta property="og:image" content="https://YOUR-DOMAIN/og.png">` — og:image needs an absolute URL, so replace YOUR-DOMAIN with the site's domain (the `note` says so). To put the files into a site: read `manifest.json`, copy each `file` with a `place` to it, add the `html` tags to the page head or markup. Report the finished files and the manifest.

## Site style

Set once per site: `bb image-studio web project --theme "…" --tags minimal|corporate|playful|editorial|brutalist|dark-tech|luxury|flat-illustration|clay-3d --palette background=#0A0A12,accent=#7C5CFF --notes "…"`. Palette keys: `background`, `button`, `outline`, `highlight`, `text`; `accent` is an alias of `highlight`. Approved art becomes a reference for every later prompt: `bb image-studio web ref --image <path or gallery id>`. List sites: `bb image-studio web projects`; remove: `bb image-studio web delete`.

## CLI

`bb image-studio web generate --mode ideas|page|mobile|block|logo|favicon|og|hero|cover|illustrations|icons|background|pattern --prompt "…" [--variants 1-4] [--json]`
