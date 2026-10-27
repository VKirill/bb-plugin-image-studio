STATUS: complete

# Image Studio section model: texture-uv mode end to end (Blender prepare/apply on the project host, Muse, post, tool, CLI)

Add section `model` ("Текстура по модели") beside gui/characters/roblox and agent tool `image_studio_model` with mode `texture-uv`: from a model file (FBX/GLB/.blend) the plugin bakes a UV guide in background Blender on the project's host, asks Muse to repaint every UV piece in place, cuts and dilates the result, applies it back in Blender and writes color.png, mask.png, guide.png, preview.png, parts.json, model.blend and manifest.json into image-studio/model/<project>/<take>/. Mode `blueprint` is accepted by the schema but returns a clear 'not implemented yet' error (task model-blueprint fills it). Hints: in server.ts see sectionSchema (~line 147), exportGui (~1290-1330), project/game linking (~1530-1700), threadFolder/projectSource (~1726), CLI help (~2265), registerTool image_studio_roblox (~2895). Blender runs on the host through a plugin host entry (package.json bb.host -> ./host.ts, see the two example files in .agents/plans/texture-by-model/, which come from sibling plugins bb-plugin-content-factory and bb-plugin-story-room) called via bb.sdk.hosts.experimental_client with hostId and a long timeoutMs (bake can take minutes).

Attempt 3 accepted by Lane Pilot BB writer.
