# Builds the empty haunted-house level for Boo-Vac: model -> UV -> bake one texture -> export GLB + JPG.
# Run (headless):  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_house.py
# QUICK=1 in the environment = fast low-res test bake (writes to the scratch dir given by OUT, not the project).
import bpy, bmesh, math, os, random
import numpy as np
from mathutils import Vector, Matrix

ROOT = "/Users/ian/Local docs/ExpertCode/Boo-Vac"
QUICK = os.environ.get("QUICK") == "1"
OUT = os.environ.get("OUT", ROOT)
RES, SAMPLES = (1024, 32) if QUICK else (4096, 192)
LIGHT_K = float(os.environ.get("LIGHT_K", "24"))   # area-light watts per m² of room
random.seed(13)

T, h, H, DOOR, CW = 0.15, 0.075, 2.70, 2.10, 0.08   # wall thickness, half, ceiling, doorway height, casing width
UP = Vector((0, 0, 1))

# Rooms by wall centre lines (x0, x1, y0, y1); the visible inner area is h smaller on every side.
ROOMS = {
    'HALL': (-2, 2, -5, -2), 'PANTRY': (-6, -2, -5, -2), 'STUDY': (2, 6, -5, -2),
    'LIVING': (-6, -0.75, -2, 3.5), 'CORRIDOR': (-0.75, 0.75, -2, 3.5),
    'LIBRARY': (0.75, 6, -2, 3.5), 'GALLERY': (-6, 6, 3.5, 5),
}
PAPER = {'HALL': 'Wall_Hall', 'PANTRY': 'Wall_Pantry', 'STUDY': 'Wall_Study', 'LIVING': 'Wall_Living',
         'CORRIDOR': 'Wall_Corridor', 'LIBRARY': 'Wall_Library', 'GALLERY': 'Wall_Corridor'}
FLOOR = {'HALL': 'Floor_Checker', 'PANTRY': 'Floor_Tiles'}
# Walls: (constant axis, coord, start, end, gaps [(a, b, casing side '+' / '-' / 'both')], outer side sign)
# The two corridor openings are the corridor's full inner width (±0.675) and get a casing on the room side only.
WALLS = [
    ('y', -5, -6, 6, [], -1), ('y', 5, -6, 6, [], 1), ('x', -6, -5, 5, [], -1), ('x', 6, -5, 5, [], 1),
    ('y', -2, -6, 6, [(-0.675, 0.675, '-')], 0),
    ('x', -2, -5, -2, [(-4, -3, 'both')], 0),
    ('x', 2, -5, -2, [(-4, -3, 'both')], 0),
    ('x', -0.75, -2, 3.5, [(0, 1, 'both')], 0),
    ('x', 0.75, -2, 3.5, [(0, 1, 'both')], 0),
    ('y', 3.5, -6, 6, [(-0.675, 0.675, '+'), (-4.5, -3.5, 'both'), (3.5, 4.5, 'both')], 0),
]


# ---------------------------------------------------------------- materials
def put(nt, sock, v):
    if isinstance(v, bpy.types.NodeSocket):
        nt.links.new(v, sock)
    else:
        if sock.type == 'RGBA' and len(v) == 3:
            v = (*v, 1.0)
        sock.default_value = v


def node(nt, typ, inputs=None, **props):
    nd = nt.nodes.new(typ)
    for k, v in props.items():
        setattr(nd, k, v)
    for k, v in (inputs or {}).items():
        put(nt, nd.inputs[k], v)
    return nd


def math_(nt, op, a, b=0.0):
    return node(nt, 'ShaderNodeMath', {0: a, 1: b}, operation=op).outputs[0]


def maprange(nt, v, a, b, c=0.0, d=1.0):
    return node(nt, 'ShaderNodeMapRange', {'Value': v, 'From Min': a, 'From Max': b, 'To Min': c, 'To Max': d},
                interpolation_type='SMOOTHSTEP').outputs[0]


def mix(nt, f, a, b, blend='MIX'):
    nd = node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_factor=True)
    put(nt, nd.inputs['Factor'], f)
    put(nt, [s for s in nd.inputs if s.name == 'A' and s.type == 'RGBA'][0], a)
    put(nt, [s for s in nd.inputs if s.name == 'B' and s.type == 'RGBA'][0], b)
    return [s for s in nd.outputs if s.type == 'RGBA'][0]


def new_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    m.node_tree.nodes.clear()
    return m.node_tree


def finish(nt, col, emit=False):
    sh = node(nt, 'ShaderNodeEmission', {'Color': col, 'Strength': 1.0}) if emit else \
        node(nt, 'ShaderNodeBsdfDiffuse', {'Color': col, 'Roughness': 1.0})
    node(nt, 'ShaderNodeOutputMaterial', {'Surface': sh.outputs[0]})


def coords(nt):
    obj = node(nt, 'ShaderNodeTexCoord').outputs['Object']   # = world space (all transforms are identity)
    x, y, z = node(nt, 'ShaderNodeSeparateXYZ', {0: obj}).outputs
    uv = node(nt, 'ShaderNodeCombineXYZ', {'X': math_(nt, 'ADD', x, y), 'Y': z, 'Z': 0.0}).outputs[0]  # wall plane
    return obj, uv, z


def grime(nt, obj, uv, col, amt=0.45):
    blot = maprange(nt, node(nt, 'ShaderNodeTexNoise', {'Vector': obj, 'Scale': 0.9, 'Detail': 4.0}).outputs['Fac'], 0.5, 0.72, 0, amt)
    sv = node(nt, 'ShaderNodeVectorMath', {0: uv, 1: (7.0, 0.5, 1.0)}, operation='MULTIPLY').outputs[0]
    streak = maprange(nt, node(nt, 'ShaderNodeTexNoise', {'Vector': sv, 'Scale': 1.0, 'Detail': 2.0}).outputs['Fac'], 0.55, 0.75, 0, amt * 0.6)
    return mix(nt, math_(nt, 'ADD', blot, streak), col, (0.35, 0.3, 0.22), 'MULTIPLY')


