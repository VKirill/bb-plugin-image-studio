# Roblox section

One **game** per folder: generations from a Roblox game's folder go to its game (created on first use, named after the folder). The game holds the shared look — theme, art style presets (`simulator`, `stylized`, `lowpoly`, `realistic`, `anime`, `horror`, `cartoon`, `voxel`), extra rules and up to six approved art pictures (icon, thumbnail, key art). The plugin adds them to every prompt: do not describe the style yourself.

The game's **GUI** and **Characters** are its own linked projects: `image_studio_gui` and `image_studio_character` called from the game's folder write into them, and they inherit the game's theme, art style and approved art (as palette and finish). The GUI and Characters projects made before games existed were moved into games, one game per folder.

## Tool

`image_studio_roblox` (or `bb image-studio roblox generate --mode … --prompt "…"` in a hidden thread). Runs at once, no Send form, always Muse Image on fal.ai.

| mode | prompt | result in `image-studio/roblox/<game>/<tab>/<id>-<label>/` |
|---|---|---|
| `icon` | what the icon shows | `icon.png` 512×512 |
| `thumbnail` | the scene; `variants` 3–4 makes a set (hero close-up, gameplay, reward, social) | `thumbnail.png` 1920×1080 |
| `logo` | the name in quotes, optional emblem (else the game's name) | `logo.png` transparent, ≤1024 |
| `loading` | optional scene | `loading.png` 1920×1080, calm centre and bottom for the logo and bar |
| `badges` | list: `First kill; Survived 10 nights` | `parts/*.png` 512×512, one series of round medallions on an opaque square |
| `passes` | list: `VIP; 2x Coins; Speed` | `parts/*.png` 512×512, glossy round discs, opaque |
| `products` | list: `100 coins; 1000 coins; Revive` | `parts/*.png` 512×512, discs in the passes' style, opaque |
| `items` | list (≤16): `wood log; iron ore; gold coin` | `parts/*.png` transparent, 512 for up to 6, else 256 |
| `props` | list (≤6): `wooden crate; street lamp; watchtower` | `parts/*.png` on white: image-to-3D inputs |
| `texture` | the surface: `mossy cobblestone` | `color.png` (made seamless) + `normal.png`, 1024 |
| `skybox` | the sky: `red sunset over a misty forest` | `SkyboxFt/Rt/Bk/Lf/Up/Dn.png` 1024 |
| `decal` | the picture; `aspect` 1:1, 16:9, 9:16, 4:3, 3:4, 2:1 | `decal.png` ≤1024 |
| `vfx` | list (≤9): `spark; smoke puff; magic ring` | `parts/*.png` 256×256, white glow on transparent (Color tints it) |
| `flipbook` | one looping effect; `frames` 4 or 16 | `flipbook.png` 1024, Grid2x2 / Grid4x4 |

Tabs (folders): `store` (icon, thumbnail, logo, loading), `monetization`, `items`, `props`, `world` (texture, skybox, decal), `vfx`; the game's GUI and Characters go to `gui/` and `characters/` beside them.

`variants` (1–4) draws several takes of the single-picture modes. Every folder has the original `source.png` / `sheet.png` and `manifest.json` with each file's size and where it goes in Roblox (Creator Dashboard page, `Sky.SkyboxFt`, `SurfaceAppearance.NormalMap`, `FlipbookLayout`…). Report the files and the manifest.

## Rules the prompts follow

From Roblox's docs and the art of top games (Adopt Me, Pet Simulator 99, Blox Fruits, Brookhaven, Doors, 99 Nights, Fisch, Steal a Brainrot…):

- Icon: one hero filling 60–80% with an exaggerated face, a simple complementary gradient or burst behind it with a rim light, at most five elements, readable at 150 px, nothing within 8% of the edges; no text unless a short title is quoted.
- Thumbnails: Roblox tests 2–5 per game, so takes are a set of different shots; nothing important in the bottom 15% (the player count covers it); hook text only if quoted, in the upper two thirds. Players are drawn as Roblox avatars.
- Badges, passes, products: shown in a circle, and a transparent icon turns black or white after upload, so they are opaque squares with the design inside the circle. Badges are one series (same ring); passes are glossy discs with a golden ring, a benefit colour and one big symbol (2x at the lower right, VIP in gold 3D letters).
- Items: one camera and light for the whole set, three-quarter from above, readable at 64 px.
- Particles and flipbooks: white, so ParticleEmitter.Color tints them; flipbooks are square, power of two, ≤1024.
- Textures: no baked light or shadows, no unique landmarks; the normal map is OpenGL (green up), the only kind Roblox takes.
- Skybox: no sun or moon (Roblox draws them), soft sky for fog and atmosphere.
- Everywhere: no URLs, handles, QR codes, prices or "FREE", no real brands, nothing suggestive — Roblox moderation rejects such images.

Sources: [experience icons](https://create.roblox.com/docs/production/publishing/experience-icons), [thumbnails](https://create.roblox.com/docs/production/publishing/thumbnails), [badges](https://create.roblox.com/docs/production/publishing/badges), [badge transparency](https://devforum.roblox.com/t/badge-icon-transparency/2759568), [passes](https://create.roblox.com/docs/production/monetization/game-passes), [surface appearance](https://create.roblox.com/docs/art/modeling/surface-appearance), [particle emitters](https://create.roblox.com/docs/effects/particle-emitters), [skybox](https://create.roblox.com/docs/environment/skybox).

Text: only what the prompt gives in quotes is written (titles on icons and thumbnails, hooks); badges, passes and products may carry one short word or number from their name (2x, VIP, x500); item icons, textures and effects have no text.

Skybox: Muse draws a 4:1 horizon; the plugin tiles it, splits it into the four sides (turning right: Ft → Rt → Bk → Lf) and fades the top and bottom into one sky and one ground colour, which are the Up and Dn faces — so the seams match whichever way Roblox turns Up and Dn. Look at it in Studio once; the horizon band is the strong part.

Look of the game: `bb image-studio roblox project --theme "…" --tags simulator,cartoon --notes "…"`; approved art as a reference: `bb image-studio roblox ref --image <path or gallery id>`; list: `bb image-studio roblox projects`.
