# Roblox section

One **game** per folder: generations from a Roblox game's folder go to its game (created on first use, named after the folder). The game holds the shared look — theme, art style presets (`simulator`, `stylized`, `lowpoly`, `realistic`, `anime`, `horror`, `cartoon`, `voxel`), extra rules and up to six approved art pictures (icon, thumbnail, key art). The plugin adds them to every prompt: do not describe the style yourself.

The game's **GUI** and **Characters** are its own linked projects: `image_studio_gui` and `image_studio_character` called from the game's folder write into them, and they inherit the game's theme, art style and approved art (as palette and finish). The GUI and Characters projects made before games existed were moved into games, one game per folder.

## Tool

`image_studio_roblox` (or `bb image-studio roblox generate --mode … --prompt "…"` in a hidden thread). Runs at once, no Send form, always Muse Image on fal.ai.

| mode | prompt | result in `image-studio/roblox/<game>/<tab>/<id>-<label>/` |
|---|---|---|
| `icon` | what the icon shows | `icon.png` 512×512 |
| `thumbnail` | the scene | `thumbnail.png` 1920×1080 |
| `logo` | the name in quotes, optional emblem | `logo.png` transparent, ≤1024 |
| `badges` | list: `First kill; Survived 10 nights` | `parts/*.png` 512×512, round medallions (Roblox crops badges to a circle) |
| `passes` | list: `VIP; 2x Coins; Speed` | `parts/*.png` 512×512, round-safe |
| `products` | list: `100 coins; 1000 coins; Revive` | `parts/*.png` 512×512, transparent |
| `items` | list (≤16): `wood log; iron ore; gold coin` | `parts/*.png` 256×256, transparent |
| `props` | list (≤6): `wooden crate; street lamp; watchtower` | `parts/*.png` on white: image-to-3D inputs |
| `texture` | the surface: `mossy cobblestone` | `color.png` (made seamless) + `normal.png`, 1024 |
| `skybox` | the sky: `red sunset over a misty forest` | `SkyboxFt/Rt/Bk/Lf/Up/Dn.png` 1024 |
| `decal` | the picture; `aspect` 1:1, 16:9, 9:16, 4:3, 3:4, 2:1 | `decal.png` ≤1024 |
| `vfx` | list (≤9): `spark; smoke puff; magic ring` | `parts/*.png` 256×256, glow on transparent |
| `flipbook` | one looping effect; `frames` 4 or 16 | `flipbook.png` 1024, Grid2x2 / Grid4x4 |

Tabs (folders): `store` (icon, thumbnail, logo), `monetization`, `items`, `props`, `world` (texture, skybox, decal), `vfx`; the game's GUI and Characters go to `gui/` and `characters/` beside them.

`variants` (1–4) draws several takes of the single-picture modes. Every folder has the original `source.png` / `sheet.png` and `manifest.json` with each file's size and where it goes in Roblox (Creator Dashboard page, `Sky.SkyboxFt`, `SurfaceAppearance.NormalMap`, `FlipbookLayout`…). Report the files and the manifest.

Text: only what the prompt gives in quotes is written (titles on icons and thumbnails, a pass label); item icons, badges, textures and effects have no text.

Skybox: Muse draws a 4:1 horizon; the plugin tiles it, splits it into the four sides (turning right: Ft → Rt → Bk → Lf) and fades the top and bottom into one sky and one ground colour, which are the Up and Dn faces — so the seams match whichever way Roblox turns Up and Dn. Look at it in Studio once; the horizon band is the strong part.

Look of the game: `bb image-studio roblox project --theme "…" --tags simulator,cartoon --notes "…"`; approved art as a reference: `bb image-studio roblox ref --image <path or gallery id>`; list: `bb image-studio roblox projects`.