def brick(nt, vec, c1, c2, mortar, w, rh, msize, offset=0.0):
    return node(nt, 'ShaderNodeTexBrick', {'Vector': vec, 'Color1': c1, 'Color2': c2, 'Mortar': mortar, 'Scale': 1.0,
                                           'Mortar Size': msize, 'Brick Width': w, 'Row Height': rh},
                offset=offset).outputs['Color']


def wallpaper(nt, uv, kind, base, motif, scale):
    if kind == 'tiles':
        return brick(nt, uv, base, motif, (0.3, 0.3, 0.28), 0.15, 0.15, 0.006)
    if kind == 'stripes':
        m = maprange(nt, node(nt, 'ShaderNodeTexWave', {'Vector': uv, 'Scale': scale, 'Distortion': 0.0},
                              wave_type='BANDS', bands_direction='X').outputs['Fac'], 0.6, 0.8, 0, 0.8)
    else:  # 'diamond' (manhattan voronoi grid) or 'dots' (euclidean)
        d = node(nt, 'ShaderNodeTexVoronoi', {'Vector': uv, 'Scale': scale, 'Randomness': 0.0},
                 distance='MANHATTAN' if kind == 'diamond' else 'EUCLIDEAN').outputs['Distance']
        m = maprange(nt, d, 0.3 if kind == 'diamond' else 0.2, 0.18 if kind == 'diamond' else 0.12, 0, 0.85)
    return mix(nt, m, base, motif)


def wall_mat(name, kind, base, motif, scale, lower=None):
    nt = new_mat(name)
    obj, uv, z = coords(nt)
    paper = wallpaper(nt, uv, kind, base, motif, scale)
    low = lower(nt, uv) if lower else brick(nt, uv, (0.10, 0.05, 0.025), (0.13, 0.065, 0.03), (0.03, 0.015, 0.008), 0.55, 0.45, 0.02)
    finish(nt, grime(nt, obj, uv, mix(nt, math_(nt, 'LESS_THAN', z, 0.95), paper, low)))


def noisy_mat(name, c1, c2, scale=3.0, dirt=False, emit=False):
    nt = new_mat(name)
    obj, uv, z = coords(nt)
    col = mix(nt, node(nt, 'ShaderNodeTexNoise', {'Vector': obj, 'Scale': scale, 'Detail': 3.0}).outputs['Fac'], c1, c2)
    finish(nt, grime(nt, obj, uv, col, 0.3) if dirt else col, emit)


def make_materials():
    wall_mat('Wall_Hall', 'diamond', (0.17, 0.008, 0.012), (0.28, 0.03, 0.025), 6.0)
    wall_mat('Wall_Living', 'stripes', (0.10, 0.14, 0.08), (0.16, 0.20, 0.12), 9.0)
    wall_mat('Wall_Library', 'diamond', (0.012, 0.02, 0.07), (0.05, 0.06, 0.13), 7.0)
    wall_mat('Wall_Study', 'dots', (0.42, 0.28, 0.04), (0.30, 0.18, 0.02), 9.0)
    wall_mat('Wall_Corridor', 'stripes', (0.17, 0.20, 0.25), (0.11, 0.13, 0.17), 12.0)
    wall_mat('Wall_Pantry', 'tiles', (0.75, 0.75, 0.70), (0.68, 0.70, 0.64), 0,
             lower=lambda nt, uv: brick(nt, uv, (0.08, 0.25, 0.12), (0.06, 0.20, 0.10), (0.3, 0.3, 0.28), 0.15, 0.15, 0.006))
    # floors
    nt = new_mat('Floor_Wood'); obj, uv, z = coords(nt)
    finish(nt, grime(nt, obj, obj, brick(nt, obj, (0.045, 0.022, 0.011), (0.075, 0.038, 0.018), (0.012, 0.006, 0.003), 1.4, 0.16, 0.006, 0.5), 0.35))
    nt = new_mat('Floor_Checker'); obj, uv, z = coords(nt)
    finish(nt, grime(nt, obj, obj, node(nt, 'ShaderNodeTexChecker', {'Vector': obj, 'Color1': (0.62, 0.6, 0.52), 'Color2': (0.015, 0.015, 0.015), 'Scale': 2.0}).outputs['Color'], 0.35))
    nt = new_mat('Floor_Tiles'); obj, uv, z = coords(nt)
    chk = node(nt, 'ShaderNodeTexChecker', {'Vector': obj, 'Color1': (0.55, 0.5, 0.4), 'Color2': (0.25, 0.06, 0.03), 'Scale': 1 / 0.3}).outputs['Color']
    finish(nt, grime(nt, obj, obj, brick(nt, obj, chk, chk, (0.25, 0.24, 0.22), 0.3, 0.3, 0.008), 0.3))
    noisy_mat('Plaster', (0.62, 0.60, 0.55), (0.52, 0.50, 0.45), 2.0, dirt=True)
    # trim, windows, decoration
    noisy_mat('Wood_Trim', (0.07, 0.035, 0.016), (0.11, 0.055, 0.025), 8.0)
    noisy_mat('Window_Frame', (0.40, 0.38, 0.34), (0.22, 0.20, 0.17), 6.0)
    noisy_mat('Window_Board', (0.16, 0.10, 0.055), (0.09, 0.055, 0.03), 12.0)
    noisy_mat('Window_Glow', (0.16, 0.26, 0.55), (0.10, 0.17, 0.40), 4.0, emit=True)
    noisy_mat('Frame_Gold', (0.55, 0.36, 0.08), (0.35, 0.22, 0.05), 25.0)
    noisy_mat('Frame_Dark', (0.06, 0.035, 0.02), (0.03, 0.018, 0.01), 10.0)
    noisy_mat('Canvas_A', (0.10, 0.12, 0.07), (0.28, 0.22, 0.12), 4.0)
    noisy_mat('Canvas_B', (0.08, 0.04, 0.02), (0.22, 0.14, 0.08), 3.0)
    noisy_mat('Canvas_C', (0.06, 0.09, 0.12), (0.20, 0.24, 0.26), 5.0)
    noisy_mat('Clock_Face', (0.72, 0.66, 0.50), (0.55, 0.48, 0.32), 6.0)
    noisy_mat('Iron_Black', (0.02, 0.02, 0.02), (0.035, 0.03, 0.03), 5.0)
    noisy_mat('Crack', (0.02, 0.016, 0.012), (0.04, 0.03, 0.02), 5.0)
    # signature (no grime, must stay readable)
    noisy_mat('Portrait_BG', (0.012, 0.016, 0.05), (0.03, 0.04, 0.10), 3.0)
    noisy_mat('Portrait_Floor', (0.05, 0.03, 0.07), (0.07, 0.045, 0.09), 6.0)
    noisy_mat('Ghost_White', (0.85, 0.90, 0.95), (0.78, 0.84, 0.92), 6.0)
    noisy_mat('Ghost_Dark', (0.015, 0.015, 0.025), (0.02, 0.02, 0.03), 6.0)
    noisy_mat('Ghost_Pink', (0.80, 0.35, 0.42), (0.75, 0.30, 0.38), 6.0)
    noisy_mat('Moon', (0.90, 0.85, 0.55), (0.80, 0.74, 0.45), 8.0)
    noisy_mat('Hose_Grey', (0.25, 0.27, 0.30), (0.20, 0.22, 0.25), 8.0)
    noisy_mat('Vacuum_Red', (0.60, 0.05, 0.04), (0.50, 0.04, 0.03), 8.0)
    noisy_mat('Brass', (0.62, 0.44, 0.16), (0.52, 0.36, 0.12), 30.0)
    noisy_mat('Engraving', (0.035, 0.025, 0.015), (0.045, 0.03, 0.02), 30.0)


