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
from bpy_extras.object_utils import world_to_camera_view
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


CONCEPT_VIEWS = ("front", "back", "left", "right")
VIEW_DIRS = {
    "front": Vector((0.0, -1.0, 0.0)),
    "back": Vector((0.0, 1.0, 0.0)),
    "left": Vector((-1.0, 0.0, 0.0)),
    "right": Vector((1.0, 0.0, 0.0)),
}


def parse_prepare_args(args):
    src = args[0]
    out = args[1]
    object_name = None
    size = 1024
    concept_path = None
    concept_view = "front"
    i = 2
    while i < len(args):
        if args[i] == "--object" and i + 1 < len(args):
            object_name = args[i + 1]
            i += 2
        elif args[i] == "--size" and i + 1 < len(args):
            size = int(args[i + 1])
            i += 2
        elif args[i] == "--concept" and i + 1 < len(args):
            concept_path = args[i + 1]
            i += 2
        elif args[i] == "--concept-view" and i + 1 < len(args):
            concept_view = args[i + 1]
            i += 2
        else:
            i += 1
    if size not in (1024, 2048):
        raise SystemExit("--size must be 1024 or 2048")
    if concept_view not in CONCEPT_VIEWS:
        raise SystemExit("--concept-view must be front, back, left or right")
    return src, out, object_name, size, concept_path, concept_view


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


def resolve_model_textures(model_path):
    model_dir = os.path.dirname(os.path.abspath(model_path))
    for img in bpy.data.images:
        if img.packed_file:
            continue
        raw = img.filepath or ""
        abs_path = bpy.path.abspath(raw) if raw else ""
        if abs_path and os.path.isfile(abs_path):
            if not image_has_pixels(img):
                img.reload()
            if image_has_pixels(img):
                continue
        names = []
        if raw:
            names.append(os.path.basename(raw.replace("\\", "/")))
        if img.name and img.name not in names:
            names.append(img.name)
        for fname in names:
            if not fname or fname == ".":
                continue
            candidate = os.path.join(model_dir, fname)
            if os.path.isfile(candidate):
                img.filepath = candidate
                img.reload()
                break


