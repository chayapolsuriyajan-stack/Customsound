import * as THREE from 'three';
import { applyOffAxis } from './offaxis.js';
import { HeadTracker } from './tracking.js';
import { createGravityScene } from './sceneGravity.js';
import { createFloatScene } from './sceneFloat.js';
import { createPost } from './post.js';

const $ = (id) => document.getElementById(id);

const settings = {
  screenWidth: 60, // physical width of the visible canvas, cm
  distance: 60, // default viewing distance (mouse / auto mode), cm
  sensitivity: 1.0,
  hfov: 60, // webcam horizontal field of view, degrees
  camOffset: 2, // webcam lens height above the top edge of the screen, cm
  scene: 'gravity',
  hud: true,
  preview: true,
};

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera();
const post = createPost(renderer, camera);
let usePost = !new URLSearchParams(location.search).has('nopost');
const hud = $('hud');
const hudCtx = hud.getContext('2d');

let screenW = 0;
let screenH = 0;
let current = null;

function screenSize() {
  return { w: settings.screenWidth, h: (settings.screenWidth * innerHeight) / innerWidth };
}

function buildScene() {
  clearTimeout(rebuildTimer);
  if (current) current.dispose();
  const { w, h } = screenSize();
  screenW = w;
  screenH = h;
  current = settings.scene === 'gravity' ? createGravityScene(w, h) : createFloatScene(w, h);
  post.setScene(current.scene, current.post);
  document.querySelectorAll('[data-scene]').forEach((b) => b.classList.toggle('on', b.dataset.scene === settings.scene));
}

let rebuildTimer = 0;
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(buildScene, 150);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight);
  hud.width = innerWidth * devicePixelRatio;
  hud.height = innerHeight * devicePixelRatio;
  scheduleRebuild();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- input: head / mouse / auto
const video = $('cam');
const tracker = new HeadTracker(video);
const eye = new THREE.Vector3(0, 0, settings.distance);
const target = eye.clone();
let mouse = null;
let lastMouseMove = -1e9;
let auto = new URLSearchParams(location.search).has('auto');

addEventListener('pointermove', (ev) => {
  mouse = { x: ev.clientX / innerWidth, y: ev.clientY / innerHeight };
  lastMouseMove = performance.now();
});
addEventListener('wheel', (ev) => {
  settings.distance = THREE.MathUtils.clamp(settings.distance + ev.deltaY * 0.05, 20, 200);
  syncInputs();
}, { passive: true });

function mouseTarget(out) {
  const m = mouse ?? { x: 0.5, y: 0.5 };
  out.set((m.x - 0.5) * screenW * 1.3, -(m.y - 0.5) * screenH * 1.3, settings.distance);
}

function autoTarget(out, t) {
  out.set(Math.sin(t * 0.45) * screenW * 0.55, Math.sin(t * 0.31) * screenH * 0.35, settings.distance + Math.sin(t * 0.2) * 12);
}

let source = 'mouse';
function updateEye(dt, t) {
  tracker.update({ hfovDeg: settings.hfov, camOffsetY: screenH / 2 + settings.camOffset, sensitivity: settings.sensitivity });
  if (tracker.tracking && tracker.raw) {
    target.set(tracker.raw.x, tracker.raw.y, tracker.raw.z);
    source = 'face';
  } else if (auto || performance.now() - lastMouseMove > 8000) {
    autoTarget(target, t);
    source = 'auto';
  } else {
    mouseTarget(target);
    source = 'mouse';
  }
  eye.lerp(target, 1 - Math.exp(-dt * 10));
}

// ---------------------------------------------------------------- HUD (red tracking boxes)
const v3 = new THREE.Vector3();
const box = new THREE.Box3();
const corners = Array.from({ length: 8 }, () => new THREE.Vector3());

function projectRect(mesh) {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let i = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = corners[i++].set(x, y, z).project(camera);
    if (p.z > 1) return null;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const W = hud.width, H = hud.height;
  return { x: ((x0 + 1) / 2) * W, y: ((1 - y1) / 2) * H, w: ((x1 - x0) / 2) * W, h: ((y1 - y0) / 2) * H };
}

