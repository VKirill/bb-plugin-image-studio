STATUS: complete

# Skill: drop the false claim that prepare fills holes

skills/image-studio/references/model-textures.md says 'prepare runs hole fill on open boundaries' but blender/texture_uv.py does no hole filling (and must not: open cloth or rag planes are intentional). Rewrite that bullet: the agent closes holes itself in Blender (bmesh.ops.holes_fill on the boundary edges of the removed detail) before calling texture-uv; the plugin does not change the mesh. Check the rest of the file for other claims the code does not back (grep the named functions/params in server.ts, src/model.ts, src/blueprint.ts, blender/texture_uv.py) and fix them the same way.

Attempt 1 accepted by Lane Pilot BB writer.
