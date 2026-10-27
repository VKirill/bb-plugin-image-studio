"""Эксперимент «текстура по модели через Muse»: болванка развёртки и ракурсы для генерации, затем натяжка результата.

  Blender --factory-startup -b -P scripts/tex_guide.py -- guide <model.fbx|test> <out_dir>
      → <out>/model.blend, guide_uv.png (развёртка: затенённая форма, запечённая в UV + контуры островов),
        view_<n>.png (ракурсы серой модели со светом), views.json (камеры)
  Blender --factory-startup -b -P scripts/tex_guide.py -- apply_uv <out_dir> <texture.png>
      → render_uv.png: модель с текстурой Muse, нарисованной по развёртке
  Blender --factory-startup -b -P scripts/tex_guide.py -- apply_views <out_dir> <view_0.png> ...
      → baked_views.png (проекция перерисованных ракурсов на модель, запечённая в UV) и render_views.png
"""
import json, math, os, sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
MODE, ARGS = argv[0], argv[1:]
RES = 1024


def kit():
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "backdrop_kit.py")).read(), globals())


def test_rock():
    """Стопка из трёх стилизованных глыб из backdrop_kit, один меш."""
    kit()
    obs = [block("t0", (0, 0, 0), (30, 26, 22), yaw=0, seed=101), block("t1", (2, 1, 21), (26, 23, 18), yaw=12, seed=102),
           block("t2", (-1, 2, 38), (20, 18, 14), yaw=-8, seed=103, tilt=0.2)]
    for o in obs:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier="bevel")
        o.data.materials.clear()
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    return bpy.context.object


def scene_light():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.6
    ld = bpy.data.lights.new("sun", "SUN"); ld.energy = 3.0
    s = bpy.data.objects.new("sun", ld); sc.collection.objects.link(s)
    s.rotation_euler = (math.radians(40), 0, math.radians(210))


def grey_mat():
    m = bpy.data.materials.new("guide_grey"); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1); b.inputs["Roughness"].default_value = 0.9
    return m


def bake(ob, kind, name, margin=8):
    """Запечь в новое изображение RES×RES по UV объекта."""
    img = bpy.data.images.new(name, RES, RES)
    for m in ob.data.materials:
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = img
        nt.nodes.active = n
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    sc = bpy.context.scene
    if kind == "COMBINED":
        sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = True
    sc.render.bake.margin = margin
    bpy.ops.object.bake(type=kind)
    return img


def save(img, path):
    img.filepath_raw = path; img.file_format = "PNG"; img.save()


def guide(src, out):
    os.makedirs(out, exist_ok=True)
    scene_light()
    if src == "test":
        ob = test_rock()
    else:
        bpy.ops.import_scene.fbx(filepath=src)
        ob = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    ob.name = "model"
    ob.data.materials.clear(); ob.data.materials.append(grey_mat())
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    if not ob.data.uv_layers.active:
        if not ob.data.uv_layers:
            ob.data.uv_layers.new(name="UVMap")
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.03)
        bpy.ops.object.mode_set(mode="OBJECT")
    # развёртка-болванка: свет и тени формы, запечённые в UV, плюс тёмные контуры островов
    img = bake(ob, "COMBINED", "guide_uv")
    path = os.path.join(out, "guide_uv.png"); save(img, path)
    uv = ob.data.uv_layers.active.data  # контуры UV-полигонов — в json, рисует guide_overlay (без GPU в фоне)
    polys = [[list(uv[li].uv) for li in p.loop_indices] for p in ob.data.polygons]
    json.dump(polys, open(os.path.join(out, "uv_polys.json"), "w"))
    # ракурсы: 4 вокруг + сверху, ортогонально, кадр по габариту
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    ctr = sum(bb, Vector()) / 8
    size = max((b - ctr).length for b in bb) * 2.1
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.film_transparent = True
    views = []
    for k, (az, el) in enumerate([(0, 15), (90, 15), (180, 15), (270, 15), (0, 89)]):
        cam = bpy.data.objects.new(f"cam{k}", bpy.data.cameras.new(f"cam{k}")); sc.collection.objects.link(cam)
        cam.data.type = "ORTHO"; cam.data.ortho_scale = size
        d = Vector((math.cos(math.radians(el)) * math.sin(math.radians(az)), -math.cos(math.radians(el)) * math.cos(math.radians(az)), math.sin(math.radians(el))))
        cam.location = ctr + d * size * 2
        cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        sc.render.filepath = os.path.join(out, f"view_{k}.png")
        bpy.ops.render.render(write_still=True)
        views.append({"name": cam.name, "az": az, "el": el})
    json.dump({"views": views, "size": size, "center": list(ctr)}, open(os.path.join(out, "views.json"), "w"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "model.blend"))


def textured_mat(img):
    m = bpy.data.materials.new("muse_tex"); m.use_nodes = True
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.85
    return m


def hero_render(path):
    sc = bpy.context.scene
    ob = bpy.data.objects["model"]
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    ctr = sum(bb, Vector()) / 8
    cam = bpy.data.objects.new("hero", bpy.data.cameras.new("hero")); sc.collection.objects.link(cam)
    cam.data.lens = 50
    cam.location = ctr + Vector((60, -90, 55))
    cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam; sc.render.film_transparent = False
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def apply_uv(out, tex):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(out, "model.blend"))
    ob = bpy.data.objects["model"]
    img = bpy.data.images.load(tex)
    ob.data.materials.clear(); ob.data.materials.append(textured_mat(img))
    hero_render(os.path.join(out, "render_uv.png"))


