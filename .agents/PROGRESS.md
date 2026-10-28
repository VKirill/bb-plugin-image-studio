## Now
- Generate project images through the gallery, chat flow, CLI, and batch jobs using fal.ai and kie.ai models.
- Build and reuse people profiles with reference sheets that carry identity across image generations.
- Create GUI projects with themed prompts, palettes, references, screen concepts, cut elements, and UI kits.
- Create Characters projects and Roblox game assets, including turnarounds, equipment, textures, and other game art.
- Texture FBX, GLB, or Blender models in the Texture by model section (`image_studio_model`, `bb image-studio model generate`): concept projection, Muse repainting of UV pieces, guide fix, named palettes, before/after previews, blueprints on nano-banana-2.1 (one sheet, cut into views, soft-part anchors).
- Track a prop as an item (`image_studio_item`, `bb image-studio model item …`): item.json in the game folder through concept, blueprint, model, unwrap, texture, preview and export; runs with `item` take their inputs from it; export writes FBX (scale from `fbxScale`, default 0.01), PNG maps and `export.json` for Roblox.

## Blocked
- none

## Next
- Run the planned fire-mop and rock-stack acceptance checks for model texturing and blueprint output.
- Run the plunger-scepter item acceptance from existing files (no generations) and check the item panel and gallery badge.

## Last verify
- command: `node_modules/.bin/tsc --noEmit` (exit 0); `node --test --experimental-strip-types tests/*.test.ts` (302 pass, 0 fail); `grep '"version"' package.json` (0.9.3)
- result: green; the fire-mop, rock-stack and item runtime acceptance checks are not run here
- when: 2026-10-28

## Pointers
- Open todos: none; `.agents/todos/` is absent.
- Active plans: `.agents/plans/2026-10-27-texture-by-model.md` (status complete; runtime acceptance checks for fire-mop and rock stack remain) and `.agents/plans/2026-10-28-model-items.md` (items implemented 0.9.0–0.9.3; runtime acceptance remains). `.agents/plans/ROADMAP.md` is absent.
- Changelog: `.agents/CHANGELOG.md`.
