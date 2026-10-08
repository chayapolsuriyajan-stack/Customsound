# Anamorphic window — head-tracked off-axis projection

A browser rebuild of the "POV: you got the graphics update" clip (`reference/original.mp4`), where a
webcam + MediaPipe (TouchDesigner) tracks the viewer's head and Unreal Engine 5 renders the scene
so the monitor behaves like a **window** into a 3D space.

Here the whole pipeline runs in the browser:

| Original | This rebuild |
| --- | --- |
| MediaPipe in TouchDesigner | MediaPipe Face Landmarker (`@mediapipe/tasks-vision`, WebGL/WASM) |
| UE5 off-axis camera | Three.js with an asymmetric frustum (`src/offaxis.js`) |
| UE5 scenes | `src/sceneGravity.js` (white box + glyph wall, rigid-body physics via cannon-es), `src/sceneFloat.js` (dark garden, floating shapes, light bars, red HUD tracking boxes) |
| UE5 post-processing | `src/post.js`: bloom, depth of field focused on the screen plane, film grain + vignette |

## Run

No build step — it's static files that load Three.js, cannon-es and MediaPipe from jsDelivr.
The camera only works from `https://` or `http://localhost`:

```sh
cd anamorphic
npx serve .          # or: python3 -m http.server 8000
# open http://localhost:3000 (or :8000), click "Start camera"
```

No webcam? Move the mouse to simulate your head (wheel = distance). If you don't move the
mouse for 8 s, an automatic head path takes over (`?auto` forces it on). Use `?scene=float` to
open on the second scene, and `?nopost` (or the `G` key) to turn off post-processing on slow GPUs.

Keys: `1`/`2` scene · `C` camera · `A` auto · `G` post FX · `D` HUD · `P` webcam preview · `H` hide panel · `F` fullscreen

## Calibrating

The illusion only works when the virtual screen matches your real one:

- **Screen width** — the physical width (cm) of the browser canvas; use fullscreen (`F`).
- **Webcam FOV** — horizontal field of view of your camera (most laptop cams are 60–75°).
- **Sensitivity** — scales head movement if the parallax feels too weak or too strong.
- The webcam is assumed to sit just above the top edge of the screen, centred.

Close one eye for the strongest effect: the depth cue comes from motion parallax, which
works for a single viewpoint.

## How it works

1. `src/tracking.js` finds the two iris centres (landmarks 468 / 473). Their pixel distance
   with an average 6.3 cm inter-pupillary distance gives the eye's distance from the camera;
   the midpoint gives X/Y. The result is in centimetres, relative to the screen centre.
2. `src/offaxis.js` puts the camera at the eye and builds the frustum whose edges pass
   through the four physical screen corners (Kooima, *Generalized Perspective Projection*).
3. The scenes are built in centimetres around a screen at `z = 0`: anything with `z < 0` is
   "behind the glass", anything with `z > 0` floats in front of it.

Credit: original clip — MediaPipe + TouchDesigner + Unreal Engine 5 ("big thanks to yfj").
