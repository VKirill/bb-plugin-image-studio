---
title: Image Studio — "Texture by model" (texture-uv), blueprint, agent skill
date: 2026-10-27
source: TZ /Users/vechkasov/Documents/Мои проекты/Roblox/lava-arena/.bb/chats/thr_vgdyg342s5/artifacts/image-studio-texture-tz.md
status: complete 2026-10-27 (accepted Lane Pilot tasks shipped; runtime acceptance checks remain)
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
| model-core-fix | bundle delivery, dedicated UV, existing textures, parts, tested light/mask, preview and variant preparation fixes | model-section-core | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-concept-projection | project concept onto model before Muse and structure the texture prompt | model-section-core | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-projection-fix | correct world-space projection, view mirroring, and fixture texture lookup | model-concept-projection | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-blueprint-v2 | blueprint prompt, view cutting and baseline alignment, soft anchors, side regeneration, and `views.json` | model-section-core | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-panel-v2 | model section tab, generation forms, and texture/blueprint takes gallery | model-section-core | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-skill-v2 | model texture and blueprint reference, SKILL.md entry, and item pipeline | model-blueprint-v2 | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-release-prep | release fixes for baking, previews, concept defaults, browser safety, blueprint wording, and version 0.8.5 | model-core-fix, model-blueprint-v2 | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-preview-framing | preview tiles frame the whole model at 75–85% of the tile, nothing touching the edges; PM guide_check.py | model-release-prep | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-skill-holes | skill no longer claims prepare fills holes; the agent closes holes in Blender before texture-uv | model-skill-v2 | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-hub-build-fix | hub install: host.ts imports from the bare `@get-bb/plugin-sdk`; version 0.8.6 | — | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-skill-desc-limit | image-studio skill description under 1024 characters with every trigger group kept, frontmatter test for all skills; version 0.8.7 | — | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-accept-fixes | SKILL.md frontmatter valid YAML (skill registers again), absolute paths for every host file call, CLI carries all model flags and `--sheet-style`; version 0.8.8 | model-skill-desc-limit | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-accept-round2 | blueprint cut keeps the handle (true gaps, label removal), side-copy threshold 0.8 with a narrow-profile test, soft anchor in the top band, pale light-blue soft key, marker-coloured parts not locked to red; version 0.8.9 | model-accept-fixes | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-accept-round3b | blueprint side always drawn separately in a second Muse call (`assembleBlueprint`, `sideSeparate` default true, `sheetSideSimilarity` diagnostic); texture-uv game look kept out of the albedo prompt; version 0.8.10 | model-accept-round2 | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-requester-round | Task outranks the game look (lower-priority 'Game look' line), textured parts get a colour palette named through `parts`, blueprint views classified by silhouette (`classifyViews`, back relabelled to side or drawn alone), CLI generate uses the folder's project; version 0.8.11 | model-accept-round3b | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-classify-real | classifyViews decides by a clear similarity margin (best pair >= 0.45 and >= 1.6x the second); the real 0.8.10 sheet relabels back to side and draws the back alone; version 0.8.12 | model-requester-round | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-side-crop | a separately drawn single-view side is cut to its object (labels and specks dropped) before centring on the shared canvas; version 0.8.13 | model-accept-round3b | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-guide-fix2 | material-colour lock in the prompt and a mandatory guide-based fix of Muse's dark gaps and hue swaps (`guideFix`, `--guide-fix on|off`); version 0.8.15 | — | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-scepter-round | base colours kept per material, markers chosen far from named hues, outline/light clauses stripped from the game look, preview tiles follow the model's aspect; version 0.8.14 | — | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |
| model-blueprint-nb21 | blueprint renders with nano-banana-2.1 by default (1K, kie first with a 20+ min poll, fal fallback), explicit per-view prompt, one sheet per item; version 0.8.16 | — | done | lprun_7ab1f614e5bf4e9cac43bc49529371b0 |

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

## History
### 2026-10-27
- Accepted Lane Pilot run `lprun_7ab1f614e5bf4e9cac43bc49529371b0` completed all seven model tasks, including texture-uv core fixes, concept projection, blueprint, panel, and skill updates. Fire-mop and rock-stack runtime acceptance checks remain a follow-up.
- Same run also completed model-preview-framing, model-skill-holes and model-hub-build-fix (hub bundle build fixed: `bb plugin update` to 0.8.5 was refused; now 0.8.6). These three had no rows in the table until this entry.
- Accepted Lane Pilot run `lprun_7ab1f614e5bf4e9cac43bc49529371b0` also completed model-accept-fixes (version 0.8.8): skill frontmatter fixed so BB registers the skill again, host file paths resolved to absolute, CLI carries all model flags and `--sheet-style`. The row was added in this entry.
- Accepted Lane Pilot run `lprun_7ab1f614e5bf4e9cac43bc49529371b0` also completed model-skill-desc-limit (version 0.8.7) and model-accept-round2 (version 0.8.9): the blueprint cut keeps the handle, the side-copy threshold is 0.8 with a narrow-profile test, soft anchors sit in the top band, the soft colour key is the pale light-blue clay, and untextured parts with marker colours no longer lock Muse to red. The rows were added in this entry. The `items/*/PLAN.md` files are pointers to this plan and were not edited.
- Accepted Lane Pilot run `lprun_7ab1f614e5bf4e9cac43bc49529371b0` also completed model-accept-round3b (version 0.8.10): the blueprint draws the side view alone in a second Muse call (`sideSeparate`, default on) and the texture-uv prompt puts the game look on its own line after the Task. The row was added in this entry. Model-accept-round3 and model-blueprint have item folders but are not in this run's accepted list, so they have no rows here.
- Accepted Lane Pilot run `lprun_7ab1f614e5bf4e9cac43bc49529371b0` also completed model-requester-round (version 0.8.11): the Task line outranks the game look, textured parts get a named colour palette through `parts`, blueprint views are classified by silhouette (`classifyViews`; the mirrored back is relabelled to side, or the side/back is drawn alone with `buildBackOnlyPrompt`), and `bb image-studio model generate` run from a game folder saves into that folder's project. The row was added in this entry.
- Accepted Lane Pilot run `lprun_7ab1f614e5bf4e9cac43bc49529371b0` also completed model-classify-real (version 0.8.12): `classifyViews` decides by a clear margin, so the real 0.8.10 sheet relabels its back panel to side; and model-side-crop (version 0.8.13): a separately drawn side view is cut to its object before centring. The rows were added in this entry; the `items/*/PLAN.md` files are pointers to this plan and were not edited.
### 2026-10-28
- Accepted Lane Pilot run `lprun_7ab1f614e5bf4e9cac43bc49529371b0` also completed model-guide-fix2 (version 0.8.15), model-scepter-round (0.8.14) and model-blueprint-nb21 (0.8.16). The three rows were added in this entry, with no dependency recorded because the accepted task list did not name one.
- The item tasks (item-core 0.9.0, item-export 0.9.1, item-panel 0.9.2, item-fixes 0.9.3, item-skill) are tracked in `2026-10-28-model-items.md`, not here.

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
