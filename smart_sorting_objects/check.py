import glob, numpy as np, trimesh, os
print(f"{'part':22} wt  cons  vol>0  bodies  size(mm)            bedArea  maxOverhang(deg)  vol(cm3)")
for f in sorted(glob.glob("stl/*.stl")):
    m = trimesh.load(f)
    zmin = m.bounds[0][2]
    bed = m.area_faces[np.isclose(m.triangles_center[:,2], zmin, atol=1e-3) & (m.face_normals[:,2] < -0.99)].sum()
    # overhang = angle of downward-facing faces from horizontal-down; faces above bed layer only
    up = (m.triangles_center[:,2] > zmin + 0.01) & (m.face_normals[:,2] < 0)
    ang = np.degrees(np.arccos(np.clip(-m.face_normals[up][:,2], -1, 1))) if up.any() else np.array([0.])
    # angle from vertical wall: 90 - arccos(-nz) ; 45 deg limit => arccos(-nz) >= 45
    worst = 90 - ang.min() if up.any() else 0   # overhang from vertical (0=wall, 90=flat ceiling)
    big = m.area_faces[up][ang < 45].sum() if up.any() else 0
    print(f"{os.path.basename(f)[:-4]:22} {m.is_watertight!s:5}{m.is_winding_consistent!s:5} {m.volume>0!s:6} {len(m.split()):4}  {np.round(m.extents,1)!s:20} {bed:7.0f}  {worst:6.1f} (flat-ceiling area {big:.1f} mm2)  {m.volume/1000:.2f}")
