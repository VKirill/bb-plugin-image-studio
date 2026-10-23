# Characters section — game characters ready for 3D

Use for a game character that becomes a 3D model: image-to-3D (Hunyuan3D, TRELLIS), auto-rigging (Roblox Avatar Setup, UniRig), a turnaround for a modeller. Always **Muse Image** on fal. Do not pass a model or aspect. For a character portrait, poster or scene, use `image_studio_generate` instead.

## Why a separate section

An image-to-3D model builds the mesh from **one picture**: everything drawn on it becomes part of the mesh. A rifle held out in the hand grows into the arm; a cape over the arms glues them to the body; a three-quarter pose with perspective gives a skewed model. The section wraps every request in fixed rules, so you never write them yourself:

- **3D front** (`model`): one figure, straight-on orthographic front view, camera at chest height, symmetric **A-pose** (arms about 45° down, a gap between arms and torso and between the legs), open empty hands, plain white background, even light, nothing sticking out of the silhouette.
- **Held items are never drawn on the body.** Everything in the hands or carried apart (weapon, tool, torch, shield, detachable backpack) goes to `equipment` and is drawn on its own sheet, then made into a separate 3D model and attached to the hand in the game.
- Worn gear stays on the body: helmet, hat, mask, goggles, armour, vest, pouches, belt, gloves, boots.
- Nothing hangs between the legs (tabards, loincloths, robes end above the knees or are split), so auto-rigging does not glue the legs together.
- Held items are drawn in the project's own style, so a painted hero gets a painted sword.

## Body type

`body` picks the neutral rigging pose, the camera and the frame. Pass it whenever the character is not a two-legged figure with arms.

| body | For | 3D picture | Turnaround |
|---|---|---|---|
| `humanoid` (default) | people, zombies, orcs, robots, anything on two legs with arms | front, A-pose, 2:3 | 1×4 row |
| `blocky` | a **Roblox R15 block avatar** built procedurally in Blender (see below) | front, arms straight down, exact block proportions, 3:4 | 1×4 row |
| `quadruped` | horse, wolf, beast on four legs (a centaur too) | **three-quarter** view, all four legs straight and apart, tail out, 3:2 | 2×2 grid |
| `winged` | harpy, dragon, bat, angel | front, wings spread flat to the sides, 4:3 | 2×2 grid |
| `legless` | serpent, slime, ghost, floating body | front, body in one loose curve, 1:1 | 1×4 row |

## Projects