# ---------------------------------------------------------------- geometry helpers
class Builder:
    def __init__(s, name):
        s.name, s.bm, s.mats = name, bmesh.new(), []

    def mi(s, mat):
        if mat not in s.mats:
            s.mats.append(mat)
        return s.mats.index(mat)

    def finish(s):
        me = bpy.data.meshes.new(s.name)
        s.bm.normal_update()
        s.bm.to_mesh(me)
        s.bm.free()
        for m in s.mats:
            me.materials.append(bpy.data.materials[m])
        ob = bpy.data.objects.new(s.name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


class Face:
    """A local frame on a surface: s = right, t = up (in the surface), d = out of the surface (normal n)."""
    def __init__(s, o, n, u=UP):
        s.o, s.n, s.u = Vector(o), Vector(n), Vector(u)
        s.r = s.u.cross(s.n)            # r x u = n (right-handed)

    def p(s, sx, t, d=0.0):
        return s.o + s.r * sx + s.u * t + s.n * d


def wall_face(axis, coord, nsign, along):
    if axis == 'x':
        return Face((coord, along, 0), (nsign, 0, 0))
    return Face((along, coord, 0), (0, nsign, 0))


def _faces_of(verts):
    return list({f for v in verts for f in v.link_faces})


def obox(B, center, ax, ay, az, mat):
    """Box with full edge vectors ax, ay, az. mat: name, or f(face) -> name / None (None = delete that face)."""
    M = Matrix((ax, ay, az)).transposed().to_4x4()
    M.translation = center
    faces = _faces_of(bmesh.ops.create_cube(B.bm, size=1.0, matrix=M)['verts'])
    if M.determinant() < 0:
        bmesh.ops.reverse_faces(B.bm, faces=faces)
    kill = []
    for f in faces:
        f.normal_update()
        m = mat(f) if callable(mat) else mat
        if m is None:
            kill.append(f)
        else:
            f.material_index = B.mi(m)
    if kill:
        bmesh.ops.delete(B.bm, geom=kill, context='FACES')


def hidden(f):
    """Faces lying on the floor or against the ceiling are never seen."""
    c = f.calc_center_median()
    return abs(f.normal.z) > 0.5 and (c.z < 0.001 or c.z > H - 0.001)


def aabox(B, mn, mx, mat, back=None):
    """Axis-aligned box; back = normal of the face to delete (the side touching the wall)."""
    mn, mx = Vector(mn), Vector(mx)
    def pick(f):
        if hidden(f) or (back is not None and f.normal.dot(back) > 0.9):
            return None
        return mat(f) if callable(mat) else mat
    obox(B, (mn + mx) / 2, Vector((mx.x - mn.x, 0, 0)), Vector((0, mx.y - mn.y, 0)), Vector((0, 0, mx.z - mn.z)), pick)


def rot2(s, t, a, ps=0.0, pt=0.0):
    c, n = math.cos(a), math.sin(a)
    s, t = s - ps, t - pt
    return ps + s * c - t * n, pt + s * n + t * c


def fbox(B, F, s0, s1, t0, t1, d0, d1, mat, rot=0.0, pivot=None):
    """Box in a Face frame (s, t range, depth d0..d1 out of the surface), optionally rotated around n."""
    a = math.radians(rot)
    sc, tc = (s0 + s1) / 2, (t0 + t1) / 2
    if pivot:
        sc, tc = rot2(sc, tc, a, *pivot)
    r = F.r * math.cos(a) + F.u * math.sin(a)
    u = -F.r * math.sin(a) + F.u * math.cos(a)
    obox(B, F.p(sc, tc, (d0 + d1) / 2), r * (s1 - s0), u * (t1 - t0), F.n * (d1 - d0),
         lambda f: None if f.normal.dot(F.n) < -0.9 else mat)


def fpoly(B, F, pts, d, mat, cs=0.0, ct=0.0):
    f = B.bm.faces.new([B.bm.verts.new(F.p(cs + s, ct + t, d)) for s, t in pts])
    f.normal_update()
    if f.normal.dot(F.n) < 0:
        f.normal_flip()
    f.material_index = B.mi(mat)


def fdisc(B, F, cs, ct, r, d0, d1, mat, side=None, segs=24):
    M = Matrix((F.r, F.u, F.n)).transposed().to_4x4()
    M.translation = F.p(cs, ct, (d0 + d1) / 2)
    faces = _faces_of(bmesh.ops.create_cone(B.bm, cap_ends=True, segments=segs, radius1=r, radius2=r,
                                            depth=d1 - d0, matrix=M)['verts'])
    kill = []
    for f in faces:
        f.normal_update()
        k = f.normal.dot(F.n)
        if k < -0.9:
            kill.append(f)
        else:
            f.material_index = B.mi(mat if k > 0.9 or side is None else side)
    bmesh.ops.delete(B.bm, geom=kill, context='FACES')


def fstrip(B, F, pts, w, d, mat, cs=0.0, ct=0.0):
    for (s0, t0), (s1, t1) in zip(pts, pts[1:]):
        L = math.hypot(s1 - s0, t1 - t0) or 1
        ps, pt = -(t1 - t0) / L * w / 2, (s1 - s0) / L * w / 2
        fpoly(B, F, [(s0 - ps, t0 - pt), (s1 - ps, t1 - pt), (s1 + ps, t1 + pt), (s0 + ps, t0 + pt)], d, mat, cs, ct)


def ellipse(cx, cy, rx, ry, n=20, a0=0.0, a1=2 * math.pi):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / n), cy + ry * math.sin(a0 + (a1 - a0) * i / n))
            for i in range(n if a1 - a0 >= 2 * math.pi - 1e-6 else n + 1)]