def apply_mesh_transforms(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


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


MARKER_GREY = (0.706, 0.706, 0.706)
MARKER_GREY_HEX = "#b4b4b4"
DEFAULT_BASE = (0.8, 0.8, 0.8)

HUE_KEYWORDS = (
    (("gold", "brass", "yellow"), 45.0),
    (("wood", "brown", "leather"), 30.0),
    (("red", "rubber", "fire", "lava"), 0.0),
    (("orange",), 25.0),
    (("green", "moss", "leaf"), 120.0),
    (("blue", "water", "ice"), 215.0),
    (("purple", "violet", "gem", "amethyst"), 280.0),
    (("pink",), 330.0),
)


def rgb_to_hex(rgb):
    return "#{:02x}{:02x}{:02x}".format(
        int(max(0, min(255, round(rgb[0] * 255)))),
        int(max(0, min(255, round(rgb[1] * 255)))),
        int(max(0, min(255, round(rgb[2] * 255)))),
    )


def read_principled_base_color(mat):
    if not mat or not mat.use_nodes:
        return DEFAULT_BASE
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return DEFAULT_BASE
    col = bsdf.inputs["Base Color"].default_value
    return (float(col[0]), float(col[1]), float(col[2]))


def is_default_base(rgb, tol=0.04):
    return all(abs(rgb[i] - DEFAULT_BASE[i]) < tol for i in range(3))


def hue_from_text(text):
    t = (text or "").lower()
    for words, hue in HUE_KEYWORDS:
        for word in words:
            if word in t:
                return hue
    return None


def collect_named_hues(labels):
    hues = []
    for material, part in labels:
        for field in (material, part):
            h = hue_from_text(field)
            if h is not None:
                hues.append(h)
    return hues


def hue_distance(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def hsl_to_rgb(h, s, l):
    h = (h % 360.0) / 360.0
    if s <= 0:
        return (l, l, l)
    q = l * (1 + s) if l < 0.5 else l + s - l * s
    p = 2 * l - q

    def channel(t):
        if t < 0:
            t += 1
        if t > 1:
            t -= 1
        if t < 1 / 6:
            return p + (q - p) * 6 * t
        if t < 1 / 2:
            return q
        if t < 2 / 3:
            return p + (q - p) * (2 / 3 - t) * 6
        return p

    return (channel(h + 1 / 3), channel(h), channel(h - 1 / 3))


def pick_marker_rgb(marker_index, reserved_hues):
    for step in range(72):
        h = (marker_index * 47.0 + step * 17.0) % 360.0
        if all(hue_distance(h, rh) >= 60.0 for rh in reserved_hues):
            return hsl_to_rgb(h, 0.85, 0.55)
    rgb = DISTINCT_COLORS[marker_index % len(DISTINCT_COLORS)]
    return rgb


def flat_materials(ob, sample_uv_name):
    parts = []
    me = ob.data
    if not me.materials:
        me.materials.append(bpy.data.materials.new("Part_0"))
    me.uv_layers.active = me.uv_layers[UV_LAYER]
    slots = []
    untextured_count = 0
    for i, slot in enumerate(me.materials):
        if slot is None:
            slot = bpy.data.materials.new(f"Part_{i}")
            me.materials[i] = slot
        mat = slot
        textured = material_has_texture(mat)
        if not textured:
            untextured_count += 1
        base_rgb = read_principled_base_color(mat) if not textured else None
        name = mat.name if mat.name and not mat.name.startswith("Material") else f"part_{i + 1}"
        slots.append({"mat": mat, "textured": textured, "base_rgb": base_rgb, "name": name, "index": i})
    single_marker = len(me.materials) == 1 and untextured_count == 1
    base_labels = [
        (s["mat"].name, s["name"])
        for s in slots
        if not s["textured"] and s["base_rgb"] is not None and not is_default_base(s["base_rgb"])
    ]
    reserved_hues = collect_named_hues(base_labels)
    marker_index = 0
    for s in slots:
        mat = s["mat"]
        i = s["index"]
        if s["textured"]:
            ensure_uv_map_node(mat, sample_uv_name)
            parts.append(
                {"material": mat.name, "part": s["name"], "color": "textured", "marker": False, "kind": "textured"}
            )
            continue
        mat.use_nodes = True
        nt = mat.node_tree
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(n)
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = nt.nodes.get("Material Output") or nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        if single_marker:
            rgb = MARKER_GREY
            marker = True
            kind = "marker"
        elif not is_default_base(s["base_rgb"]):
            rgb = s["base_rgb"]
            marker = False
            kind = "base"
        else:
            rgb = pick_marker_rgb(marker_index, reserved_hues)
            marker_index += 1
            marker = True
            kind = "marker"
        hex_c = MARKER_GREY_HEX if single_marker else rgb_to_hex(rgb)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.85
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = UV_LAYER
        uv.location = (-400, 0)
        parts.append({"material": mat.name, "part": s["name"], "color": hex_c, "marker": marker, "kind": kind})
    return parts


def set_active_uv_for_bake(ob):
    ob.data.uv_layers.active = ob.data.uv_layers[UV_LAYER]


def _principled_bsdf(nt):
    return next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)


def begin_guide_bake_materials(ob):
    """Neutralise metallic for the colour guide bake; keep normal maps."""
    states = []
    for slot in ob.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            states.append(None)
            continue
        nt = mat.node_tree
        bsdf = _principled_bsdf(nt)
        if not bsdf:
            states.append(None)
            continue
        state = {}
        met = bsdf.inputs.get("Metallic")
        if met:
            state["met_links"] = [link.from_socket for link in met.links]
            for link in list(met.links):
                nt.links.remove(link)
            state["met_val"] = met.default_value
            met.default_value = 0.0
        for key in ("Specular IOR Level", "Specular"):
            spec = bsdf.inputs.get(key)
            if spec:
                state["spec_key"] = key
                state["spec_val"] = spec.default_value
                spec.default_value = 0.15
                break
        states.append(state)
    return states


def end_guide_bake_materials(ob, states):
    for slot, state in zip(ob.material_slots, states):
        if not state:
            continue
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = _principled_bsdf(nt)
        if not bsdf:
            continue
        met = bsdf.inputs.get("Metallic")
        if met and "met_val" in state:
            met.default_value = state["met_val"]
            for from_sock in state.get("met_links", []):
                nt.links.new(from_sock, met)
        spec_key = state.get("spec_key")
        if spec_key:
            spec = bsdf.inputs.get(spec_key)
            if spec:
                spec.default_value = state["spec_val"]


def bake_image(ob, name, size, bake_type="COMBINED", margin=20):
    img = bpy.data.images.new(name, size, size, alpha=True)
    img.colorspace_settings.name = "sRGB"
    set_active_uv_for_bake(ob)
    bake_nodes = []
    for slot in ob.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.label = "_bake_target"
        tex.location = (900, 900)
        nt.nodes.active = tex
        bake_nodes.append((nt, tex))
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
    for nt, tex in bake_nodes:
        nt.nodes.remove(tex)
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


def object_bbox(ob):
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def _map_range(nt, val, lo, hi):
    node = nt.nodes.new("ShaderNodeMapRange")
    node.inputs["From Min"].default_value = lo
    node.inputs["From Max"].default_value = hi
    node.inputs["To Min"].default_value = 0.0
    node.inputs["To Max"].default_value = 1.0
    nt.links.new(val, node.inputs["Value"])
    return node.outputs["Result"]


def _concept_uv_nodes(nt, sep, view, bbox):
    xmin, xmax, ymin, ymax, zmin, zmax = bbox
    mx = _map_range(nt, sep.outputs["X"], xmin, xmax)
    my = _map_range(nt, sep.outputs["Y"], ymin, ymax)
    mz = _map_range(nt, sep.outputs["Z"], zmin, zmax)
    if view == "front":
        u, v = mx, mz
    elif view == "back":
        one = nt.nodes.new("ShaderNodeMath")
        one.operation = "SUBTRACT"
        one.inputs[0].default_value = 1.0
        nt.links.new(mx, one.inputs[1])
        u, v = one.outputs["Value"], mz
    elif view == "left":
        one = nt.nodes.new("ShaderNodeMath")
        one.operation = "SUBTRACT"
        one.inputs[0].default_value = 1.0
        nt.links.new(my, one.inputs[1])
        u, v = one.outputs["Value"], mz
    else:
        u, v = my, mz
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(u, comb.inputs["X"])
    nt.links.new(v, comb.inputs["Y"])
    comb.inputs["Z"].default_value = 0.0
    return comb.outputs["Vector"]


def apply_concept_projection(ob, concept_path, view):
    img = bpy.data.images.load(concept_path)
    img.colorspace_settings.name = "sRGB"
    bbox = object_bbox(ob)
    view_world = VIEW_DIRS[view]
    for slot in ob.material_slots:
        mat = slot.material
        if not mat:
            continue
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        base_in = bsdf.inputs["Base Color"]
        base_socket = base_in.links[0].from_socket if base_in.links else None
        if base_socket is None:
            base = nt.nodes.new("ShaderNodeRGB")
            base.outputs[0].default_value = base_in.default_value
            base_socket = base.outputs["Color"]
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.interpolation = "Linear"
        tex.extension = "CLIP"
        coord = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
        nt.links.new(_concept_uv_nodes(nt, sep, view, bbox), tex.inputs["Vector"])
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        dot = nt.nodes.new("ShaderNodeVectorMath")
        dot.operation = "DOT_PRODUCT"
        nt.links.new(geo.outputs["Normal"], dot.inputs[0])
        dot.inputs[1].default_value = view_world
        facing = nt.nodes.new("ShaderNodeMapRange")
        facing.inputs["From Min"].default_value = -0.05
        facing.inputs["From Max"].default_value = 0.25
        facing.inputs["To Min"].default_value = 0.0
        facing.inputs["To Max"].default_value = 1.0
        nt.links.new(dot.outputs["Value"], facing.inputs["Value"])
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MIX"
        nt.links.new(facing.outputs["Result"], mix.inputs["Fac"])
        nt.links.new(base_socket, mix.inputs["Color1"])
        nt.links.new(tex.outputs["Color"], mix.inputs["Color2"])
        if base_in.links:
            nt.links.remove(base_in.links[0])
        nt.links.new(mix.outputs["Color"], base_in)


def prepare():
    src, out, object_name, size, concept_path, concept_view = parse_prepare_args(ARGS)
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
        resolve_model_textures(src)
        result = pick_object(object_name)
        if isinstance(result, tuple):
            ob, joined = result
        else:
            ob = result
    apply_mesh_transforms(ob)
    ob.name = "model"
    sample_uv = ensure_image_studio_uv(ob)
    parts = flat_materials(ob, sample_uv)
    concept_used = False
    if concept_path and os.path.isfile(concept_path):
        apply_concept_projection(ob, concept_path, concept_view)
        concept_used = True
    guide_mat_state = begin_guide_bake_materials(ob)
    try:
        guide = bake_image(ob, "guide", size, margin=20)
    finally:
        end_guide_bake_materials(ob, guide_mat_state)
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
        "concept": concept_used,
        "conceptView": concept_view if concept_used else None,
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


def image_material(img, uv_name, unlit=False):
    mat = bpy.data.materials.new("preview_tex")
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_name
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    out = nt.nodes.get("Material Output")
    if unlit:
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Strength"].default_value = 1.0
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    else:
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def _clear_preview_lights():
    for name in ("preview_key", "preview_fill"):
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)
        light = bpy.data.lights.get(name)
        if light:
            bpy.data.lights.remove(light)


