## Now
- Generate project photos through the gallery, chat flow, CLI, and batch jobs using fal.ai and kie.ai models, reusing people profiles with reference sheets that carry identity across generations.
- Roblox-first game art: a game folder holds its own GUI (the standalone GUI tab is gone from the panel; `image_studio_gui` and `bb image-studio gui` still write into the game's GUI project), Characters projects draw game characters with turnarounds, equipment and held items, and the Roblox section fits game assets (icon, thumbnails, badges, props, textures, skybox, decals, vfx) to Roblox with `manifest.json`.
- Texture FBX, GLB, or Blender models in the Texture by model section (`image_studio_model`, `bb image-studio model generate`): concept projection, Muse repainting of UV pieces, guide fix, named palettes, before/after previews, blueprints on nano-banana-2.1 (one sheet, cut into views, soft-part anchors).
- Track a prop as an item (`image_studio_item`, `bb image-studio model item …`): item.json in the game folder through concept, blueprint, model, unwrap, texture, preview and export; runs with `item` take their inputs from it; export writes FBX (scale from `fbxScale`, default 0.01), PNG maps and `export.json` for Roblox.
- Web section for site graphics (`image_studio_web`, `bb image-studio web …`, panel tab «Сайты»): ideas/page/mobile/block mockups, logo, favicon set (ICO, apple-touch, maskable, site.webmanifest), og card, hero, cover, illustrations, icons, background, seamless pattern — every picture through Muse, fitted to exact site sizes, with a `manifest.json` of where each file goes (no SVG yet). Prompts are tuned from the real acceptance run: picture modes take colours only, layout modes are edge-to-edge screenshots with the site's own name, the four ideas differ by layout type; fal transient failures are retried (skill docs in `skills/image-studio/references/web.md`).

## Blocked
- none

## Next
- Run the planned fire-mop and rock-stack acceptance checks for model texturing and blueprint output.
- Run the plunger-scepter item acceptance from existing files (no generations) and check the item panel and gallery badge.

## Last verify
- command: `node_modules/.bin/tsc --noEmit` (exit 0); `node --test --experimental-strip-types tests/*.test.ts` (332 pass, 0 fail); `grep '"version"' package.json` (0.10.3)
- result: green; the fire-mop, rock-stack and item runtime acceptance checks are not run here
- when: 2026-11-02

## Pointers
- Open todos: none; `.agents/todos/` is absent.
- Active plans: `.agents/plans/2026-10-27-texture-by-model.md` (status complete; runtime acceptance checks for fire-mop and rock stack remain), `.agents/plans/2026-10-28-model-items.md` (items implemented 0.9.0–0.9.3; runtime acceptance remains) and `.agents/plans/2026-11-01-web-section.md` (web section shipped 0.10.0–0.10.3, incl. GUI tab removal; SVG and site-style reading parked under Later). `.agents/plans/ROADMAP.md` is absent.
- Changelog: `.agents/CHANGELOG.md`.