def apply_views(out, imgs):
    """Каждый перерисованный ракурс проецируется своей камерой (UV Project), веса — по тому, насколько грань смотрит
    в камеру; смесь запекается в развёртку модели."""
    bpy.ops.wm.open_mainfile(filepath=os.path.join(out, "model.blend"))
    meta = json.load(open(os.path.join(out, "views.json")))
    ob = bpy.data.objects["model"]
    me = ob.data
    base_uv = me.uv_layers[0].name
    m = bpy.data.materials.new("proj"); m.use_nodes = True
    nt = m.node_tree; N, Lk = nt.nodes.new, nt.links.new
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    geo = N("ShaderNodeNewGeometry")
    acc_c, acc_w = None, None
    for k, path in enumerate(imgs):
        cam = bpy.data.objects[meta["views"][k]["name"]]
        uv = me.uv_layers.new(name=f"proj{k}")
        mod = ob.modifiers.new(f"uvp{k}", "UV_PROJECT"); mod.uv_layer = uv.name; mod.projector_count = 1
        mod.projectors[0].object = cam
        mod.aspect_x = mod.aspect_y = 1.0
        mod.scale_x = mod.scale_y = 1.0
        t = N("ShaderNodeTexImage"); t.image = bpy.data.images.load(path); t.extension = "CLIP"
        u = N("ShaderNodeUVMap"); u.uv_map = uv.name; Lk(u.outputs["UV"], t.inputs["Vector"])
        d = (cam.matrix_world.to_quaternion() @ Vector((0, 0, 1)))
        dot = N("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"; dot.inputs[1].default_value = d
        Lk(geo.outputs["Normal"], dot.inputs[0])
        pw = N("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 4.0
        cl = N("ShaderNodeMath"); cl.operation = "MAXIMUM"; cl.inputs[1].default_value = 0.0
        Lk(dot.outputs["Value"], cl.inputs[0]); Lk(cl.outputs["Value"], pw.inputs[0])
        w = N("ShaderNodeMath"); w.operation = "MULTIPLY"
        Lk(pw.outputs["Value"], w.inputs[0]); Lk(t.outputs["Alpha"], w.inputs[1])
        cw = N("ShaderNodeVectorMath"); cw.operation = "SCALE"
        Lk(t.outputs["Color"], cw.inputs[0]); Lk(w.outputs["Value"], cw.inputs["Scale"])
        if acc_c is None:
            acc_c, acc_w = cw.outputs["Vector"], w.outputs["Value"]
        else:
            ac = N("ShaderNodeVectorMath"); ac.operation = "ADD"; Lk(acc_c, ac.inputs[0]); Lk(cw.outputs["Vector"], ac.inputs[1]); acc_c = ac.outputs["Vector"]
            aw = N("ShaderNodeMath"); aw.operation = "ADD"; Lk(acc_w, aw.inputs[0]); Lk(w.outputs["Value"], aw.inputs[1]); acc_w = aw.outputs["Value"]
    eps = N("ShaderNodeMath"); eps.operation = "MAXIMUM"; eps.inputs[1].default_value = 1e-4; Lk(acc_w, eps.inputs[0])
    dv = N("ShaderNodeVectorMath"); dv.operation = "DIVIDE"; Lk(acc_c, dv.inputs[0])
    cmb = N("ShaderNodeCombineXYZ")
    for s in ("X", "Y", "Z"):
        Lk(eps.outputs["Value"], cmb.inputs[s])
    Lk(cmb.outputs["Vector"], dv.inputs[1])
    em = N("ShaderNodeEmission"); Lk(dv.outputs["Vector"], em.inputs["Color"])
    out_n = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"); Lk(em.outputs["Emission"], out_n.inputs["Surface"])
    ob.data.materials.clear(); ob.data.materials.append(m)
    bpy.context.view_layer.update()
    # запекание смеси в базовую развёртку
    me.uv_layers.active = me.uv_layers[base_uv]
    me.uv_layers[base_uv].active_render = True
    img = bpy.data.images.new("baked", RES, RES)
    tn = N("ShaderNodeTexImage"); tn.image = img; nt.nodes.active = tn
    un = N("ShaderNodeUVMap"); un.uv_map = base_uv; Lk(un.outputs["UV"], tn.inputs["Vector"])
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.context.scene.render.bake.margin = 8
    bpy.ops.object.bake(type="EMIT")
    save(img, os.path.join(out, "baked_views.png"))
    for md in list(ob.modifiers):
        ob.modifiers.remove(md)
    ob.data.materials.clear(); ob.data.materials.append(textured_mat(img))
    me.uv_layers.active = me.uv_layers[base_uv]
    hero_render(os.path.join(out, "render_views.png"))


if MODE == "guide":
    guide(ARGS[0], ARGS[1])
elif MODE == "apply_uv":
    apply_uv(ARGS[0], ARGS[1])
elif MODE == "apply_views":
    apply_views(ARGS[0], ARGS[1:])
