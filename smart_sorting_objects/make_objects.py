"""Smart Sorting Challenge test objects - CadQuery (OpenCascade) parametric CAD.
All dimensions in mm. Every part is oriented the way it is printed (lowest face on z=0).
Design rules: no part needs supports; overhangs <= 45 deg; walls >= 2 mm; 0.2 mm fit clearance.
"""
import math, os
import cadquery as cq, trimesh

OUT = os.path.dirname(os.path.abspath(__file__))
S = 40.0          # spec size
H_OPEN = 25.0     # spec height of no-lid objects
WALL = 2.0
CLR = 0.2         # per-side fit clearance for pins / plug

# ---------- 1. SPHERE WITH LID : two identical hemispheres + 3 locating pins ----------
def hemisphere():
    R = S / 2
    h = cq.Workplane("XY").sphere(R).rotate((0, 0, 0), (1, 0, 0), 90).intersect(  # pole moved off the cavity axis (clean mesh)
        cq.Workplane("XY").box(S * 2, S * 2, R, centered=(True, True, False)))
    # self-supporting 'teardrop' cavity: vertical wall, then 45 deg cone ceiling (open to bed side)
    rc, hc = 15.0, 2.0
    prof = cq.Workplane("XZ").polyline([(0, -1), (rc, -1), (rc, hc), (0, hc + rc)]).close()
    h = h.cut(prof.revolve(360, (0, 0, 0), (0, 1, 0)))
    # 3 pin sockets in the joint face (recessed -> no protrusion below the bed)
    pts = [(17.5 * math.cos(math.radians(a)), 17.5 * math.sin(math.radians(a))) for a in (90, 210, 330)]
    h = h.cut(cq.Workplane("XY").workplane(offset=-0.01).pushPoints(pts).circle(2.0 + CLR / 2).extrude(3.0))
    return h

def pin():
    p = cq.Workplane("XY").circle(1.8).extrude(5.6)
    return p.faces("<Z or >Z").chamfer(0.4)

# ---------- 2. CUBE WITH LID : open box + lid with plug ----------
def cube_body():
    H = S - 4.0                                   # lid is 4 thick -> assembled 40 high
    b = cq.Workplane("XY").box(S, S, H, centered=(True, True, False))
    b = b.cut(cq.Workplane("XY").workplane(offset=WALL).rect(S - 2 * WALL, S - 2 * WALL).extrude(H))
    return b.faces("<Z").chamfer(0.4)             # elephant-foot relief

def cube_lid():
    plate = cq.Workplane("XY").box(S, S, 4.0, centered=(True, True, False))
    inner = S - 2 * WALL - 2 * CLR                # plug outer
    ring = (cq.Workplane("XY").workplane(offset=4.0).rect(inner, inner)
            .rect(inner - 2 * 1.6, inner - 2 * 1.6).extrude(5.0))
    lid = plate.union(ring)
    return lid.faces("<Z").chamfer(0.4)           # printed plate-down, plug up

# ---------- 3/4. OPEN OBJECTS (25 mm) ----------
def open_round():
    c = cq.Workplane("XY").circle(S / 2).extrude(H_OPEN)
    c = c.cut(cq.Workplane("XY").workplane(offset=WALL).circle(S / 2 - WALL).extrude(H_OPEN))
    return c.faces("<Z").chamfer(0.4)

def open_square():
    c = cq.Workplane("XY").box(S, S, H_OPEN, centered=(True, True, False))
    c = c.cut(cq.Workplane("XY").workplane(offset=WALL).rect(S - 2 * WALL, S - 2 * WALL).extrude(H_OPEN))
    return c.faces("<Z").chamfer(0.4)

PARTS = {
    "01a_sphere_half_x2": hemisphere(),
    "01b_sphere_pin_x3": pin(),
    "02a_cube_body": cube_body(),
    "02b_cube_lid": cube_lid(),
    "03_round_open": open_round(),
    "04_square_open": open_square(),
}

if __name__ == "__main__":
    os.makedirs(f"{OUT}/stl", exist_ok=True); os.makedirs(f"{OUT}/step", exist_ok=True)
    for n, w in PARTS.items():
        cq.exporters.export(w, f"{OUT}/stl/{n}.stl", tolerance=0.01, angularTolerance=0.05)
        cq.exporters.export(w, f"{OUT}/step/{n}.step")
        m = trimesh.load(f"{OUT}/stl/{n}.stl")          # clean pole/apex slivers from tessellation
        m.merge_vertices(); m.update_faces(m.nondegenerate_faces()); m.remove_unreferenced_vertices()
        trimesh.repair.fix_normals(m); m.export(f"{OUT}/stl/{n}.stl")
        print("exported", n)