def _preview_lights(sc, cam_obj, ctr, view_dir):
    _clear_preview_lights()
    key = bpy.data.lights.new("preview_key", "SUN")
    key.energy = 4.5
    key_obj = bpy.data.objects.new("preview_key", key)
    sc.collection.objects.link(key_obj)
    key_obj.rotation_euler = view_dir.to_track_quat("Z", "Y").to_euler()
    fill = bpy.data.lights.new("preview_fill", "SUN")
    fill.energy = 2.5
    fill_obj = bpy.data.objects.new("preview_fill", fill)
    sc.collection.objects.link(fill_obj)
    fill_dir = (-view_dir + Vector((0.35, 0.2, 0.45))).normalized()
    fill_obj.rotation_euler = fill_dir.to_track_quat("Z", "Y").to_euler()


def _bbox_world_corners(ob):
    return [ob.matrix_world @ Vector(c) for c in ob.bound_box]


def _project_bounds(sc, cam_obj, points):
    xs, ys = [], []
    for p in points:
        co = world_to_camera_view(sc, cam_obj, p)
        xs.append(co.x)
        ys.append(co.y)
    return min(xs), max(xs), min(ys), max(ys)


def _preview_fit_points(ob):
    corners = _bbox_world_corners(ob)
    verts = [ob.matrix_world @ v.co for v in ob.data.vertices]
    return corners + verts