def rect(s0, s1, t0, t1):
    return [(s0, t0), (s1, t0), (s1, t1), (s0, t1)]


def ring(B, F, sc, tc, w, ht, width, d0, d1, mat, rot=0.0):
    """Rectangular frame of 4 bars, outer size w x ht, centred on (sc, tc)."""
    s0, s1, t0, t1 = sc - w / 2, sc + w / 2, tc - ht / 2, tc + ht / 2
    pv = (sc, tc)
    fbox(B, F, s0, s1, t1 - width, t1, d0, d1, mat, rot, pv)
    fbox(B, F, s0, s1, t0, t0 + width, d0, d1, mat, rot, pv)
    fbox(B, F, s0, s0 + width, t0 + width, t1 - width, d0, d1, mat, rot, pv)
    fbox(B, F, s1 - width, s1, t0 + width, t1 - width, d0, d1, mat, rot, pv)


def picture(B, F, tc, w, ht, frame, canvas, rot=0.0, width=0.05):
    ring(B, F, 0, tc, w, ht, width, 0, 0.03, frame, rot)
    a = math.radians(rot)
    pts = [rot2(s, t, a, 0, tc) for s, t in rect(-w / 2 + width, w / 2 - width, tc - ht / 2 + width, tc + ht / 2 - width)]
    fpoly(B, F, pts, 0.008, canvas)


def window(B, F, zc=1.65, w=1.0, ht=1.2):
    fpoly(B, F, rect(-w / 2, w / 2, zc - ht / 2, zc + ht / 2), 0.004, 'Window_Glow')
    ring(B, F, 0, zc, w + 0.14, ht + 0.14, 0.07, 0, 0.035, 'Window_Frame')
    fbox(B, F, -0.0175, 0.0175, zc - ht / 2, zc + ht / 2, 0.004, 0.025, 'Window_Frame')
    fbox(B, F, -w / 2, w / 2, zc - 0.0175, zc + 0.0175, 0.004, 0.025, 'Window_Frame')
    fbox(B, F, -w / 2 - 0.12, w / 2 + 0.12, zc - ht / 2 - 0.11, zc - ht / 2 - 0.07, 0, 0.05, 'Window_Frame')
    for dt, ang in ((0.38, 7), (0.02, -5), (-0.36, 9)):
        t = zc + dt * ht
        fbox(B, F, -w / 2 - 0.1, w / 2 + 0.1, t - 0.065, t + 0.065, 0.034, 0.046, 'Window_Board', ang)
        for side in (-1, 1):
            ns, nt_ = rot2(side * (w / 2 + 0.03), t, math.radians(ang), 0, t)
            fbox(B, F, ns - 0.007, ns + 0.007, nt_ - 0.007, nt_ + 0.007, 0.046, 0.05, 'Iron_Black')


def clock(B, F, zc, r=0.2):
    fdisc(B, F, 0, zc, r, 0, 0.03, 'Frame_Dark')
    fdisc(B, F, 0, zc, r * 0.85, 0.03, 0.033, 'Clock_Face')
    for i in range(12):
        a = math.radians(i * 30)
        fbox(B, F, -0.005, 0.005, zc + r * 0.62, zc + r * 0.74, 0.033, 0.036, 'Iron_Black', i * 30, (0, zc))
    fbox(B, F, -0.007, 0.007, zc, zc + r * 0.45, 0.036, 0.04, 'Iron_Black', 2, (0, zc))      # hour hand ~ 11:58
    fbox(B, F, -0.005, 0.005, zc, zc + r * 0.68, 0.04, 0.043, 'Iron_Black', 12, (0, zc))     # minute hand
    fdisc(B, F, 0, zc, 0.012, 0.043, 0.046, 'Iron_Black', segs=10)


def crack(B, F, s, t, steps=9, ang=-75.0):
    pts, a = [(s, t)], math.radians(ang)
    for _ in range(steps):
        a += random.uniform(-0.7, 0.7)
        s, t = s + 0.05 * math.cos(a), t + 0.05 * math.sin(a)
        pts.append((s, t))
    fstrip(B, F, pts, 0.008, 0.002, 'Crack')
    k = len(pts) // 2
    fstrip(B, F, [pts[k], (pts[k][0] + 0.06, pts[k][1] - 0.03), (pts[k][0] + 0.1, pts[k][1] - 0.08)], 0.006, 0.0022, 'Crack')


def subtract(span, cuts):
    out, (a, b) = [], span
    for c0, c1 in sorted(cuts):
        if c0 > a:
            out.append((a, min(c0, b)))
        a = max(a, c1)
    if a < b:
        out.append((a, b))
    return [(p, q) for p, q in out if q - p > 1e-4]


