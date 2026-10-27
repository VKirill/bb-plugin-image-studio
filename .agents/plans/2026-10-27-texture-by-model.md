---
title: Image Studio — "Texture by model" (texture-uv), blueprint, agent skill
date: 2026-10-27
source: TZ /Users/vechkasov/Documents/Мои проекты/Roblox/lava-arena/.bb/chats/thr_vgdyg342s5/artifacts/image-studio-texture-tz.md
status: approved 2026-10-27 (with soft-parts addition)
---

# Plan

Repository: `/Users/vechkasov/Documents/BB-сервис/plugins/bb-plugin-image-studio` (image-studio@0.8.4, git VKirill/bb-plugin-image-studio).

> [!WARNING]
> This Lane Pilot run is bound to `bb-plugin-image-generator/`, a git-ignored subfolder of the plugin repo.
> Writers must run in the repo root, so dispatch needs a PM run bound to `bb-plugin-image-studio/`.

## Shape

New section **model** ("Текстура по модели") beside gui / characters / roblox. Projects live in
`image-studio/model/<project>/`; in a Roblox game folder it links to the game (gameId) and inherits its look,
like GUI and Characters. A new agent tool `image_studio_model` takes `mode: texture-uv | blueprint`.

### Mode texture-uv
Input: `model` (FBX / GLB / .blend path), `object?`, `prompt` (style and effects), `parts?` (material → part text),
`images?` (≤2: concept, style sheet), `size` 1024|2048, `variants` 1-4.

1. Blender step A (background `Blender --factory-startup -b -P <plugin>/blender/texture_uv.py -- prepare`), run on
   the project's machine through the SDK terminals / host command API (Blender path from settings,
   default `/Applications/Blender.app/Contents/MacOS/Blender`, else `blender` on PATH):
   import, normals fix, unwrap if no usable UV (Smart UV 66–72°, margin 0.03–0.04), then
   `uv.align_rotation(method="GEOMETRY", axis="Z")` + `pack_islands(rotate=False)`; flat distinct colour per
   material (keeps existing texture when present); bake COMBINED (key light top-left + soft world) with margin
   16–24 px into `guide.png`, no island outlines; `mask.png`; `parts.json` (colour → part); `model.blend`.
2. Muse: images = [guide, concept?, style?]; the tested prompt template from the TZ §3.1 with the colour list and
   effects; variants 2-4.
3. Post (TypeScript, sharp): cut by mask, dilate edges 8–16 px → `color.png`; optional `normal.png` from colour
   (reuse the roblox texture path).
4. Blender step B (`-- apply`): material with the image on the same UV layer, render 2 sides,
   `preview.png` = before / after; save `.blend` with the material.
5. `manifest.json`: model, object, UV layer name, size, prompt, files.

### Mode blueprint
Input: concept image, `views` (front, side, back, top), `style` clay+wire | clean line.
Muse draws one sheet with the tested blueprint prompt; the plugin finds the view boxes (alpha / background key),
puts each view on a transparent canvas of one scale and one baseline → `front.png`, `side.png`, …, `sheet.png`,
`views.json` (boxes, baseline, height px).