def _render_aspect(sc):
    return sc.render.resolution_x / max(sc.render.resolution_y, 1)


def _center_preview_camera(cam_obj, sc, points):
    cam = cam_obj.data
    cam.shift_x = 0.0
    cam.shift_y = 0.0
    xmin, xmax, ymin, ymax = _project_bounds(sc, cam_obj, points)
    cx = (xmin + xmax) * 0.5
    cy = (ymin + ymax) * 0.5
    rot = cam_obj.matrix_world.to_3x3()
    right = rot @ Vector((1.0, 0.0, 0.0))
    up = rot @ Vector((0.0, 1.0, 0.0))
    film_aspect = _render_aspect(sc)
    cam_obj.location += (-(cx - 0.5) * cam.ortho_scale * film_aspect) * right
    cam_obj.location += (-(cy - 0.5) * cam.ortho_scale) * up


def fit_preview_camera(cam_obj, sc, points, base_location, target_fill=0.80, film_aspect=1.0, target_y_scale=1.0):
    """Frame all fit points at ~target_fill of the tile with margin from edges."""
    cam = cam_obj.data
    cam.type = "ORTHO"
    cam.shift_x = 0.0
    cam.shift_y = 0.0
    xs = [p.x for p in points]
    ys = [p.y for p in points]
    zs = [p.z for p in points]
    diag = math.sqrt((max(xs) - min(xs)) ** 2 + (max(ys) - min(ys)) ** 2 + (max(zs) - min(zs)) ** 2)
    cam.ortho_scale = max(diag, 1e-3)
    target_extent = target_fill * 0.94 * target_y_scale
    edge_margin = 0.05
    for _ in range(28):
        cam_obj.location = base_location.copy()
        _center_preview_camera(cam_obj, sc, points)
        xmin, xmax, ymin, ymax = _project_bounds(sc, cam_obj, points)
        extent_x = xmax - xmin
        extent_y = ymax - ymin
        extent = max(extent_x, extent_y, 1e-9)
        margin_ok = (
            xmin >= edge_margin
            and xmax <= 1.0 - edge_margin
            and ymin >= edge_margin
            and ymax <= 1.0 - edge_margin
        )
        if margin_ok and extent <= target_extent:
            break
        scale = 1.03
        if extent > target_extent:
            scale = max(scale, extent / target_extent)
        if not margin_ok:
            scale = max(scale, 1.03)
        cam.ortho_scale *= scale
    for _ in range(24):
        cam_obj.location = base_location.copy()
        _center_preview_camera(cam_obj, sc, points)
        xmin, xmax, ymin, ymax = _project_bounds(sc, cam_obj, points)
        margin_ok = (
            xmin >= edge_margin
            and xmax <= 1.0 - edge_margin
            and ymin >= edge_margin
            and ymax <= 1.0 - edge_margin
        )
        if margin_ok:
            break
        cam.ortho_scale *= 1.05
    cam_obj.location = base_location.copy()
    _center_preview_camera(cam_obj, sc, points)