def room_at(x, y):
    for r, (x0, x1, y0, y1) in ROOMS.items():
        if x0 + h - 1e-4 <= x <= x1 - h + 1e-4 and y0 + h - 1e-4 <= y <= y1 - h + 1e-4:
            return r


# ---------------------------------------------------------------- the house
WALL_RECTS = []   # 2D footprints, only used to draw wall tops in the plan preview


def build_walls():
    B = Builder('House_Walls')
    XL = sorted({w[1] for w in WALLS if w[0] == 'x'})
    YL = sorted({w[1] for w in WALLS if w[0] == 'y'})
    for axis, c, a, b, gaps, outer in WALLS:
        def mat(f, axis=axis, outer=outer):
            n, ctr = f.normal, f.calc_center_median()
            if n.z > 0.5 or (n.z < -0.5 and ctr.z < 0.001):
                return None                                   # tops (under the ceiling) and bottoms (on the floor)
            if outer and (n.x if axis == 'x' else n.y) * outer > 0.5:
                return None                                   # outside of the house
            p = ctr + n * 0.1
            r = room_at(p.x, p.y)
            return PAPER[r] if r else 'Wood_Trim'             # door reveals and lintel undersides are wood
        cuts = sorted({a, b, *[p for p in (XL if axis == 'y' else YL) if a < p < b], *[g for gp in gaps for g in gp[:2]]})
        across = (c - h, c + h) if not outer else tuple(sorted((c - outer * h, c)))
        for p, q in zip(cuts, cuts[1:]):
            z0 = DOOR if any(g0 <= p and q <= g1 for g0, g1, _ in gaps) else 0.0
            if axis == 'y':
                mn, mx = (p, across[0], z0), (q, across[1], H)
            else:
                mn, mx = (across[0], p, z0), (across[1], q, H)
            obox(B, (Vector(mn) + Vector(mx)) / 2, Vector((mx[0] - mn[0], 0, 0)), Vector((0, mx[1] - mn[1], 0)),
                 Vector((0, 0, mx[2] - mn[2])), mat)
            if z0 == 0:
                WALL_RECTS.append((mn[0], mx[0], mn[1], mx[1]))

    # skirting, chair rail, crown molding and door casings along every room side
    def strip(axis, f, ns, p, q, z0, z1, d):
        n = Vector((ns, 0, 0)) if axis == 'x' else Vector((0, ns, 0))
        lo, hi = sorted((f, f + ns * d))
        mn, mx = ((p, lo, z0), (q, hi, z1)) if axis == 'y' else ((lo, p, z0), (hi, q, z1))
        aabox(B, mn, mx, 'Wood_Trim', back=-n)

    for r, (x0, x1, y0, y1) in ROOMS.items():
        ix0, ix1, iy0, iy1 = x0 + h, x1 - h, y0 + h, y1 - h
        for axis, c, f, ns, s0, s1 in (('y', y0, iy0, 1, ix0, ix1), ('y', y1, iy1, -1, ix0, ix1),
                                        ('x', x0, ix0, 1, iy0, iy1), ('x', x1, ix1, -1, iy0, iy1)):
            gaps = [g for w in WALLS if w[0] == axis and abs(w[1] - c) < 1e-6 for g in w[4] if g[0] < s1 and g[1] > s0]
            cased = [g for g in gaps if g[2] in ('both', '+' if ns > 0 else '-')]
            cuts = [(g[0] - CW, g[1] + CW) if g in cased else (g[0], g[1]) for g in gaps]
            for z0, z1, d in ((0, 0.14, 0.02), (0.92, 0.96, 0.03)):
                for p, q in subtract((s0, s1), cuts):
                    strip(axis, f, ns, p, q, z0, z1, d)
            strip(axis, f, ns, s0, s1, 2.60, H, 0.045)
            for g0, g1, _ in cased:
                strip(axis, f, ns, g0 - CW, g0, 0, DOOR, 0.05)
                strip(axis, f, ns, g1, g1 + CW, 0, DOOR, 0.05)
                strip(axis, f, ns, g0 - CW, g1 + CW, DOOR, DOOR + CW, 0.05)

    # fake windows on the outer walls
    for y in (-0.4, 2.0):
        window(B, wall_face('x', -6 + h, 1, y))      # living room
        window(B, wall_face('x', 6 - h, -1, y))      # library
    window(B, wall_face('y', -5 + h, 1, 4.0))        # study
    window(B, wall_face('y', -5 + h, 1, -4.0))       # pantry

    # flat wall decoration
    picture(B, wall_face('y', -2 + h, 1, -3.4), 1.65, 1.0, 0.7, 'Frame_Dark', 'Canvas_A')          # living, south
    clock(B, wall_face('y', 3.5 - h, -1, -2.0), 1.85)                                                # living, north
    crack(B, wall_face('x', -0.75 - h, -1, 2.6), 0.0, 2.3)                                           # living, east
    picture(B, wall_face('y', -2 + h, 1, 2.6), 1.6, 0.45, 0.6, 'Frame_Gold', 'Canvas_B')             # library, south
    picture(B, wall_face('y', -2 + h, 1, 4.2), 1.6, 0.45, 0.6, 'Frame_Gold', 'Canvas_B', rot=4)
    crack(B, wall_face('y', 3.5 - h, -1, 2.0), 0.0, 2.2)                                             # library, north
    picture(B, wall_face('y', -2 - h, -1, 4.0), 1.6, 0.7, 0.5, 'Frame_Dark', 'Canvas_C')             # study, north
    picture(B, wall_face('x', 6 - h, -1, -3.5), 1.7, 0.4, 0.5, 'Frame_Gold', 'Canvas_A', rot=-3)     # study, east
    crack(B, wall_face('x', -6 + h, 1, -3.5), 0.0, 2.0)                                              # pantry, west
    clock(B, wall_face('y', -2 - h, -1, 1.34), 1.75)                                                 # hall, right of corridor
    crack(B, wall_face('y', -5 + h, 1, 1.0), 0.0, 2.1, ang=-100)                                     # hall, south
    picture(B, wall_face('x', 0.75 - h, -1, 2.4), 1.6, 0.4, 0.5, 'Frame_Dark', 'Canvas_C', rot=6)    # corridor
    picture(B, wall_face('x', -0.75 + h, 1, -1.0), 1.6, 0.4, 0.5, 'Frame_Gold', 'Canvas_B')
    for x, w, ht, fr, cv, rt in ((-4.6, 0.6, 0.8, 'Frame_Gold', 'Canvas_B', 0), (-2.3, 0.9, 0.6, 'Frame_Dark', 'Canvas_A', 0),
                                 (0.0, 0.7, 0.9, 'Frame_Gold', 'Canvas_C', 0), (2.3, 0.5, 0.7, 'Frame_Dark', 'Canvas_B', 0),
                                 (4.6, 0.8, 0.6, 'Frame_Gold', 'Canvas_A', -3)):
        picture(B, wall_face('y', 5 - h, -1, x), 1.6, w, ht, fr, cv, rt)                              # gallery, north
    crack(B, wall_face('y', 5 - h, -1, -5.5), 0.0, 2.4)
    return B.finish()


