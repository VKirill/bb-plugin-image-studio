STATUS: complete

# Skill: the item pipeline through items (concept → blueprint → model in Blender → unwrap → texture → export) with CLI and tool examples

Rewrite the 'Item pipeline' section of skills/image-studio/references/model-textures.md around items: 1) create the item (image_studio_item create / `bb image-studio model item create --item <id>`); 2) attach the approved concept (file or roblox/character gallery id); 3) blueprint with item (nano-banana-2.1, 1K default, kie ~10 min); 4) model in live Blender through MCP on the blueprint views, rigid parts apart from soft ones with bone chains at the anchors, close holes; save the model into the game and attach it to the item's model step; 5) texture-uv with item (model and concept come from the item; Muse via fal; guide fix on; name palette colours via parts); 6) look at preview, select the take (image_studio_item select); 7) export (FBX at fbxScale 0.01, PNG maps, export.json → MeshPart + SurfaceAppearance). Explain item.json (where it lives, steps, selected/selectedBy) and how an agent resumes an item with `item show` (nextStep). Keep the rest of the file; names must match the code. Add one line to SKILL.md's model paragraph pointing to items (no frontmatter change).

Attempt 1 accepted by Lane Pilot BB writer.