PREVIEW_TILE_H = 512
PREVIEW_QUAD = 512


def preview_tile_width(aspect):
    frac = max(0.35, min(1.0, aspect * 1.2))
    return max(32, int(PREVIEW_TILE_H * frac))


def _preview_view_dir(az, el):
    return Vector(
        (
            math.cos(math.radians(el)) * math.sin(math.radians(az)),
            -math.cos(math.radians(el)) * math.cos(math.radians(az)),
            math.sin(math.radians(el)),
        )
    ).normalized()


def _preview_aspect_for_view(sc, fit_points, ctr, radius, az, el):
    d = _preview_view_dir(az, el)
    cam = bpy.data.cameras.new("cam_probe")
    cam.type = "ORTHO"
    cam_obj = bpy.data.objects.new("cam_probe", cam)
    sc.collection.objects.link(cam_obj)
    base_loc = ctr + d * (radius * 4.0 + 1.0)
    cam_obj.location = base_loc
    cam_obj.rotation_euler = (ctr - cam_obj.location).to_track_quat("-Z", "Y").to_euler()
    fit_preview_camera(cam_obj, sc, fit_points, base_loc, target_fill=0.84, film_aspect=1.0)
    xmin, xmax, ymin, ymax = _project_bounds(sc, cam_obj, fit_points)
    aspect = (xmax - xmin) / max(ymax - ymin, 1e-9)
    bpy.data.objects.remove(cam_obj)
    bpy.data.cameras.remove(cam)
    return aspect, d, base_loc


def preview_slot_width(ob, tile_h=PREVIEW_TILE_H):
    sc = bpy.context.scene
    fit_points = _preview_fit_points(ob)
    corners = _bbox_world_corners(ob)
    ctr = sum(corners, Vector()) / 8
    radius = max((b - ctr).length for b in corners)
    aspects = []
    for az, el in [(35, 20), (145, 20)]:
        aspect, _, _ = _preview_aspect_for_view(sc, fit_points, ctr, radius, az, el)
        aspects.append(aspect)
    return preview_tile_width(min(aspects))


