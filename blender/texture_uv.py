"""Image Studio texture-uv: UV guide bake, Muse repaint target, apply preview.

  Blender --factory-startup -b -P blender/texture_uv.py -- prepare <model|test> <outDir> [--object NAME] [--size 1024|2048]
  Blender --factory-startup -b -P blender/texture_uv.py -- apply <outDir> <color.png>
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
MODE = argv[0] if argv else ""
ARGS = argv[1:]

DISTINCT_COLORS = [
    (0.86, 0.22, 0.18),
    (0.22, 0.62, 0.28),
    (0.20, 0.38, 0.82),
    (0.90, 0.72, 0.18),
    (0.62, 0.28, 0.72),
    (0.18, 0.72, 0.78),
    (0.82, 0.42, 0.22),
    (0.45, 0.45, 0.45),
]


def parse_prepare_args(args):
    src = args[0]
    out = args[1]
    object_name = None
    size = 1024
    i = 2
    while i < len(args):
        if args[i] == "--object" and i + 1 < len(args):
            object_name = args[i + 1]
            i += 2
        elif args[i] == "--size" and i + 1 < len(args):
            size = int(args[i + 1])
            i += 2
        else:
            i += 1
    if size not in (1024, 2048):
        raise SystemExit("--size must be 1024 or 2048")
    return src, out, object_name, size


def scene_light():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    if not sc.world:
        sc.world = bpy.data.worlds.new("World")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background") or sc.world.node_tree.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.04, 0.04, 0.04, 1)
    bg.inputs[1].default_value = 1.0
    if "sun" not in bpy.data.objects:
        ld = bpy.data.lights.new("sun", "SUN")
        ld.energy = 2.8
        s = bpy.data.objects.new("sun", ld)
        sc.collection.objects.link(s)
        s.rotation_euler = (math.radians(48), 0, math.radians(215))


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def test_rock():
    """Three stylized blocks joined — smoke geometry without external assets."""
    mats = []
    for i, (loc, scale) in enumerate(
        [
            ((0, 0, 0), (1.2, 1.0, 0.9)),
            ((0.15, 0.1, 1.0), (1.0, 0.85, 0.75)),
            ((-0.1, 0.05, 1.85), (0.8, 0.7, 0.6)),
        ]
    ):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        ob = bpy.context.object
        ob.scale = scale
        bpy.ops.object.transform_apply(scale=True)
        mats.append(ob)
    for o in mats[1:]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mats[0]
    bpy.ops.object.join()
    return bpy.context.object


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=path)
    else:
        raise SystemExit(f"Unsupported model format: {ext}")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("No mesh in file")
    return meshes[0] if len(meshes) == 1 else max(meshes, key=lambda o: len(o.data.polygons))


def pick_object(name):
    if name:
        ob = bpy.data.objects.get(name)
        if not ob or ob.type != "MESH":
            raise SystemExit(f'No mesh object "{name}"')
        return ob
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.visible_get()]
    if not meshes:
        raise SystemExit("No mesh object")
    return max(meshes, key=lambda o: len(o.data.polygons))


def uv_layer_name(ob):
    uv = ob.data.uv_layers.active
    if not uv:
        uv = ob.data.uv_layers.new(name="UVMap")
        ob.data.uv_layers.active = uv
    return uv.name


def uv_is_usable(ob):
    me = ob.data
    if not me.uv_layers.active:
        return False
    uv = me.uv_layers.active.data
    if len(uv) == 0:
        return False
    umin, vmin, umax, vmax = 1.0, 1.0, 0.0, 0.0
    for loop in uv:
        u, v = loop.uv
        umin = min(umin, u)
        vmin = min(vmin, v)
        umax = max(umax, u)
        vmax = max(vmax, v)
    return (umax - umin) > 0.05 and (vmax - vmin) > 0.05


def ensure_uv(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    if uv_is_usable(ob):
        return
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(69), island_margin=0.035)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.align_rotation(method="GEOMETRY", axis="Z")
    bpy.ops.uv.pack_islands(rotate=False, margin=0.035)
    bpy.ops.object.mode_set(mode="OBJECT")


def flat_materials(ob):
    parts = []
    me = ob.data
    if not me.materials:
        me.materials.append(bpy.data.materials.new("Part_0"))
    for i, slot in enumerate(me.materials):
        if slot is None:
            slot = bpy.data.materials.new(f"Part_{i}")
            me.materials[i] = slot
        slot.use_nodes = True
        nt = slot.node_tree
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(n)
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = nt.nodes.get("Material Output") or nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        has_tex = False
        for n in slot.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                has_tex = True
                break
        rgb = DISTINCT_COLORS[i % len(DISTINCT_COLORS)]
        if not has_tex:
            bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.85
        name = slot.name if slot.name and not slot.name.startswith("Material") else f"part_{i + 1}"
        hex_c = "#{:02x}{:02x}{:02x}".format(int(rgb[0] * 255), int(rgb[1] * 255), int(rgb[2] * 255))
        parts.append({"part": name, "color": hex_c, "material": slot.name})
    return parts


def bake_image(ob, name, size, bake_type="COMBINED", margin=20):
    img = bpy.data.images.new(name, size, size, alpha=True)
    img.colorspace_settings.name = "sRGB"
    for slot in ob.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        tex = None
        for n in nt.nodes:
            if n.type == "TEX_IMAGE":
                tex = n
                break
        if tex is None:
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.location = (-400, 200)
        tex.image = img
        nt.nodes.active = tex
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    sc = bpy.context.scene
    sc.render.bake.margin = margin
    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    sc.render.bake.use_pass_color = True
    bpy.ops.object.bake(type=bake_type)
    return img


def save_png(img, path):
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


def mask_from_guide(img, path):
    """White where the guide has UV content; black background."""
    w, h = img.size
    px = list(img.pixels)
    out = bpy.data.images.new("mask", w, h, alpha=True)
    out_pixels = [0.0] * (w * h * 4)
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            r, g, b, a = px[i], px[i + 1], px[i + 2], px[i + 3]
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            on = a > 0.05 and lum > 0.02
            o = i
            v = 1.0 if on else 0.0
            out_pixels[o : o + 4] = [v, v, v, 1.0 if on else 0.0]
    out.pixels = out_pixels
    save_png(out, path)


def prepare():
    src, out, object_name, size = parse_prepare_args(ARGS)
    os.makedirs(out, exist_ok=True)
    clear_scene()
    scene_light()
    if src == "test":
        ob = test_rock()
    else:
        if not os.path.isfile(src):
            raise SystemExit(f"Model not found: {src}")
        import_model(src)
        ob = pick_object(object_name)
    ob.name = "model"
    ensure_uv(ob)
    uv_name = uv_layer_name(ob)
    parts = flat_materials(ob)
    guide = bake_image(ob, "guide", size, margin=20)
    guide_path = os.path.join(out, "guide.png")
    save_png(guide, guide_path)
    mask_path = os.path.join(out, "mask.png")
    mask_from_guide(guide, mask_path)
    with open(os.path.join(out, "parts.json"), "w", encoding="utf-8") as f:
        json.dump({"parts": parts}, f, indent=2)
    meta = {"object": ob.name, "uvLayer": uv_name, "size": size, "model": src if src != "test" else "test"}
    with open(os.path.join(out, "prepare.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    blend_path = os.path.join(out, "model.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)


def textured_material(img, uv_name):
    mat = bpy.data.materials.new("color_tex")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_name
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.82
    return mat


def guide_material():
    mat = bpy.data.materials.new("guide_preview")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.55, 0.55, 0.55, 1)
    bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def render_pair(ob, path, size=768):
    sc = bpy.context.scene
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    ctr = sum(bb, Vector()) / 8
    span = max((b - ctr).length for b in bb) * 2.2
    sc.render.resolution_x = size * 2
    sc.render.resolution_y = size
    sc.render.film_transparent = False
    views = [(35, 45), (35, 135)]
    shots = []
    for az, el in views:
        cam = bpy.data.cameras.new("cam")
        cam_obj = bpy.data.objects.new("cam", cam)
        sc.collection.objects.link(cam_obj)
        cam.lens = 50
        d = Vector(
            (
                math.cos(math.radians(el)) * math.sin(math.radians(az)),
                -math.cos(math.radians(el)) * math.cos(math.radians(az)),
                math.sin(math.radians(el)),
            )
        )
        cam_obj.location = ctr + d * span * 2.5
        cam_obj.rotation_euler = (ctr - cam_obj.location).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam_obj
        tmp = path + f".{az}.png"
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        shots.append(bpy.data.images.load(tmp))
        bpy.data.objects.remove(cam_obj)
        bpy.data.cameras.remove(cam)
    w, h = shots[0].size
    comp = bpy.data.images.new("preview", w * 2, h)
    px0 = list(shots[0].pixels)
    px1 = list(shots[1].pixels)
    out = [0.0] * (w * 2 * h * 4)
    for y in range(h):
        for x in range(w):
            i0 = (y * w + x) * 4
            i1 = (y * w * 2 + x) * 4
            out[i1 : i1 + 4] = px0[i0 : i0 + 4]
            i2 = (y * w * 2 + w + x) * 4
            out[i2 : i2 + 4] = px1[i0 : i0 + 4]
    comp.pixels = out
    save_png(comp, path)
    for s in shots:
        bpy.data.images.remove(s)


def apply():
    out, color_path = ARGS[0], ARGS[1]
    blend = os.path.join(out, "model.blend")
    if not os.path.isfile(blend):
        raise SystemExit(f"No model.blend in {out}")
    bpy.ops.wm.open_mainfile(filepath=blend)
    ob = bpy.data.objects.get("model")
    if not ob:
        raise SystemExit('No object "model" in blend')
    meta = json.load(open(os.path.join(out, "prepare.json"), encoding="utf-8"))
    uv_name = meta["uvLayer"]
    scene_light()
    ob.data.materials.clear()
    ob.data.materials.append(guide_material())
    before_path = os.path.join(out, "preview_before.png")
    render_pair(ob, before_path)
    img = bpy.data.images.load(color_path)
    ob.data.materials.clear()
    ob.data.materials.append(textured_material(img, uv_name))
    preview_path = os.path.join(out, "preview.png")
    render_pair(ob, preview_path)
    bpy.ops.wm.save_as_mainfile(filepath=blend)


if MODE == "prepare":
    prepare()
elif MODE == "apply":
    apply()
else:
    raise SystemExit("Usage: prepare <model|test> <outDir> | apply <outDir> <color.png>")