let fps = 60;
function drawHud(t) {
  const g = hudCtx;
  const W = hud.width, H = hud.height, s = devicePixelRatio;
  g.clearRect(0, 0, W, H);
  if (!settings.hud) return;

  g.font = `${10 * s}px ui-monospace, Menlo, monospace`;
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.textAlign = 'right';
  g.fillText(
    `FPS ${fps.toFixed(0)}  |  SRC ${source.toUpperCase()}  |  FX ${usePost ? 'ON' : 'OFF'}  |  EYE ${eye.x.toFixed(1)} ${eye.y.toFixed(1)} ${eye.z.toFixed(1)} cm`,
    W - 14 * s, 18 * s,
  );
  g.textAlign = 'left';

  const targets = current?.hudTargets ?? [];
  if (!targets.length) return;
  g.strokeStyle = 'rgba(255,60,60,0.85)';
  g.fillStyle = 'rgba(255,80,80,0.9)';
  g.lineWidth = 1.2 * s;
  let prev = null;
  let all = null;
  targets.forEach((mesh, i) => {
    const r = projectRect(mesh);
    if (!r || r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H || r.w > W * 0.35) return;
    const pad = 6 * s;
    g.strokeRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    // small "x" marker at the centre
    g.beginPath();
    g.moveTo(cx - 4 * s, cy - 4 * s); g.lineTo(cx + 4 * s, cy + 4 * s);
    g.moveTo(cx + 4 * s, cy - 4 * s); g.lineTo(cx - 4 * s, cy + 4 * s);
    g.stroke();
    const conf = 0.86 + 0.12 * Math.abs(Math.sin(t * 0.7 + i));
    g.fillText(`obj_${String(i).padStart(2, '0')}  ${conf.toFixed(2)}`, r.x - pad, r.y - pad - 4 * s);
    if (prev) {
      g.beginPath();
      g.moveTo(prev.x, prev.y);
      g.lineTo(cx, cy);
      g.stroke();
    }
    prev = { x: cx, y: cy };
    all = all
      ? { x0: Math.min(all.x0, r.x), y0: Math.min(all.y0, r.y), x1: Math.max(all.x1, r.x + r.w), y1: Math.max(all.y1, r.y + r.h) }
      : { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h };
  });
  if (all) {
    g.strokeStyle = 'rgba(255,60,60,0.45)';
    const p = 24 * s;
    g.strokeRect(all.x0 - p, all.y0 - p, all.x1 - all.x0 + 2 * p, all.y1 - all.y0 + 2 * p);
  }
}

// webcam preview with iris markers
const pv = $('preview');
const pvCtx = pv.getContext('2d');
function drawPreview() {
  const show = settings.preview && tracker.running;
  pv.parentElement.classList.toggle('hidden', !show);
  if (!show) return;
  pv.width = 240;
  pv.height = 135;
  pvCtx.save();
  pvCtx.scale(-1, 1);
  pvCtx.drawImage(video, -pv.width, 0, pv.width, pv.height);
  pvCtx.restore();
  const lm = tracker.landmarks;
  if (lm && tracker.tracking) {
    pvCtx.fillStyle = '#ff4040';
    for (const i of [468, 473, 1, 152, 10]) {
      pvCtx.fillRect((1 - lm[i].x) * pv.width - 2, lm[i].y * pv.height - 2, 4, 4);
    }
  }
}

// ---------------------------------------------------------------- UI
function syncInputs() {
  for (const [k, id] of [['screenWidth', 'sw'], ['distance', 'dist'], ['sensitivity', 'sens'], ['hfov', 'fov']]) {
    $(id).value = settings[k];
    $(`${id}-v`).textContent = (+settings[k]).toFixed(k === 'sensitivity' ? 2 : 0);
  }
}

for (const [k, id, rebuild] of [['screenWidth', 'sw', true], ['distance', 'dist'], ['sensitivity', 'sens'], ['hfov', 'fov']]) {
  $(id).addEventListener('input', (ev) => {
    settings[k] = +ev.target.value;
    syncInputs();
    if (rebuild) scheduleRebuild();
  });
}

function setScene(name) {
  settings.scene = name;
  buildScene();
}
document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));

async function startCamera() {
  const btn = $('camBtn');
  btn.disabled = true;
  btn.textContent = 'Starting camera…';
  try {
    await tracker.start();
    btn.textContent = 'Camera on';
  } catch (err) {
    console.warn('Camera / MediaPipe unavailable, staying on mouse control:', err);
    btn.textContent = 'Camera unavailable — using mouse';
  }
}
$('camBtn').addEventListener('click', startCamera);

addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT') return;
  const k = ev.key.toLowerCase();
  if (k === '1') setScene('gravity');
  else if (k === '2') setScene('float');
  else if (k === 'h') document.body.classList.toggle('clean');
  else if (k === 'd') settings.hud = !settings.hud;
  else if (k === 'p') settings.preview = !settings.preview;
  else if (k === 'a') auto = !auto;
  else if (k === 'g') usePost = !usePost;
  else if (k === 'c' && !tracker.running) startCamera();
  else if (k === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

// ---------------------------------------------------------------- loop
const params = new URLSearchParams(location.search);
if (params.get('scene') === 'float') settings.scene = 'float';
syncInputs();
resize();
buildScene();

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  const t = now / 1000;

  updateEye(dt, t);
  current.update(dt, t);
  applyOffAxis(camera, eye, screenW, screenH, 1, 3000);
  if (usePost) post.render(t, eye.z);
  else renderer.render(current.scene, camera);
  drawHud(t);
  drawPreview();
});

// expose for debugging / automated screenshots
window.anamorphic = { settings, eye, setScene, get current() { return current; }, setEye: (x, y, z) => { auto = false; lastMouseMove = performance.now(); mouse = { x: x / (screenW * 1.3) + 0.5, y: -y / (screenH * 1.3) + 0.5 }; if (z) settings.distance = z; } };