Soft parts (requester's addition): parts that must dangle (cloth, threads / ropes, ribbons, hair, tails) are drawn
in a separate base colour (light-blue clay instead of grey) on every view. `views.json` gets
`parts: [{name, kind: rigid|soft, anchor: {view, x, y} | null}]` — the approximate attachment point of each soft
part, so the modeller cuts soft parts as separate meshes and gives them bones. The plugin finds the blue regions
per view (colour key) and checks the list against them.

### Panel
Section tab "Текстура по модели": model path field, parts, references, results gallery with guide / color /
preview per take. Follows existing gui-panel patterns, i18n ru/en.

### Skill
`skills/image-studio/references/model-textures.md` + a short section in `SKILL.md`: when texture-uv vs roblox
texture (seamless) vs blueprint; the rules from TZ §2 (no outlines on the guide, big islands, top up, part
colours, concept as 2nd reference, no view projection); how to hook the result in Blender (UV Map node by the
manifest's layer name), Roblox SurfaceAppearance (Color / Normal / Roughness); MCP call examples; acceptance
checklist.

## Tasks (writer contracts)

| id | what | depends_on | status | run |
|---|---|---|---|---|
| model-section-core | section `model`, `src/model.ts` (modes, prompts, request → jobs), Blender script `blender/texture_uv.py` (prepare / apply), runner on the project host, post (mask cut, dilate), tool `image_studio_model` mode texture-uv, CLI `bb image-studio model`, unit tests for prompt build and dilate | — | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-blueprint | blueprint mode: prompt, view cut + baseline align, `views.json`, tests on a fixture sheet | model-section-core | todo | — |
| model-panel | the section tab in the app | model-section-core | todo | — |
| model-skill | skill reference + SKILL.md section | model-blueprint | todo | — |

Checks per task: `npx tsc --noEmit` and `npx vitest run tests/model.test.ts` (new test file); the Blender script
gets a smoke check `Blender -b --factory-startup -P blender/texture_uv.py -- prepare test <tmp>` that must
produce guide.png and mask.png (the built-in "test" rock stack from tex_guide.py is ported in).

## Acceptance (TZ §4)
- fire-mop.fbx and the rock stack: one `image_studio_model` call each; preview without seams-frames, scorch at
  the rag ends, parts right. Run by the PM after release; renders sent back to thr_vgdyg342s5.
- fire-mop blueprint: 3 views of one height, valid `views.json`; the rags are blue clay and listed as soft with an anchor on the mop head.
- Skill lets a fresh agent texture a new model.

## Ship
`git push` in the plugin repo, version 0.8.4 → 0.8.5 (git range `>=0.2.0` accepts it), then
`bb-plugin-push image-studio`, `bb plugin list` shows 0.8.5.

## Open points
- Where the plugin server runs vs where Blender is: Blender runs on the project folder's host via the SDK
  host command API; if the host has no Blender the tool returns a clear error naming the path setting.

## Skill addition (requester, 2026-10-27): section "Item pipeline" in model-textures.md
1. Concept (Image Studio: roblox items/props or characters) → approval.
2. Blueprint from the approved concept: front/side/back of one height, soft parts in a separate colour + views.json.
3. Modelling in live Blender through MCP on the blueprint (views as backdrops): rigid parts separate from soft ones; soft parts get bone chains.
4. Unwrap (big islands, top up) → guide (part colours × light) → texture-uv: Muse [guide, concept] → apply, before/after render → fixes.
5. Bake and export for the engine (Color/Normal/Roughness, bones); effects (fire, glow) as engine particles, not mesh.
Must be stated in the text: Muse draws neither the model nor a mesh to import — the blueprint's wireframe is decorative, the model is built in Blender; the texture is painted on the UV of the finished model.

## TZ §3.4 addition (fishing rod test, 2026-10-27)
- texture-uv, step A: **concept projection before Muse** (required for faces, eyes, lettering, placed patterns).
  Cut the concept to the item, fill the background around it with the main colour, project it planar onto the
  model from the concept's view (position → UV by bounding box), bake it into the UV atlas together with the
  light. Muse gets a guide where everything already sits in place and only cleans it up. Input `conceptView`
  (front|side|…, default front); on by default when a concept is given.
- Prompt structure (Muse docs, Meta/fal): role per image (`Image 1 is the LAYOUT…`, `Image 2 is the STYLE AND
  DESIGN REFERENCE…`) → `Task:` → `Must not change:` (piece position/outline/size, where the face is, background,
  colours) → short ban list (frames, flowers, text, new objects). Muse has no negative prompt / seed / strength
  fields: text only. Applies to texture-uv and blueprint prompts; unit test pins the four blocks in order.
- blueprint: the side view is a **separate generation** ("exact 90° side profile, … seen edge-on"), not part of
  the sheet (Muse copies the front view otherwise); then aligned to the same height and baseline.
- Model prep: after deleting details (e.g. eye spheres) close the holes (`bmesh.ops.holes_fill`), else dark pits
  on the render. Step A runs it on open boundaries left by removed parts.
- Skill: all four rules in model-textures.md and the item pipeline.

## Prompt templates (requester, 2026-10-27)
The texture-uv (TZ §3.1) and blueprint (TZ §3.2) prompt templates in the TZ file were rewritten to the Muse
structure (image roles → Task → Must not change → bans). Take them **verbatim** from
`/Users/vechkasov/Documents/Мои проекты/Roblox/lava-arena/.bb/chats/thr_vgdyg342s5/artifacts/image-studio-texture-tz.md`
into `src/model.ts` and the skill; read the TZ at dispatch time, not this plan's older wording.