def build_floors_ceilings():
    F, C = Builder('House_Floors'), Builder('House_Ceilings')
    for r, (x0, x1, y0, y1) in ROOMS.items():
        cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
        fpoly(F, Face((cx, cy, 0), UP, (0, 1, 0)), rect(-w / 2, w / 2, -d / 2, d / 2), 0, FLOOR.get(r, 'Floor_Wood'))
        cf = Face((cx, cy, H), (0, 0, -1), (0, -1, 0))
        fpoly(C, cf, rect(-w / 2, w / 2, -d / 2, d / 2), 0, 'Plaster')
        fdisc(C, cf, 0, 0, 0.28, 0, 0.02, 'Plaster', segs=24)            # ceiling rose (no lamp)
        fdisc(C, cf, 0, 0, 0.17, 0.02, 0.04, 'Plaster', segs=20)
        fdisc(C, cf, 0, 0, 0.05, 0.04, 0.05, 'Plaster', segs=12)
    return F.finish(), C.finish()


def build_signature():
    B = Builder('House_Signature')
    F = wall_face('y', -2 - h, -1, -1.38)            # hall north wall, facing south
    # ornate gold frame 0.60 x 0.80, centre Z 1.60
    ring(B, F, 0, 1.60, 0.60, 0.80, 0.08, 0, 0.03, 'Frame_Gold')
    ring(B, F, 0, 1.60, 0.49, 0.69, 0.025, 0.03, 0.045, 'Frame_Gold')   # raised inner molding
    ring(B, F, 0, 1.60, 0.60, 0.80, 0.02, 0.03, 0.04, 'Frame_Gold')     # outer lip
    for s in (-0.26, 0.26):
        for t in (1.24, 1.96):
            fdisc(B, F, s, t, 0.03, 0.03, 0.048, 'Frame_Gold', segs=12)
    fdisc(B, F, 0, 2.0, 0.06, 0.025, 0.045, 'Frame_Gold', segs=16)      # crest
    fdisc(B, F, 0, 2.0, 0.03, 0.045, 0.05, 'Brass', segs=12)
    # painted scene, local coords around the canvas centre (0, 1.60)
    ct = 1.60
    fpoly(B, F, rect(-0.22, 0.22, -0.32, 0.32), 0.012, 'Portrait_BG', 0, ct)
    fpoly(B, F, rect(-0.22, 0.22, -0.32, -0.26), 0.013, 'Portrait_Floor', 0, ct)
    fpoly(B, F, ellipse(-0.14, 0.22, 0.045, 0.045), 0.013, 'Moon', 0, ct)
    for s, t in ((0.12, 0.25), (0.17, 0.12), (-0.04, 0.27), (0.03, 0.19), (-0.18, 0.06), (0.19, 0.28)):
        fpoly(B, F, [(s, t - 0.009), (s + 0.006, t), (s, t + 0.009), (s - 0.006, t)], 0.013, 'Moon', 0, ct)
    fpoly(B, F, ellipse(-0.13, -0.235, 0.055, 0.035, 16), 0.015, 'Vacuum_Red', 0, ct)              # canister
    for s in (-0.165, -0.095):
        fpoly(B, F, ellipse(s, -0.268, 0.014, 0.014, 10), 0.016, 'Ghost_Dark', 0, ct)
    bez = lambda a, b, c, d, u: tuple((1 - u) ** 3 * a[i] + 3 * (1 - u) ** 2 * u * b[i] + 3 * (1 - u) * u * u * c[i] + u ** 3 * d[i] for i in (0, 1))
    hose = [bez((-0.08, -0.215), (0.0, -0.33), (0.07, -0.15), (0.115, -0.045), i / 14) for i in range(15)]
    fstrip(B, F, hose, 0.018, 0.017, 'Hose_Grey', 0, ct)
    gx, gy = -0.03, 0.03                                                                           # ghost
    body = ellipse(gx, gy + 0.06, 0.115, 0.115, 14, 0, math.pi)
    body += [(gx - 0.13, gy - 0.17)]
    body += [(gx - 0.13 + 0.26 * k / 24, gy - 0.17 - 0.03 * (0.5 - 0.5 * math.cos(2 * math.pi * 4 * k / 24))) for k in range(1, 24)]
    body += [(gx + 0.13, gy - 0.17)]
    fpoly(B, F, body, 0.016, 'Ghost_White', 0, ct)
    fpoly(B, F, ellipse(gx + 0.13, gy - 0.06, 0.035, 0.022, 12), 0.018, 'Ghost_White', 0, ct)    # arm
    fstrip(B, F, [(0.12, -0.04), (0.16, -0.245)], 0.016, 0.019, 'Hose_Grey', 0, ct)               # wand
    fpoly(B, F, [(0.12, -0.262), (0.21, -0.262), (0.195, -0.238), (0.14, -0.238)], 0.0195, 'Ghost_Dark', 0, ct)
    for ex in (gx - 0.04, gx + 0.03):
        fpoly(B, F, ellipse(ex, gy + 0.075, 0.016, 0.026, 12), 0.018, 'Ghost_Dark', 0, ct)
        fpoly(B, F, ellipse(ex + 0.005, gy + 0.085, 0.005, 0.007, 8), 0.019, 'Ghost_White', 0, ct)
    fpoly(B, F, ellipse(gx - 0.005, gy + 0.03, 0.035, 0.025, 12, math.pi, 2 * math.pi), 0.018, 'Ghost_Dark', 0, ct)
    for cx in (gx - 0.078, gx + 0.068):
        fpoly(B, F, ellipse(cx, gy + 0.03, 0.016, 0.01, 10), 0.018, 'Ghost_Pink', 0, ct)
    # brass plaque 0.50 x 0.16 x 0.01, centre Z 1.08
    fbox(B, F, -0.25, 0.25, 1.00, 1.16, 0, 0.01, 'Brass')
    for s in (-0.23, 0.23):
        fdisc(B, F, s, 1.08, 0.006, 0.01, 0.012, 'Engraving', segs=8)
    ob = B.finish()

    # raised text: Text object -> mesh, extruded 2 mm, joined into the signature
    font = bpy.data.fonts.load(os.path.join(ROOT, 'public/fonts/im-fell-english-sc.woff2'))   # OFL, already in the project
    eng = bpy.data.materials['Engraving']
    me_all = ob.data
    for body_txt, size, t, maxw, bold in (("EMPLOYEE OF THE MONTH", 0.028, 1.118, 0.40, 0.0), ("IAN BAKELAND", 0.058, 1.058, 0.42, 0.0009)):
        cu = bpy.data.curves.new(body_txt, 'FONT')
        cu.body, cu.font, cu.size = body_txt, font, size
        cu.align_x, cu.align_y = 'CENTER', 'CENTER'
        cu.extrude, cu.offset, cu.resolution_u = 0.001, bold, 3
        tob = bpy.data.objects.new(body_txt, cu)
        bpy.context.scene.collection.objects.link(tob)
        M = Matrix((F.r, F.u, F.n)).transposed().to_4x4()
        M.translation = F.p(0, t, 0.011)
        tob.matrix_world = M
        bpy.context.view_layer.update()
        if tob.dimensions.x > maxw:
            cu.size = size * maxw / tob.dimensions.x
            bpy.context.view_layer.update()
        print(f"TEXT '{body_txt}' size {cu.size:.4f} -> {tob.dimensions.x:.3f} x {tob.dimensions.y:.3f} m")
        tm = bpy.data.meshes.new_from_object(tob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        tm.transform(tob.matrix_world)
        # ponytail: the Fell font's distressed outlines are ~2k tris per letter; collapse-decimate them to ~10 %
        tmp = bpy.data.objects.new('tmp_text', tm)
        bpy.context.scene.collection.objects.link(tmp)
        tmp.modifiers.new('dec', 'DECIMATE').ratio = 0.1
        tm = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        old_tm = tmp.data
        bpy.data.objects.remove(tmp)
        bpy.data.meshes.remove(old_tm)
        bm = bmesh.new()
        bm.from_mesh(me_all)
        old = set(bm.faces)
        bm.from_mesh(tm)
        if eng.name not in [m.name for m in me_all.materials]:
            me_all.materials.append(eng)
        idx = [m.name for m in me_all.materials].index(eng.name)
        new_faces = [f for f in bm.faces if f not in old]
        for f in new_faces:
            f.material_index = idx
        bmesh.ops.delete(bm, geom=[f for f in new_faces if f.normal.dot(F.n) < -0.5], context='FACES')   # back of the text
        bm.to_mesh(me_all)
        bm.free()
        bpy.data.objects.remove(tob)
        bpy.data.meshes.remove(tm)
    return ob


def add_lights():
    col = bpy.data.collections.new('BakeLights')
    bpy.context.scene.collection.children.link(col)
    for r, (x0, x1, y0, y1) in ROOMS.items():
        cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0 - 2 * h, y1 - y0 - 2 * h
        for tag, z, flip, k, sc in (('Down', H - 0.08, False, 1.0, 0.9), ('Up', 1.0, True, 0.3, 0.6)):
            L = bpy.data.lights.new(f'Area_{r}_{tag}', 'AREA')
            L.shape, L.size, L.size_y = 'RECTANGLE', w * sc, d * sc
            L.energy = LIGHT_K * k * w * d
            o = bpy.data.objects.new(L.name, L)
            o.location = (cx, cy, z)
            if flip:
                o.rotation_euler = (math.pi, 0, 0)       # the "Up" fill light lights the ceiling
            col.objects.link(o)
    return col


# ---------------------------------------------------------------- UV, bake, export
def select(objs, active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def make_uvs(objs, sig):
    for o in objs:
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name='BakeUV')
    select(objs, objs[0])
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Raised text: one flat front projection instead of Smart UV's thousands of tiny side-wall islands
    # (the 2 mm sides just get the edge colour). Same texel density as the rest of the signature, then all x4.
    bm = bmesh.new()
    bm.from_mesh(sig.data)
    lay = bm.loops.layers.uv['BakeUV']
    eng = [m.name for m in sig.data.materials].index('Engraving')
    a2 = a3 = 0.0
    for f in bm.faces:
        if f.material_index != eng:
            p = [l[lay].uv for l in f.loops]
            a2 += abs(sum(p[i].x * p[i - 1].y - p[i - 1].x * p[i].y for i in range(len(p)))) / 2
            a3 += f.calc_area()
    k = (a2 / a3) ** 0.5
    for f in bm.faces:
        for l in f.loops:
            l[lay].uv = (l.vert.co.x * k + 2.0, l.vert.co.z * k) if f.material_index == eng else l[lay].uv
    for f in bm.faces:
        for l in f.loops:
            l[lay].uv = l[lay].uv * 4                                 # signature islands x4 (sharper text)
    bm.to_mesh(sig.data)
    bm.free()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=0.001, rotate=True)   # 0.003 left 60 % of the texture empty around the thin trim strips
    bpy.ops.object.mode_set(mode='OBJECT')


