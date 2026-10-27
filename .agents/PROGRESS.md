## Now
- Generate project images through the gallery, chat flow, CLI, and batch jobs using fal.ai and kie.ai models.
- Build and reuse people profiles with reference sheets that carry identity across image generations.
- Create GUI projects with themed prompts, palettes, references, screen concepts, cut elements, and UI kits.
- Create Characters projects and Roblox game assets, including turnarounds, equipment, textures, and other game art.
- Texture FBX, GLB, or Blender models in the Texture by model panel with `image_studio_model`, including concept projection, Muse repainting, Blender previews, and aligned orthographic blueprints with soft-part anchors.

## Blocked
- none

## Next
- Run the planned fire-mop and rock-stack acceptance checks for model texturing and blueprint output.

## Last verify
- command: `grep -n "plugin-sdk" host.ts` (bare import only) and `grep '"version"' package.json` (0.8.6); plan table reviewed for lprun_7ab1f614e5bf4e9cac43bc49529371b0
- result: green for the hub bundle fix; all accepted model tasks marked done in the plan; fire-mop and rock-stack runtime acceptance checks remain; run artifacts under `.agents/runs/` are not in this checkout
- when: 2026-10-27

## Pointers
- Open todos: none; `.agents/todos/INDEX.md` is absent.
- Active plan: `.agents/plans/2026-10-27-texture-by-model.md` (accepted tasks complete; fire-mop and rock-stack runtime acceptance checks remain).
- Changelog: `.agents/CHANGELOG.md`.
