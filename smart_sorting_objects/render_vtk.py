import numpy as np, trimesh, vtk
from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray
T=trimesh.transformations
L=lambda n: trimesh.load(f"stl/{n}.stl")
RED,BLUE,GREY=(0.88,0.2,0.1),(0.1,0.35,0.85),(0.8,0.8,0.82)

def poly(m):
    pd=vtk.vtkPolyData(); p=vtk.vtkPoints(); p.SetData(numpy_to_vtk(m.vertices.astype(float),deep=True)); pd.SetPoints(p)
    f=np.hstack([np.full((len(m.faces),1),3),m.faces]).astype(np.int64).ravel()
    ca=vtk.vtkCellArray(); ca.SetCells(len(m.faces),numpy_to_vtkIdTypeArray(f,deep=True)); pd.SetPolys(ca); return pd
def actor(m,color,clip=None,spec=0.35):
    pd=poly(m)
    n=vtk.vtkPolyDataNormals(); n.SetInputData(pd); n.SetFeatureAngle(35); n.SplittingOn(); n.Update(); src=n.GetOutput()
    mp=vtk.vtkPolyDataMapper()
    if clip is not None:
        pl=vtk.vtkPlane(); pl.SetOrigin(0,0,0); pl.SetNormal(*clip)
        c=vtk.vtkClipClosedSurface(); c.SetInputData(src); c.SetClippingPlanes(vtk.vtkPlaneCollection()); c.GetClippingPlanes().AddItem(pl)
        c.GenerateFacesOn(); c.SetActivePlaneId(0); c.SetBaseColor(*color) if hasattr(c,'SetBaseColor') else None; c.Update()
        mp.SetInputData(c.GetOutput())
    else: mp.SetInputData(src)
    mp.ScalarVisibilityOff(); a=vtk.vtkActor(); a.SetMapper(mp); pr=a.GetProperty()
    pr.SetColor(*color); pr.SetSpecular(spec); pr.SetSpecularPower(40); pr.SetAmbient(0.25); pr.SetDiffuse(0.8); return a

def render(actors,fn,size,cam,bgfloor=None,focal=None,parallel=None):
    ren=vtk.vtkRenderer(); ren.SetBackground(0.96,0.96,0.97); ren.SetBackground2(1,1,1); ren.GradientBackgroundOn()
    for a in actors: ren.AddActor(a)
    ren.RemoveAllLights()
    for pos,i in (((-1,-1.4,2),0.9),((1.5,-0.5,1),0.45),((0,2,1.2),0.35)):
        l=vtk.vtkLight(); l.SetPosition(*pos); l.SetFocalPoint(0,0,0); l.SetIntensity(i); l.SetLightTypeToSceneLight(); ren.AddLight(l)
    rw=vtk.vtkRenderWindow(); rw.SetOffScreenRendering(1); rw.SetMultiSamples(8); rw.AddRenderer(ren); rw.SetSize(*size)
    c=ren.GetActiveCamera(); c.SetFocalPoint(*focal); c.SetPosition(*cam); c.SetViewUp(0,0,1)
    if parallel: c.ParallelProjectionOn(); c.SetParallelScale(parallel)
    ren.ResetCameraClippingRange(); rw.Render()
    w=vtk.vtkWindowToImageFilter(); w.SetInput(rw); w.SetScale(1); w.Update()
    wr=vtk.vtkPNGWriter(); wr.SetFileName(fn); wr.SetInputConnection(w.GetOutputPort()); wr.Write()

def at(m,x,y,z=0): m=m.copy(); m.apply_translation([x,y,z]); return m
half=L("01a_sphere_half_x2"); pin=L("01b_sphere_pin_x3"); body=L("02a_cube_body"); lid=L("02b_cube_lid")
rnd=L("03_round_open"); sq=L("04_square_open")
mirror=lambda m,z: (lambda c:(c.apply_transform(np.diag([1,1,-1,1])),c.apply_translation([0,0,z]),c)[2])(m.copy())

# ---------- assembled ----------
top=at(half,0,0,20); bot=mirror(half,20)
pins=[at(pin,17.5*np.cos(np.radians(a)),17.5*np.sin(np.radians(a)),17.2) for a in (90,210,330)]
lidA=mirror(lid,40)
X=[-60,-20,20,60]  # four objects along x
def row(c1,c2,y=0,clip=None):
    out=[]
    out+= [actor(m,c1,clip) for m in [bot,top]+pins] if False else []
    return out
def asm(clip=None,y=0):
    A=[]
    for m in [bot,top]: A.append(actor(at(m,-66,y),RED,clip))
    for m in pins: A.append(actor(at(m,-66,y),GREY,clip))
    for m in [body,lidA]: A.append(actor(at(m,-22,y),BLUE,clip))
    A.append(actor(at(rnd,22,y),RED,clip)); A.append(actor(at(sq,66,y),BLUE,clip)); return A
bed=vtk.vtkCubeSource(); bed.SetBounds(-110,110,-45,45,-1.5,-0.01); bm=vtk.vtkPolyDataMapper(); bm.SetInputConnection(bed.GetOutputPort()); ba=vtk.vtkActor(); ba.SetMapper(bm); ba.GetProperty().SetColor(0.85,0.86,0.9)
render(asm()+[ba],"render_assembled.png",(1800,700),(-5,-190,115),focal=(0,0,12))
# cross-section: clip away y>0 half, look from -y
def asm_cut():
    A=[]
    def cutm(m,x,col):
        c=m.copy(); 
        s=trimesh.intersections.slice_mesh_plane(c,[0,1,0],[0,0,0],cap=True); s.apply_translation([x,0,0]); A.append(actor(s,col))
    for m in [bot,top]: cutm(m,-66,RED)
    for m in [body,lidA]: cutm(m,-22,BLUE)
    cutm(rnd,22,RED); cutm(sq,66,BLUE)
    for p in pins: cutm(p,-66,GREY)
    return A
render(asm_cut()+[ba],"render_cross_section.png",(1800,700),(-5,-200,40),focal=(0,0,17),parallel=62)

# ---------- print plate ----------
def pl():
    A=[]; items=[(half,35,30,RED),(half,85,30,RED),(rnd,135,30,RED),(sq,185,30,RED),
      (body,35,85,BLUE),(lid,85,85,BLUE),(pin,125,85,GREY),(pin,135,85,GREY),(pin,145,85,GREY),
      (half,35,140,BLUE),(half,85,140,BLUE),(rnd,135,140,BLUE),(sq,185,140,BLUE)]
    for m,x,y,c in items: A.append(actor(at(m,x,y),c))
    b=vtk.vtkCubeSource(); b.SetBounds(0,220,0,220,-2,-0.02); mp=vtk.vtkPolyDataMapper(); mp.SetInputConnection(b.GetOutputPort()); a=vtk.vtkActor(); a.SetMapper(mp); a.GetProperty().SetColor(0.22,0.24,0.28); A.append(a); return A
render(pl(),"render_print_plate.png",(1600,1100),(110,-150,260),focal=(110,95,5))
print("ok")
