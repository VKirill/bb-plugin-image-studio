STATUS: complete

# preview.png crops the model: frame the whole model at 75-85% of each tile, nothing touching the edges

After model-release-prep the preview overcorrected: on the real fire-mop each tile shows only the middle of the model (height fraction 0.996, 881 foreground pixels on the tile border) — the handle end and the mop head are cut off. Frame each view so the WHOLE model is visible at about 75-85% of the tile's larger dimension: project the 8 world bbox corners into the camera (bpy_extras.object_utils.world_to_camera_view) and set the distance (perspective) or ortho_scale (ortho) so the projected extent fits with a margin; this must hold for tall thin models (fire-mop is about 4x taller than wide) and squat ones (the rock stack). Keep the current lighting. Replace scripts/model-checks/guide_check.py with the PM's updated version /tmp/lp-tex/guide_check.py verbatim (it adds an upper bound 0.92 on the height fraction and fails on any foreground pixel within 2% of a tile edge). Regenerate src/blender-scripts.ts byte-identical.

Attempt 1 accepted by Lane Pilot BB writer.