def render_views(ob, tile_h=PREVIEW_TILE_H, slot_w=None, unlit=False):
    sc = bpy.context.scene
    fit_points = _preview_fit_points(ob)
    corners = _bbox_world_corners(ob)
    ctr = sum(corners, Vector()) / 8
    radius = max((b - ctr).length for b in corners)
    sc.render.film_transparent = False
    views = [(35, 20), (145, 20)]
    view_setup = []
    for az, el in views:
        aspect, d, base_loc = _preview_aspect_for_view(sc, fit_points, ctr, radius, az, el)
        view_setup.append((az, el, aspect, d, base_loc))
    if slot_w is None:
        slot_w = preview_tile_width(min(a for _, _, a, _, _ in view_setup))
    film_aspect = slot_w / float(tile_h)
    shots = []
    sun = bpy.data.objects.get("sun")
    sun_energy = sun.data.energy if sun else None
    for az, el, _aspect, d, base_loc in view_setup:
        cam = bpy.data.cameras.new("cam")
        cam.type = "ORTHO"
        cam_obj = bpy.data.objects.new("cam", cam)
        sc.collection.objects.link(cam_obj)
        cam_obj.location = base_loc
        cam_obj.rotation_euler = (ctr - cam_obj.location).to_track_quat("-Z", "Y").to_euler()
        pad = 0.94
        sc.render.resolution_x = max(32, int(slot_w * pad))
        sc.render.resolution_y = max(32, int(tile_h * pad))
        fit_preview_camera(
            cam_obj, sc, fit_points, base_loc, target_fill=0.76, film_aspect=film_aspect, target_y_scale=1.0
        )
        if sun:
            sun.data.energy = 0.35 if not unlit else 0.0
        if not unlit:
            _preview_lights(sc, cam_obj, ctr, d)
        sc.camera = cam_obj
        tmp = os.path.join(bpy.app.tempdir, f"view_{az}.png")
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        shots.append((bpy.data.images.load(tmp), slot_w))
        bpy.data.objects.remove(cam_obj)
        bpy.data.cameras.remove(cam)
    _clear_preview_lights()
    if sun and sun_energy is not None:
        sun.data.energy = sun_energy
    return shots


def _blit_tile_centered(dst, dst_w, dst_h, ox, oy, quad_w, quad_h, img):
    px = list(img.pixels)
    iw, ih = img.size
    bg = px[0:3]
    for y in range(quad_h):
        for x in range(quad_w):
            i1 = ((oy + y) * dst_w + (ox + x)) * 4
            dst[i1 : i1 + 3] = bg
            dst[i1 + 3] = 1.0
    inset = max(6, int(min(quad_w, quad_h) * 0.028))
    off_x = ox + max(inset, (quad_w - iw) // 2)
    off_y = oy + max(inset, (quad_h - ih) // 2)
    for y in range(ih):
        for x in range(iw):
            i0 = (y * iw + x) * 4
            i1 = ((off_y + y) * dst_w + (off_x + x)) * 4
            dst[i1 : i1 + 4] = px[i0 : i0 + 4]


def stitch_rows(row_a, row_b, path):
    th = PREVIEW_TILE_H
    slot_w = max(tw for _, tw in row_a + row_b)
    comp_w = slot_w * 2
    comp_h = th * 2
    comp = bpy.data.images.new("preview", comp_w, comp_h)
    out = [0.0] * (comp_w * comp_h * 4)
    for row, imgs in ((0, row_a), (1, row_b)):
        for col, (img, _tw) in enumerate(imgs):
            _blit_tile_centered(out, comp_w, comp_h, col * slot_w, row * th, slot_w, th, img)
    comp.pixels = out
    save_png(comp, path)
    for img, _ in row_a + row_b:
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
        ob.data.materials.append(image_material(guide_img, uv_name, unlit=True))
    slot_w = preview_slot_width(ob)
    before = render_views(ob, slot_w=slot_w, unlit=True)
    ob.data.materials.clear()
    ob.data.materials.append(textured_material(color_img, uv_name))
    after = render_views(ob, slot_w=slot_w)
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
