// Head tracking with MediaPipe Face Landmarker (runs fully in the browser).
// Produces the viewer's eye position in centimetres relative to the screen centre.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;
const IPD_CM = 6.3; // average adult inter-pupillary distance

export class HeadTracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.running = false;
    this.lastVideoTime = -1;
    this.raw = null; // latest unsmoothed estimate
    this.landmarks = null; // latest landmark list (normalised), for the preview overlay
    this.lastSeen = 0;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();

    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
    }
    this.running = true;
  }

  get tracking() {
    return this.running && performance.now() - this.lastSeen < 500;
  }

  // cfg: { hfovDeg, camOffsetY, sensitivity }
  update(cfg) {
    if (!this.running || this.video.readyState < 2) return;
    const t = this.video.currentTime;
    if (t === this.lastVideoTime) return;
    this.lastVideoTime = t;

    const res = this.landmarker.detectForVideo(this.video, performance.now());
    const lm = res.faceLandmarks && res.faceLandmarks[0];
    if (!lm) return;
    this.landmarks = lm;
    this.lastSeen = performance.now();

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const f = vw / 2 / Math.tan(((cfg.hfovDeg * Math.PI) / 180) / 2); // focal length in px

    const a = lm[LEFT_IRIS];
    const b = lm[RIGHT_IRIS];
    const ipdPx = Math.hypot((a.x - b.x) * vw, (a.y - b.y) * vh);
    if (ipdPx < 1) return;

    const z = (f * IPD_CM) / ipdPx;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    // Mirror X: moving right in the real world moves left in the (unmirrored) camera image.
    const x = ((0.5 - cx) * vw * z) / f;
    const y = ((0.5 - cy) * vh * z) / f + cfg.camOffsetY;

    this.raw = { x: x * cfg.sensitivity, y: y * cfg.sensitivity, z };
  }
}