def bake(objs):
    sc = bpy.context.scene
    img = bpy.data.images.new('baked', RES, RES, alpha=False)
    for m in {s.material for o in objs for s in o.material_slots}:
        nt = m.node_tree
        for n in nt.nodes:
            n.select = False
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image, tn.select = img, True
        nt.nodes.active = tn
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'GPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    b = sc.render.bake
    b.margin, b.use_clear, b.target = 16, True, 'IMAGE_TEXTURES'
    b.use_pass_direct = b.use_pass_indirect = b.use_pass_diffuse = b.use_pass_emit = True
    b.use_pass_glossy = b.use_pass_transmission = False
    select(objs, objs[0])
    bpy.ops.object.bake(type='COMBINED')
    px = np.empty(RES * RES * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape(-1, 4)[:, :3]
    lum = rgb.mean(1)
    print(f"BAKE mean {lum.mean():.3f}  p10 {np.percentile(lum, 10):.3f}  p50 {np.percentile(lum, 50):.3f}  "
          f"p90 {np.percentile(lum, 90):.3f}  near-black {np.mean(lum < 0.01) * 100:.1f}%")
    path = os.path.join(OUT, 'public/textures/baked.jpg')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path
    img.file_format = 'JPEG'
    img.save(quality=90)
    return img, path


def previews(objs, img, ceil):
    sc = bpy.context.scene
    nt = new_mat('BakedView')
    tex = node(nt, 'ShaderNodeTexImage', {'Vector': node(nt, 'ShaderNodeUVMap', uv_map='BakeUV').outputs[0]}, image=img)
    finish(nt, tex.outputs['Color'], emit=True)
    view = bpy.data.materials['BakedView']
    saved = {o: [s.material for s in o.material_slots] for o in objs}
    for o in objs:
        for s in o.material_slots:
            s.material = view
    for o in bpy.data.collections['BakeLights'].objects:
        o.hide_render = True
    sc.cycles.samples, sc.cycles.use_denoising = 16, False
    out = os.path.join(OUT, 'blender')
    os.makedirs(out, exist_ok=True)

    cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 18
    cam.location, cam.rotation_euler = (0, -4.5, 1.6), (math.pi / 2, 0, 0)
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = os.path.join(out, 'preview-hall.png')
    bpy.ops.render.render(write_still=True)

    finish(new_mat('PlanBlack'), (0, 0, 0), emit=True)
    T_ = Builder('PlanTops')                                    # wall tops, only for the plan picture
    for x0, x1, y0, y1 in WALL_RECTS:
        fpoly(T_, Face((0, 0, H + 0.01), UP, (0, 1, 0)), rect(x0, x1, y0, y1), 0, 'PlanBlack')
    tops = T_.finish()
    ceil.hide_render = True
    cam.data.type, cam.data.ortho_scale = 'ORTHO', 12.4
    cam.location, cam.rotation_euler = (0, 0, 10), (0, 0, 0)
    sc.render.resolution_x, sc.render.resolution_y = 1488, 1240
    sc.render.filepath = os.path.join(out, 'preview-plan.png')
    bpy.ops.render.render(write_still=True)

    ceil.hide_render = False
    bpy.data.objects.remove(tops)
    bpy.data.objects.remove(cam)
    for o, ms in saved.items():
        for s, m in zip(o.material_slots, ms):
            s.material = m
    bpy.data.materials.remove(view)
    bpy.data.materials.remove(bpy.data.materials['PlanBlack'])
    for o in bpy.data.collections['BakeLights'].objects:
        o.hide_render = False


def export_glb(objs):
    """One plain 'Baked' material per object (no textures in the GLB: the game loads baked.jpg itself)."""
    plain = bpy.data.materials.new('Baked')
    saved = {}
    for o in objs:
        me = o.data
        idx = np.zeros(len(me.polygons), dtype=np.int32)
        me.polygons.foreach_get('material_index', idx)
        saved[o] = (idx, list(me.materials))
        me.materials.clear()
        me.materials.append(plain)
        me.polygons.foreach_set('material_index', np.zeros_like(idx))
    select(objs, objs[0])
    path = os.path.join(OUT, 'public/models/house.glb')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_cameras=False, export_lights=False,
                              export_animations=False)
    for o, (idx, mats) in saved.items():
        o.data.materials.clear()
        for m in mats:
            o.data.materials.append(m)
        o.data.polygons.foreach_set('material_index', idx)
    bpy.data.materials.remove(plain)
    return path


