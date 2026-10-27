"""Image Studio texture-uv: UV guide bake, Muse repaint target, apply preview.

  Blender --factory-startup -b -P texture_uv.py -- prepare <model|test> <outDir> [--object NAME] [--size 1024|2048]
  Blender --factory-startup -b -P texture_uv.py -- apply <outDir> <color.png>
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
MODE = argv[0] if argv else ""
ARGS = argv[1:]

UV_LAYER = "ImageStudioUV"
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
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    if not sc.world:
        sc.world = bpy.data.worlds.new("World")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background") or sc.world.node_tree.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (1, 1, 1, 1)
    bg.inputs[1].default_value = 0.6
    sun = bpy.data.objects.get("sun")
    if not sun:
        ld = bpy.data.lights.new("sun", "SUN")
        ld.energy = 3.0
        sun = bpy.data.objects.new("sun", ld)
        sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(40), 0, math.radians(210))


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def _block(name, center, size, yaw=0.0, seed=0, chops=5, tilt=0.12, bevel=0.14):
    """Stylized rock block (from backdrop_kit.block, materials stripped for smoke)."""
    rnd = random.Random(seed)
    w, d, h = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * d, (v.co.z + 0.5) * h))
        if v.co.z > h * 0.5:
            v.co.z += v.co.x * tilt * rnd.uniform(-1, 1) + v.co.y * tilt * rnd.uniform(-1, 1)
    for _ in range(chops):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1.0))).normalized()
        ctr = Vector((0, 0, h / 2))
        far = max((v.co - ctr).dot(n) for v in bm.verts)
        co = ctr + n * far * rnd.uniform(0.62, 0.85)
        r = bmesh.ops.bisect_plane(
            bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=n, clear_outer=True
        )
        bmesh.ops.contextual_create(bm, geom=[g for g in r["geom_cut"] if isinstance(g, bmesh.types.BMEdge)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = Vector(center)
    ob.rotation_euler.z = math.radians(yaw)
    _coll("bk_parts").objects.link(ob)
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = min(w, d, h) * bevel
    mod.segments = 3
    mod.profile = 0.7
    mod.limit_method = "ANGLE"
    mod.harden_normals = True
    return ob


def test_rock():
    obs = [
        _block("t0", (0, 0, 0), (30, 26, 22), yaw=0, seed=101),
        _block("t1", (2, 1, 21), (26, 23, 18), yaw=12, seed=102),
        _block("t2", (-1, 2, 38), (20, 18, 14), yaw=-8, seed=103, tilt=0.2),
    ]
    for o in obs:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier="bevel")
        o.data.materials.clear()
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    return bpy.context.object


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise SystemExit(f"Unsupported model format: {ext}")


def visible_meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.visible_get()]


def pick_object(name):
    if name:
        ob = bpy.data.objects.get(name)
        if not ob or ob.type != "MESH":
            raise SystemExit(f'No mesh object "{name}"')
        return ob
    meshes = visible_meshes()
    if not meshes:
        raise SystemExit("No mesh object")
    if len(meshes) == 1:
        return meshes[0]
    return join_meshes(meshes)


def join_meshes(meshes):
    names = [o.name for o in meshes]
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    for o in meshes:
        dup = o.copy()
        dup.data = o.data.copy()
        bpy.context.scene.collection.objects.link(dup)
        dup.matrix_world = o.matrix_world.copy()
        copies.append(dup)
        dup.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = "model"
    return ob, names


def uv_bounds(layer):
    umin, vmin, umax, vmax = 1.0, 1.0, 0.0, 0.0
    for loop in layer.data:
        u, v = loop.uv
        umin = min(umin, u)
        vmin = min(vmin, v)
        umax = max(umax, u)
        vmax = max(vmax, v)
    return umin, vmin, umax, vmax


def layer_usable(layer):
    if not layer or len(layer.data) == 0:
        return False
    umin, vmin, umax, vmax = uv_bounds(layer)
    return (umax - umin) > 0.05 and (vmax - vmin) > 0.05


def copy_uv_layer(me, src_name, dst_name):
    src = me.uv_layers.get(src_name)
    dst = me.uv_layers.get(dst_name)
    if not src or not dst:
        return
    for i in range(len(src.data)):
        dst.data[i].uv = src.data[i].uv


def ensure_image_studio_uv(ob):
    me = ob.data
    active = me.uv_layers.active
    active_name = active.name if active else None
    if UV_LAYER not in me.uv_layers:
        me.uv_layers.new(name=UV_LAYER)
    studio = me.uv_layers[UV_LAYER]
    if active and active.name != UV_LAYER and layer_usable(active):
        copy_uv_layer(me, active.name, UV_LAYER)
    else:
        me.uv_layers.active = studio
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(69), island_margin=0.035)
        bpy.ops.object.mode_set(mode="OBJECT")
    me.uv_layers.active = studio
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.align_rotation(method="GEOMETRY", axis="Z")
    bpy.ops.uv.pack_islands(rotate=False, margin=0.035)
    bpy.ops.object.mode_set(mode="OBJECT")
    return active_name or "UVMap"


def image_has_pixels(img):
    if not img:
        return False
    try:
        return img.size[0] > 0 and img.size[1] > 0 and len(img.pixels) > 4
    except (TypeError, ReferenceError):
        return False


def material_has_texture(mat):
    if not mat or not mat.use_nodes:
        return False
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and image_has_pixels(n.image):
            return True
    return False


def ensure_uv_map_node(mat, uv_name):
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return
    for n in nt.nodes:
        if n.type == "TEX_IMAGE":
            for link in n.inputs["Vector"].links:
                from_node = link.from_node
                if from_node.type == "UVMAP":
                    from_node.uv_map = uv_name
                    return
            uv = nt.nodes.new("ShaderNodeUVMap")
            uv.uv_map = uv_name
            uv.location = (-600, 200)
            nt.links.new(uv.outputs["UV"], n.inputs["Vector"])
            return


def flat_materials(ob, sample_uv_name):
    parts = []
    me = ob.data
    if not me.materials:
        me.materials.append(bpy.data.materials.new("Part_0"))
    me.uv_layers.active = me.uv_layers[UV_LAYER]
    for i, slot in enumerate(me.materials):
        if slot is None:
            slot = bpy.data.materials.new(f"Part_{i}")
            me.materials[i] = slot
        mat = slot
        if material_has_texture(mat):
            ensure_uv_map_node(mat, sample_uv_name)
            name = mat.name if mat.name else f"part_{i + 1}"
            parts.append({"material": mat.name, "part": name, "color": "textured"})
            continue
        mat.use_nodes = True
        nt = mat.node_tree
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(n)
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = nt.nodes.get("Material Output") or nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        rgb = DISTINCT_COLORS[i % len(DISTINCT_COLORS)]
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.85
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = UV_LAYER
        uv.location = (-400, 0)
        name = mat.name if mat.name and not mat.name.startswith("Material") else f"part_{i + 1}"
        hex_c = "#{:02x}{:02x}{:02x}".format(int(rgb[0] * 255), int(rgb[1] * 255), int(rgb[2] * 255))
        parts.append({"material": mat.name, "part": name, "color": hex_c})
    return parts


def set_active_uv_for_bake(ob):
    ob.data.uv_layers.active = ob.data.uv_layers[UV_LAYER]


def bake_image(ob, name, size, bake_type="COMBINED", margin=20):
    img = bpy.data.images.new(name, size, size, alpha=True)
    img.colorspace_settings.name = "sRGB"
    set_active_uv_for_bake(ob)
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
    if bake_type == "COMBINED":
        sc.render.bake.use_pass_direct = True
        sc.render.bake.use_pass_indirect = True
        sc.render.bake.use_pass_color = True
    bpy.ops.object.bake(type=bake_type)
    return img


def bake_mask(ob, size):
    backup = [slot.material for slot in ob.material_slots]
    white = bpy.data.materials.new("_mask_bake")
    white.use_nodes = True
    nt = white.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1, 1, 1, 1)
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    ob.data.materials.clear()
    ob.data.materials.append(white)
    img = bake_image(ob, "mask", size, bake_type="EMIT", margin=0)
    ob.data.materials.clear()
    for mat in backup:
        ob.data.materials.append(mat)
    bpy.data.materials.remove(white)
    return img


def save_png(img, path):
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


def prepare():
    src, out, object_name, size = parse_prepare_args(ARGS)
    os.makedirs(out, exist_ok=True)
    joined = []
    if src == "test":
        clear_scene()
        scene_light()
        ob = test_rock()
    elif os.path.splitext(src)[1].lower() == ".blend":
        if not os.path.isfile(src):
            raise SystemExit(f"Model not found: {src}")
        bpy.ops.wm.open_mainfile(filepath=src)
        scene_light()
        result = pick_object(object_name)
        if isinstance(result, tuple):
            ob, joined = result
        else:
            ob = result
    else:
        if not os.path.isfile(src):
            raise SystemExit(f"Model not found: {src}")
        clear_scene()
        scene_light()
        import_model(src)
        result = pick_object(object_name)
        if isinstance(result, tuple):
            ob, joined = result
        else:
            ob = result
    ob.name = "model"
    sample_uv = ensure_image_studio_uv(ob)
    parts = flat_materials(ob, sample_uv)
    guide = bake_image(ob, "guide", size, margin=20)
    guide_path = os.path.join(out, "guide.png")
    save_png(guide, guide_path)
    mask = bake_mask(ob, size)
    mask_path = os.path.join(out, "mask.png")
    save_png(mask, mask_path)
    with open(os.path.join(out, "parts.json"), "w", encoding="utf-8") as f:
        json.dump({"parts": parts}, f, indent=2)
    meta = {
        "object": ob.name,
        "uvLayer": UV_LAYER,
        "size": size,
        "model": src if src != "test" else "test",
        "joined": joined,
    }
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


def image_material(img, uv_name):
    mat = bpy.data.materials.new("preview_tex")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_name
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def render_views(ob, tile_w=512):
    sc = bpy.context.scene
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    ctr = sum(bb, Vector()) / 8
    span = max((b - ctr).length for b in bb) * 2.2
    sc.render.resolution_x = tile_w
    sc.render.resolution_y = tile_w
    sc.render.film_transparent = False
    views = [(35, 20), (145, 20)]
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
        tmp = os.path.join(bpy.app.tempdir, f"view_{az}.png")
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        shots.append(bpy.data.images.load(tmp))
        bpy.data.objects.remove(cam_obj)
        bpy.data.cameras.remove(cam)
    return shots


def stitch_rows(row_a, row_b, path):
    w, h = row_a[0].size
    comp = bpy.data.images.new("preview", w * 2, h * 2)
    out = [0.0] * (w * 2 * h * 2 * 4)
    for row, imgs in ((0, row_a), (1, row_b)):
        for col, img in enumerate(imgs):
            px = list(img.pixels)
            iw, ih = img.size
            for y in range(ih):
                for x in range(iw):
                    i0 = (y * iw + x) * 4
                    ox = col * w + x
                    oy = row * h + y
                    i1 = (oy * w * 2 + ox) * 4
                    out[i1 : i1 + 4] = px[i0 : i0 + 4]
    comp.pixels = out
    save_png(comp, path)
    for img in row_a + row_b:
        bpy.data.images.remove(img)


def apply():
    out, color_path = ARGS[0], ARGS[1]
    blend = os.path.join(out, "model.blend")
    if not os.path.isfile(blend):
        raise SystemExit(f"No model.blend in {out}")
    bpy.ops.wm.open_mainfile(filepath=blend)
    scene_light()
    ob = bpy.data.objects.get("model")
    if not ob:
        raise SystemExit('No object "model" in blend')
    meta = json.load(open(os.path.join(out, "prepare.json"), encoding="utf-8"))
    uv_name = meta["uvLayer"]
    guide_path = os.path.join(out, "guide.png")
    if not os.path.isfile(guide_path):
        parent = os.path.dirname(out.rstrip("/"))
        guide_path = os.path.join(parent, "guide.png")
    guide_img = bpy.data.images.load(guide_path) if os.path.isfile(guide_path) else None
    color_img = bpy.data.images.load(color_path)
    ob.data.materials.clear()
    if guide_img:
        ob.data.materials.append(image_material(guide_img, uv_name))
    before = render_views(ob)
    ob.data.materials.clear()
    ob.data.materials.append(textured_material(color_img, uv_name))
    after = render_views(ob)
    preview_path = os.path.join(out, "preview.png")
    stitch_rows(before, after, preview_path)
    before_path = os.path.join(out, "preview_before.png")
    if os.path.isfile(before_path):
        os.remove(before_path)
    bpy.ops.wm.save_as_mainfile(filepath=blend)


if MODE == "prepare":
    prepare()
elif MODE == "apply":
    apply()
else:
    raise SystemExit("Usage: prepare <model|test> <outDir> | apply <outDir> <color.png>")
