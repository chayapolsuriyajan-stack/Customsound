import numpy as np, trimesh, vtk
exec(open("render_vtk.py").read().split("# ---------- assembled ----------")[0])   # reuse helpers
def edges(m,color=(0.05,0.05,0.05)):
    fe=vtk.vtkFeatureEdges(); fe.SetInputData(poly(m)); fe.BoundaryEdgesOn(); fe.FeatureEdgesOn(); fe.SetFeatureAngle(40); fe.NonManifoldEdgesOff(); fe.ManifoldEdgesOff(); fe.Update()
    mp=vtk.vtkPolyDataMapper(); mp.SetInputConnection(fe.GetOutputPort()); mp.SetResolveCoincidentTopologyToPolygonOffset()
    a=vtk.vtkActor(); a.SetMapper(mp); a.GetProperty().SetColor(*color); a.GetProperty().SetLineWidth(1.4); return a
def both(m,col,x=0,y=0,z=0,flip=False):
    m=m.copy()
    if flip: m.apply_transform(np.diag([1,1,-1,1]))
    m.apply_translation([x,y,z]); return [actor(m,col,spec=0.15),edges(m)]
ORANGE=(0.93,0.62,0.2); TEAL=(0.35,0.62,0.78)
A=[]
# exploded assemblies (parts lifted apart along Z)
A+=both(half,ORANGE,-70,0,0,flip=True) if False else []
bot=half.copy(); bot.apply_transform(np.diag([1,1,-1,1])); 
A+=both(bot,ORANGE,-70,0,20); A+=both(half,ORANGE,-70,0,20+22)
for a in (90,210,330):
    A+=both(pin,(0.7,0.7,0.72),-70+17.5*np.cos(np.radians(a)),17.5*np.sin(np.radians(a)),20+8-2.8+0)
A+=both(body,TEAL,-15,0,0); A+=both(lid,TEAL,-15,0,40+22,flip=True)
A+=both(rnd,ORANGE,35,0,0); A+=both(sq,TEAL,80,0,0)
# axes triad + grid
ax=vtk.vtkAxesActor(); ax.SetTotalLength(25,25,25); tr=vtk.vtkTransform(); tr.Translate(-105,-45,0); ax.SetUserTransform(tr); A.append(ax)
g=vtk.vtkCubeSource(); g.SetBounds(-110,110,-50,50,-0.6,-0.05); gm=vtk.vtkPolyDataMapper(); gm.SetInputConnection(g.GetOutputPort()); ga=vtk.vtkActor(); ga.SetMapper(gm); ga.GetProperty().SetColor(0.8,0.82,0.86); A.append(ga)
for i in range(-110,111,10):
    for (p1,p2) in (((i,-50,0),(i,50,0)),((-110,i/2.2,0),(110,i/2.2,0))):
        if abs(p1[1])<=50 and abs(p2[1])<=50:
            l=vtk.vtkLineSource(); l.SetPoint1(*p1); l.SetPoint2(*p2); lm=vtk.vtkPolyDataMapper(); lm.SetInputConnection(l.GetOutputPort()); la=vtk.vtkActor(); la.SetMapper(lm); la.GetProperty().SetColor(0.62,0.65,0.7); la.GetProperty().SetLineWidth(1); A.append(la)
ren=vtk.vtkRenderer(); ren.SetBackground(0.93,0.94,0.96); ren.SetBackground2(0.78,0.81,0.88); ren.GradientBackgroundOn()
for a in A: ren.AddActor(a)
ren.RemoveAllLights()
for pos,i in (((-1,-1.4,2),0.9),((1.5,-0.5,1),0.5),((0,2,1.2),0.35)):
    l=vtk.vtkLight(); l.SetPosition(*pos); l.SetFocalPoint(0,0,0); l.SetIntensity(i); l.SetLightTypeToSceneLight(); ren.AddLight(l)
# window chrome: title text
def txt(s,x,y,size=18,col=(0.1,0.1,0.15)):
    t=vtk.vtkTextActor(); t.SetInput(s); t.GetTextProperty().SetFontSize(size); t.GetTextProperty().SetColor(*col); t.SetPosition(x,y); ren.AddActor2D(t)
txt("CadQuery  |  make_objects.py  |  Smart Sorting Challenge  -  exploded assembly view",20,1010,22)
txt("1 Sphere w/ lid (2 halves + 3 pins)      2 Cube w/ lid (body + lid)      3 Round, no lid      4 Square, no lid",20,20,18)
txt("units: mm   |   all 40 mm wide, 25 mm open / 40 mm lidded   |   X red  Y green  Z blue",20,990,15,(0.3,0.3,0.35))
rw=vtk.vtkRenderWindow(); rw.SetOffScreenRendering(1); rw.SetMultiSamples(8); rw.AddRenderer(ren); rw.SetSize(1900,1050)
c=ren.GetActiveCamera(); c.SetFocalPoint(5,0,28); c.SetPosition(70,-210,150); c.SetViewUp(0,0,1); c.SetViewAngle(32)
ren.ResetCameraClippingRange(); rw.Render()
w=vtk.vtkWindowToImageFilter(); w.SetInput(rw); w.Update(); wr=vtk.vtkPNGWriter(); wr.SetFileName("render_cad_screenshot.png"); wr.SetInputConnection(w.GetOutputPort()); wr.Write(); print("ok")