def report(objs, paths):
    pts = np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in objs])
    print("REPORT bbox min", pts.min(0).round(4), "max", pts.max(0).round(4))
    total = 0
    for o in objs:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        total += tris
        print(f"REPORT {o.name}: {tris} tris, UV maps {[u.name for u in o.data.uv_layers]}, "
              f"materials {len(o.data.materials)}, loc {tuple(o.location)}, scale {tuple(o.scale)}")
    print("REPORT total tris", total)
    for p in paths:
        print(f"REPORT file {p}: {os.path.getsize(p) / 1e6:.2f} MB")


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    sc = bpy.context.scene
    sc.unit_settings.system, sc.unit_settings.scale_length = 'METRIC', 1.0
    sc.view_settings.view_transform, sc.view_settings.look = 'Standard', 'None'
    sc.world = sc.world or bpy.data.worlds.new('World')
    sc.world.color = (0, 0, 0)
    make_materials()
    walls = build_walls()
    floors, ceil = build_floors_ceilings()
    sig = build_signature()
    objs = [floors, walls, ceil, sig]
    add_lights()
    make_uvs(objs, sig)
    img, jpg = bake(objs)
    previews(objs, img, ceil)
    glb = export_glb(objs)
    blend = os.path.join(OUT, 'blender/house.blend')
    img.filepath = jpg
    img.source = 'FILE'
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    report(objs, [jpg, glb, blend])


main()