Same as GUI: **Characters projects**, one per folder (the first generation creates it, named after the folder), each with its own history. A folder has one GUI project and one Characters project; they are separate lists. The project holds the look, added to every prompt: theme (`--theme "colony survivors vs zombie horde, steampunk frontier"`), presets, extra rules (`--notes "Roblox R15 proportions"`) and up to 6 references (approved characters = proportions and finish; `--role art` = the game's art, palette only).

Presets for `--tags`: `stylized`, `blocky` (Roblox-style avatar), `chibi`, `lowpoly`, `realistic`, `toon`, `painted`. A project with nothing fixed makes `ideas` try four presets; after the user picks one, set its tag and add the picture as a reference.

```
bb image-studio character projects [--json]
bb image-studio character project --theme "…" --tags stylized --notes "…"
bb image-studio character ref --image image-studio/characters/<project>/<id>-soldier-model/front.png
bb image-studio character delete --project <name>
```

## Modes

| Mode | prompt | equipment | images | Result |
|---|---|---|---|---|
| `ideas` | who the character is, what it wears | optional: drawn **in the hands** here | optional extra references | 4 full-body concepts, `idea.png` each |
| `model` | the same description (may be empty with images) | named only to be left out | the picked idea (recommended) | `front.png`: the image-to-3D input |
| `turnaround` | the same description (may be empty with images) | named only to be left out | the model's `front.png` (recommended) | `sheet.png` + `views/front.png, right.png, back.png, left.png` (white squares) + `manifest.json` |
| `equipment` | optional: whose items | **required**, up to 8, `;`-separated | the idea that shows them | `sheet.png` + `parts/<item>.png` (white squares, side view, tip to the right) + `manifest.json` |
| `accessories` | optional: whose pieces | `accessories` **required**, up to 8 | the idea that shows them | worn pieces alone (helmet hollow, pauldrons, wings, cape), three-quarter view, `parts/<item>.png` for image-to-3D |

Tool: `image_studio_character` (`mode`, `prompt`, `equipment`, `accessories`, `name`, `body`, `project`, `images`). `accessories` are worn pieces made apart from the body: left out of `model`/`turnaround` like `equipment`, drawn by mode `accessories`. Runs at once, no Send form. CLI: `bb image-studio character generate --mode … [--name soldier] [--body humanoid|quadruped|winged|legless] [--equipment "rifle; knife"] [--image <path or gallery id>]… --prompt "…" [--json]`. `name` is the short file name; without it the first words of the description are used.

Files: `image-studio/characters/<project>/<id>-<name>-<mode>/`. A turnaround or equipment sheet is cut by its white gaps; `missing` lists empty cells, `cleanGaps: false` in the manifest means some figures touched and were cut at their narrowest point, with a neighbour's tip dropped (check the edges, or re-cut). `leftFlipped: true`: the generator drew the left side view facing the same way as the right one, and the plugin mirrored it. Re-cut for free: `bb image-studio character cut --sheet <path> [--grid 1x4|2x2]` or `--items "rifle; knife"` in the sheet's order.

## Roblox block avatars (`body: blocky`)

For Roblox games whose characters are classic block avatars. The picture is not meant for image-to-3D: the body is built from boxes in Blender and the drawing is projected onto them, so the views must keep the exact block outline.

- The plugin fixes the R15 proportions (head 1.15 cube, torso 2×2.1×1, arms 1×2.7 hanging straight down, legs 1×2, 4 wide and 5.2 tall), the pose (arms down with a thin gap, legs parallel) and paints clothing, armour and face **flat** on the block faces.
- Everything with volume goes to `accessories`: helmet, hat, hair, pauldrons, wings, cape, skirt, backpack. Weapons go to `equipment`.
- Flow: `ideas` (the full look, accessories on) → `turnaround` with `body: blocky` (the picked idea in `images`) → `accessories` and `equipment` (the idea in `images`) → build:

```
Blender -b -P Roblox/toolkit/assets3d/roblox_blocky.py -- <turnaround>/views out/knight.fbx
```

`roblox_blocky.py` builds the 15 R15 MeshParts at the standard rig's sizes, projects front/back/side views onto their faces (one 1024 texture), and writes `knight.fbx` + `knight.json` (joints, root height) — the format `import_segments.luau` in Zombie Colony turns into an animated R15 model. Accessories and weapons become separate 3D models (image-to-3D) attached to the R15 attachment points.

## Writing the request

Split the user's words yourself:

- *"soldier with an assault rifle, helmet and gas mask"* → `prompt: "colony soldier: olive field uniform, quilted vest with leather straps, steel helmet, gas mask, knee pads, leather boots"`, `equipment: "assault rifle"`, `name: "soldier"`.
- *"lumberjack with an axe and a backpack"* → backpack worn and staying on the model: keep it in `prompt` ("small backpack strapped tight to the back"); detachable or swappable: put it in `equipment`.

Describe the character only: body type, face, clothes, materials, colours, worn gear. **Do not describe pose, camera, background, lighting or art style** — the plugin adds them, and the project adds the look.

## Good flow

1. `ideas` with the description (and equipment, so the concepts show the character armed) → the user picks one.
2. Fix the look once per project: `character project --tags …`, `character ref --image <picked idea>`.
3. `model` with `images: [<picked idea>]` → `front.png`. Check it: empty hands, A-pose, nothing sticking out. This file goes to image-to-3D (e.g. `image_to_3d.py front.png out/ --backend vast --model hunyuan3d`).
4. `turnaround` with `images: [<front.png>]` → `views/` for checking the back, for multi-view 3D models or a modeller.
5. `equipment` with `images: [<picked idea>]` and the held items → `parts/*.png`, each made into its own 3D prop and attached to the hand.
6. Report the paths of `front.png`, `views/` and `parts/`, and anything in `missing`.
