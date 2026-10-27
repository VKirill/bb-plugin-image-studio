"""Набор для ручной сборки задника Вулкана в живом Blender (через Blender MCP) по референсам Muse
assets/concept/arena/backdrop/: стилизованные глыбы (сколы + мягкая фаска), потоки лавы с объёмом, материалы.

В Blender: exec(open(".../scripts/backdrop_kit.py").read()) — затем block(), lava_flow(), pool(), materials().
1 единица Blender = 1 stud.
"""
import math, random

import bmesh
import bpy
from mathutils import Matrix, Vector


def _mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree, next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _hex(h):
    """sRGB hex → линейный RGBA для узлов."""
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def materials():
    """Камень и лава по палитре референса (notes/backdrop-production-brief.md): «рисованный» альбедо — верх глыб светлее,
    бока тёмные, щели почти чёрные (AO), светлые скругления рёбер (Pointiness, в Cycles и при запекании), мох на верхах,
    свой оттенок у каждой глыбы (атрибут tint), низ подсвечен лавой. Лава — оранжевая с жёлтыми бликами-завихрениями,
    тёмно-красная кайма, глянец."""
    if bpy.data.materials.get("bk_rock") and bpy.data.materials.get("bk_lava"):
        return bpy.data.materials["bk_rock"], bpy.data.materials["bk_lava"]
    m, nt, bsdf = _mat("bk_rock")
    N, Lk = nt.nodes.new, nt.links.new

    def mix(fac, a, b, blend="MIX"):
        x = N("ShaderNodeMix"); x.data_type = "RGBA"; x.blend_type = blend
        for i, v in ((0, fac), (6, a), (7, b)):
            if isinstance(v, (int, float)):
                x.inputs[i].default_value = v
            elif isinstance(v, tuple):
                x.inputs[i].default_value = v
            else:
                Lk(v, x.inputs[i])
        return x.outputs[2]

    def rng(src, a, b, lo=0.0, hi=1.0):
        r = N("ShaderNodeMapRange")
        r.inputs["From Min"].default_value, r.inputs["From Max"].default_value = a, b
        r.inputs["To Min"].default_value, r.inputs["To Max"].default_value = lo, hi
        Lk(src, r.inputs["Value"])
        return r.outputs["Result"]

    geo = N("ShaderNodeNewGeometry")
    sep = N("ShaderNodeSeparateXYZ"); Lk(geo.outputs["Normal"], sep.inputs["Vector"])
    col = mix(rng(sep.outputs["Z"], 0.25, 0.8), _hex("#16141A"), _hex("#3C3842"))  # бок → верх
    col = mix(rng(geo.outputs["Pointiness"], 0.51, 0.56), col, _hex("#6E6976"))  # блик ребра
    nz = N("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 0.35; nz.inputs["Detail"].default_value = 5
    col = mix(0.2, col, nz.outputs["Color"], "OVERLAY")
    ti = N("ShaderNodeAttribute"); ti.attribute_name = "tint"
    col = mix(1.0, col, ti.outputs["Color"], "MULTIPLY")
    mn = N("ShaderNodeTexNoise"); mn.inputs["Scale"].default_value = 0.22; mn.inputs["Detail"].default_value = 4
    moss = N("ShaderNodeMath"); moss.operation = "MULTIPLY"
    Lk(rng(sep.outputs["Z"], 0.8, 0.92), moss.inputs[0]); Lk(rng(mn.outputs["Fac"], 0.53, 0.57), moss.inputs[1])
    col = mix(moss.outputs["Value"], col, _hex("#5B6B2A"))
    ao = N("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = 2.5
    col = mix(rng(ao.outputs["AO"], 0.2, 0.9), _hex("#121014"), col)  # щели почти чёрные
    Lk(col, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.82
    bump = N("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.2
    Lk(nz.outputs["Fac"], bump.inputs["Height"]); Lk(bump.outputs["Normal"], bsdf.inputs["Normal"])
    sz = N("ShaderNodeSeparateXYZ"); Lk(geo.outputs["Position"], sz.inputs["Vector"])  # мировая высота
    bsdf.inputs["Emission Color"].default_value = _hex("#FF6A10")
    Lk(rng(sz.outputs["Z"], -6, 5, 0.6, 0.0), bsdf.inputs["Emission Strength"])

    lm, nt, bsdf = _mat("bk_lava")
    N, Lk = nt.nodes.new, nt.links.new
    tc = N("ShaderNodeTexCoord")
    sw = N("ShaderNodeTexNoise"); sw.inputs["Scale"].default_value = 0.045; sw.inputs["Detail"].default_value = 2
    sw.inputs["Distortion"].default_value = 1.2
    Lk(tc.outputs["Object"], sw.inputs["Vector"])
    ramp = N("ShaderNodeValToRGB"); e = ramp.color_ramp.elements
    e[0].position = 0.28; e[0].color = _hex("#B8280A")
    e[1].position = 0.75; e[1].color = _hex("#FFC845")
    e.new(0.45).color = _hex("#FF6A10")
    e.new(0.6).color = _hex("#FF8A1E")
    Lk(sw.outputs["Fac"], ramp.inputs["Fac"])
    Lk(ramp.outputs["Color"], bsdf.inputs["Base Color"]); Lk(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 2.2
    bsdf.inputs["Roughness"].default_value = 0.12
    return m, lm


def coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def block(name, center, size, yaw=0.0, seed=0, chops=5, tilt=0.12, collection="bk_parts", bevel=0.14):
    """Глыба: коробка size=(ш, г, в) с низом в center.z, поворот yaw (градусы), 2–4 скола углов плоскостями,
    наклонённый верх, мягкая фаска модификатором (3 сегмента). Возвращает объект."""
    rnd = random.Random(seed)
    w, d, h = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * d, (v.co.z + 0.5) * h))
        if v.co.z > h * 0.5:  # верх с наклоном
            v.co.z += v.co.x * tilt * rnd.uniform(-1, 1) + v.co.y * tilt * rnd.uniform(-1, 1)
    for _ in range(chops):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1.0))).normalized()
        ctr = Vector((0, 0, h / 2))
        far = max((v.co - ctr).dot(n) for v in bm.verts)
        co = ctr + n * far * rnd.uniform(0.62, 0.85)
        r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=n, clear_outer=True)
        bmesh.ops.contextual_create(bm, geom=[g for g in r["geom_cut"] if isinstance(g, bmesh.types.BMEdge)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    tint = rnd.uniform(0.75, 1.12)  # у каждой глыбы свой оттенок — стена не однотонная
    at = me.color_attributes.new("tint", "FLOAT_COLOR", "POINT")
    for d_ in at.data:
        d_.color = (tint, tint, tint * rnd.uniform(0.97, 1.05), 1)
    ob = bpy.data.objects.new(name, me)
    ob.location = Vector(center)
    ob.rotation_euler.z = math.radians(yaw)
    coll(collection).objects.link(ob)
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = min(w, d, h) * bevel
    mod.segments = 3
    mod.profile = 0.7
    mod.limit_method = "ANGLE"
    mod.harden_normals = True
    ob.data.materials.append(materials()[0])
    return ob


def lava_flow(name, points, width=3.0, thick=1.2, collection="bk_parts"):
    """Поток лавы по точкам (x, y, z[, r]) сверху вниз: лента постоянной горизонтальной ширины с горбом посередине.
    Ширина всегда горизонтальна (поперёк хода), поэтому на отвесных падениях лента — стена лавы лицом к арене,
    а не тонкая нить. Горб — наружу от склона (вверх на пологом, к арене на отвесном)."""
    pts = [Vector(q[:3]) for q in points]
    prof = [(-1.0, -0.6), (-0.75, 0.45), (-0.35, 0.9), (0.0, 1.0), (0.35, 0.9), (0.75, 0.45), (1.0, -0.6)]
    bm = bmesh.new()
    rings = []
    hdir = Vector((1, 0, 0))
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]
        d = b - a
        h = Vector((d.x, d.y, 0))
        if h.length > 0.5:
            hdir = h.normalized()
        side = Vector((-hdir.y, hdir.x, 0))
        fwd = d.normalized() if d.length > 1e-6 else hdir
        up = side.cross(fwd).normalized()  # нормаль ленты
        if up.z < 0 and abs(fwd.z) < 0.9:
            up = -up
        if abs(fwd.z) > 0.7:  # отвес: горб к арене (по ходу горизонтали)
            up = hdir
        r = points[i][3] if len(points[i]) > 3 else 1.0
        w = width / 2 * r
        rings.append([bm.verts.new((p + side * u * w + up * v * thick).to_tuple()) for u, v in prof])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(len(prof) - 1):
            bm.faces.new((r0[k], r0[k + 1], r1[k + 1], r1[k]))
    bm.normal_update()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    coll(collection).objects.link(ob)
    ob.data.materials.append(materials()[1])
    return ob


def pool(name, center, rx, ry, seed=0, collection="bk_parts"):
    """Озерцо лавы: неровный плоский купол."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    n = 28
    ring = []
    for k in range(n):
        a = 2 * math.pi * k / n
        f = 1 + rnd.uniform(-0.12, 0.12)
        ring.append(bm.verts.new((math.cos(a) * rx * f, math.sin(a) * ry * f, 0)))
    c = bm.verts.new((0, 0, 0.5))
    for k in range(n):
        bm.faces.new((c, ring[k], ring[(k + 1) % n]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    for _ in range(rnd.randint(2, 4)):  # пузыри-полусферы, как на референсе
        b = bmesh.new()
        rr = rnd.uniform(1.2, 2.6)
        bmesh.ops.create_uvsphere(b, u_segments=10, v_segments=5, radius=rr)
        a, f = rnd.uniform(0, 2 * math.pi), rnd.uniform(0, 0.7)
        off = Vector((math.cos(a) * rx * f, math.sin(a) * ry * f, 0.3))
        for v in list(b.verts):
            if v.co.z < -0.01:
                b.verts.remove(v)
        for v in b.verts:
            v.co += off
        tmp = bpy.data.meshes.new("_bub"); b.to_mesh(tmp); b.free()
        bm2 = bmesh.new(); bm2.from_mesh(me); bm2.from_mesh(tmp); bm2.to_mesh(me); bm2.free()
        bpy.data.meshes.remove(tmp)
    for p_ in me.polygons:
        p_.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.location = Vector(center)
    coll(collection).objects.link(ob)
    ob.data.materials.append(materials()[1])
    return ob


R_IN, ARC_DEG = 300.0, 45.0
ROWS = [(306, 0.08), (328, 0.3), (351, 0.58), (374, 0.86), (397, 1.0), (421, 0.6), (446, 0.25)]


def ridge_piece(name, seed, peaks=None, flows=None, bevel_segments=1):
    """Кусок кольца — дуга 45° вокруг +X (стыкуется с соседями поворотом на 45°): ряды стопок глыб от подножия к гребню
    и за него, гребень с 2–3 вершинами (к концам дуги сходится к общей высоте 70), 2–3 потока лавы по уступам с гребня
    к подножию, озерца у подножия, мелкие камни. Всё в коллекции name; возвращает (коллекцию, тops) для отладки."""
    rnd = random.Random(seed)
    half = math.radians(ARC_DEG / 2)
    peaks = peaks or [(rnd.uniform(-0.65, 0.65) * half, rnd.uniform(55, 110), rnd.uniform(0.2, 0.35) * half) for _ in range(rnd.choice((2, 3)))]
    flows = flows if flows is not None else [rnd.uniform(-0.6, 0.6) * half for _ in range(rnd.choice((2, 3)))]
    tops = {}

    def crest(th):
        e = max(0.0, min(1.0, (half - abs(th)) / (0.3 * half)))
        e = e * e * (3 - 2 * e)
        return 60 + e * max(ph * math.exp(-((th - pa) / pw) ** 2) for pa, ph, pw in peaks)

    def in_flow(th, r):
        return any(abs(th - (f + 0.02 * math.sin(r * 0.05 + k))) * r < 16 for k, f in enumerate(flows))

    k = 0
    for ri, (r, frac) in enumerate(ROWS):
        n = max(3, round(math.radians(ARC_DEG) * r / 27))
        for j in range(n):
            th = -half + (j + 0.5 + (0.5 if ri % 2 else 0) * (1 if j < n - 1 else 0)) * (2 * half / n)
            th += rnd.uniform(-0.15, 0.15) * (2 * half / n)
            if abs(th) > half:
                continue
            h = crest(th) * frac + rnd.uniform(-4, 4)
            gully = in_flow(th, r) and frac < 1.0
            if gully:
                h -= 10
            h = max(h, 3.0)
            c = Vector((math.cos(th) * r, math.sin(th) * r, 0))
            tops[(ri, j)] = (th, r, h)
            z = -8.0
            while h - z > 2.0:
                bh = rnd.uniform(20, 28) if h - z > 34 else h - z
                w = rnd.uniform(28, 34) * (1 - 0.08 * (z / max(h, 1))) * (0.7 if gully else 1.0)  # русло уже — соседи не закрывают лаву
                off = Vector((rnd.uniform(-1.0, 1.0), rnd.uniform(-1.0, 1.0), 0))
                ob = block(f"{name}_b{k}", (c.x + off.x, c.y + off.y, z), (w, rnd.uniform(25, 30), bh), yaw=math.degrees(th) + rnd.uniform(-12, 12),
                           seed=seed * 1000 + k, collection=name, tilt=0.15 if z + bh >= h - 0.5 else 0.05)
                ob.modifiers["bevel"].segments = bevel_segments
                ob.modifiers["bevel"].width = min(w, bh) * 0.12
                k += 1
                z += bh - 0.8 if h - z - bh > 0.1 else bh
    # потоки: по рядам от гребня к подножию, на верхах стопок, с уступа на уступ
    for fi, f in enumerate(flows):
        pts = []
        for ri in range(4, -1, -1):
            r = ROWS[ri][0]
            th = f + 0.02 * math.sin(r * 0.05 + fi)
            cand = [tops[key] for key in tops if key[0] == ri]
            h = min(cand, key=lambda t: abs(t[0] - th))[2]
            p = Vector((math.cos(th) * r, math.sin(th) * r, 0))
            back = Vector((math.cos(th), math.sin(th), 0)) * 14
            pts.append((*(p + back).to_tuple()[:2], h + 3.2, 1.0))
            pts.append((*(p - back).to_tuple()[:2], h + 3.0, 1.0))
        foot = Vector((math.cos(f) * (R_IN - 12), math.sin(f) * (R_IN - 12), 0))
        pts.append((foot.x, foot.y, 0.4, 1.3))
        lava_flow(f"{name}_lava{fi}", pts, width=rnd.uniform(14, 18), thick=1.6, collection=name)
        pool(f"{name}_pool{fi}", (foot.x, foot.y, 0.0), rnd.uniform(10, 14), rnd.uniform(7, 10), seed=seed + fi, collection=name)
    return coll(name), tops



def volcano_piece(name, seed, height=230.0, radius=200.0, flows=4):
    """Вулкан из глыб ярусами (как на референсе): кольца стопок вокруг кратера, высота падает к подножию, зубчатый край
    кратера, лава в кратере и потоки по склону к арене (−X), озерца у подножия. Центр в (0, 0)."""
    rnd = random.Random(seed)
    crater = radius * 0.18
    dirs = [math.pi + rnd.uniform(-0.8, 0.8) for _ in range(flows)]
    tops = []
    k = 0
    r = crater + 10
    ring = 0
    while r < radius:
        n = max(6, round(2 * math.pi * r / 30))
        for j in range(n):
            th = 2 * math.pi * (j + 0.5 * (ring % 2)) / n + rnd.uniform(-0.1, 0.1) * 2 * math.pi / n
            t = (r - crater) / (radius - crater)
            h = height * (1 - t) ** 1.2 + rnd.uniform(-5, 5)
            if r < crater + 25:
                h += rnd.uniform(6, 18)  # зубчатый край кратера
            near_flow = any(abs(math.atan2(math.sin(th - d), math.cos(th - d))) * r < 14 for d in dirs)
            if near_flow and r > crater + 25:
                h -= 10
            h = max(h, 4.0)
            c = Vector((math.cos(th) * r, math.sin(th) * r, 0))
            tops.append((th, r, h))
            # низ стопки закрыт следующим кольцом наружу — там одна высокая глыба, ступени только сверху
            t2 = min(1.0, (r + 26 - crater) / (radius - crater))
            hidden = height * (1 - t2) ** 1.2 - 8 if r + 26 < radius else -8.0
            z = -8.0
            if hidden > 10:
                ob = block(f"{name}_b{k}", (c.x, c.y, -8.0), (rnd.uniform(30, 36), rnd.uniform(27, 32), hidden + 8),
                           yaw=math.degrees(th), seed=seed * 1000 + k, collection=name, chops=2, tilt=0.0)
                ob.modifiers["bevel"].segments = 1
                k += 1
                z = hidden - 0.8
            while h - z > 2.0:
                bh = rnd.uniform(22, 30) if h - z > 38 else h - z
                w = rnd.uniform(30, 36)
                ob = block(f"{name}_b{k}", (c.x, c.y, z), (w, rnd.uniform(27, 32), bh), yaw=math.degrees(th) + rnd.uniform(-10, 10),
                           seed=seed * 1000 + k, collection=name, tilt=0.18 if h - z - bh < 0.1 else 0.05)
                ob.modifiers["bevel"].segments = 1
                ob.modifiers["bevel"].width = min(w, bh) * 0.12
                k += 1
                z += bh - 0.8 if h - z - bh > 0.1 else bh
        r += 26
        ring += 1
    pool(f"{name}_crater", (0, 0, height - 14), crater + 6, crater + 6, seed=seed, collection=name)
    for fi, d in enumerate(dirs):
        pts = [(math.cos(d) * crater * 0.6, math.sin(d) * crater * 0.6, height - 12, 1.0)]
        rr = crater + 10
        while rr < radius:
            cand = [t for t in tops if abs(t[1] - rr) < 1 and abs(math.atan2(math.sin(t[0] - d), math.cos(t[0] - d))) < 0.5]
            h = min(cand, key=lambda t: abs(math.atan2(math.sin(t[0] - d), math.cos(t[0] - d))))[2] if cand else 0
            for off in (14, -14):
                q = rr - off
                pts.append((math.cos(d) * q, math.sin(d) * q, h + 2.2, 1.0))
            rr += 26
        pts.append((math.cos(d) * (radius + 14), math.sin(d) * (radius + 14), 0.4, 1.3))
        lava_flow(f"{name}_lava{fi}", pts, width=rnd.uniform(14, 18), thick=1.6, collection=name)
        pool(f"{name}_pool{fi}", (math.cos(d) * (radius + 18), math.sin(d) * (radius + 18), 0), 14, 10, seed=seed + fi, collection=name)
    return coll(name)
