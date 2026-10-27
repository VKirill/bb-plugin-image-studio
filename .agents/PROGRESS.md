## Now
- Generate project images through the gallery, chat flow, CLI, and batch jobs using fal.ai and kie.ai models.
- Build and reuse people profiles with reference sheets that carry identity across image generations.
- Create GUI projects with themed prompts, palettes, references, screen concepts, cut elements, and UI kits.
- Create Characters projects and Roblox game assets, including turnarounds, equipment, textures, and other game art.
- Texture FBX, GLB, or Blender models in the Texture by model panel, with `image_studio_model` and `bb image-studio model generate` (all tool parameters), including concept projection, Muse repainting, Blender previews, and aligned orthographic blueprints (the side view is drawn separately by default, with soft-part anchors).

## Blocked
- none

## Next
- Run the planned fire-mop and rock-stack acceptance checks for model texturing and blueprint output.

## Last verify
- command: `node --test --experimental-strip-types tests/skill-frontmatter.test.ts tests/model-cli.test.ts tests/blueprint-side.test.ts` (12 pass); `node --test --experimental-strip-types tests/model.test.ts tests/model-theme.test.ts tests/blueprint.test.ts tests/model-panel.test.ts` (26 pass); `node_modules/.bin/tsc --noEmit` (exit 0); `grep '"version"' package.json` (0.8.10)
- result: green; fire-mop and rock-stack runtime acceptance checks are not run here
- when: 2026-10-27

## Pointers
- Open todos: none; `.agents/todos/` is absent.
- Active plan: `.agents/plans/2026-10-27-texture-by-model.md` (status complete; accepted tasks done; fire-mop and rock-stack runtime acceptance checks remain). `.agents/plans/ROADMAP.md` is absent.
- Changelog: `.agents/CHANGELOG.md`.
