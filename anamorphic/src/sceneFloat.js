// Scene 2 — dark, foggy garden: white rounded blocks, crosses and tubes drift in the air
// (some of them hang in front of the screen plane), with vertical light bars and ferns.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glyphGeometry } from './glyphs.js';

// One fern frond: leaflets along a curved spine, as a single geometry (unit length, grows +Y).
function frondGeometry() {
  const pos = [];
  const N = 16;
  const spine = (t) => new THREE.Vector3(0, Math.sin(t * 1.3) * 0.95, -0.35 * t * t);
  for (let i = 0; i < N; i++) {
    const t = 0.12 + (i / N) * 0.88;
    const p = spine(t);
    const len = 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 0.03;
    const wid = len * 0.28;
    for (const side of [-1, 1]) {
      const tip = p.clone().add(new THREE.Vector3(side * len, len * 0.35, -len * 0.25));
      const mid = p.clone().add(new THREE.Vector3(side * len * 0.5, len * 0.17 + wid, -len * 0.1));
      const mid2 = p.clone().add(new THREE.Vector3(side * len * 0.5, len * 0.17 - wid, -len * 0.15));
      pos.push(...p.toArray(), ...mid.toArray(), ...tip.toArray());
      pos.push(...p.toArray(), ...tip.toArray(), ...mid2.toArray());
    }
  }
  // the spine itself
  for (let i = 0; i < N; i++) {
    const a = spine(i / N), b = spine((i + 1) / N);
    const w = 0.008;
    pos.push(a.x - w, a.y, a.z, a.x + w, a.y, a.z, b.x + w, b.y, b.z);
    pos.push(a.x - w, a.y, a.z, b.x + w, b.y, b.z, b.x - w, b.y, b.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function bladeGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.02, 0, 0, 0.02, 0, 0, 0.06, 1, 0.1], 3));
  geo.computeVertexNormals();
  return geo;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFloatScene(W, H) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080a);
  scene.fog = new THREE.FogExp2(0x0b0d10, 0.0042);
  const floorY = -H / 2;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // Lighting.
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x101214, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-W * 0.3, H * 2, 60);
  key.target.position.set(0, floorY, -120);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -W * 1.5, right: W * 1.5, top: 300, bottom: -300, near: 1, far: 800 });
  key.shadow.normalBias = 0.5;
  scene.add(key, key.target);

  // Floor.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 8, 900),
    new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, floorY, -420);
  floor.receiveShadow = true;
  scene.add(floor);

  // Ferns.
  const frond = frondGeometry();
  const fernMat = new THREE.MeshStandardMaterial({ color: 0x9aa59a, roughness: 0.85, side: THREE.DoubleSide });
  const clusters = 26;
  const perCluster = 12;
  const ferns = new THREE.InstancedMesh(frond, fernMat, clusters * perCluster);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let idx = 0;
  for (let c = 0; c < clusters; c++) {
    const cx = rnd(-W * 1.1, W * 1.1);
    const cz = rnd(-320, -25);
    const size = H * rnd(0.22, 0.42);
    for (let i = 0; i < perCluster; i++) {
      const yaw = (i / perCluster) * Math.PI * 2 + rnd(-0.3, 0.3);
      q.setFromEuler(e.set(rnd(-0.15, 0.25), yaw, 0, 'YXZ'));
      v.set(cx + rnd(-2, 2), floorY, cz + rnd(-2, 2));
      const s = size * rnd(0.7, 1.1);
      ferns.setMatrixAt(idx++, m4.compose(v, q, sc.set(s, s, s)));
    }
  }
  ferns.castShadow = true;
  ferns.receiveShadow = true;
  scene.add(ferns);

  // Grass tufts.
  const blades = new THREE.InstancedMesh(
    bladeGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xb5bdb3, roughness: 0.9, side: THREE.DoubleSide }),
    2400,
  );
  for (let i = 0; i < blades.count; i++) {
    const tuft = Math.floor(i / 40);
    const tx = Math.sin(tuft * 12.9898) * W * 1.1;
    const tz = -30 - ((Math.sin(tuft * 78.233) + 1) / 2) * 280;
    q.setFromEuler(e.set(rnd(-0.4, 0.4), rnd(0, Math.PI * 2), rnd(-0.4, 0.4)));
    v.set(tx + rnd(-5, 5), floorY, tz + rnd(-5, 5));
    const s = H * rnd(0.06, 0.16);
    blades.setMatrixAt(i, m4.compose(v, q, sc.set(s, s, s)));
  }
  scene.add(blades);

  // Vertical light bars with an additive glow card each.
  const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const barH = H * 1.25;
  const barGeo = new THREE.CylinderGeometry(0.35, 0.35, barH, 8);
  const glowGeo = new THREE.PlaneGeometry(9, barH);
  const barXs = [-0.62, -0.38, 0.18, 0.42, 0.7, -0.05];
  barXs.forEach((fx, i) => {
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(fx * W, floorY + barH / 2, -40 - i * 28);
    scene.add(bar);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(bar.position);
    scene.add(glow);
    if (i < 3) {
      const pl = new THREE.PointLight(0xffffff, 3500, 120, 2);
      pl.position.copy(bar.position);
      scene.add(pl);
    }
  });

  // Floating objects.
  const objMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e7, roughness: 0.42 });
  const shapes = [
    new RoundedBoxGeometry(1, 1, 1, 4, 0.2),
    new RoundedBoxGeometry(1, 0.6, 1, 4, 0.18),
    glyphGeometry('plus', 0.45),
    new THREE.CylinderGeometry(0.5, 0.5, 0.8, 40),
    glyphGeometry('ring', 0.9),
  ];
  for (const s of shapes) s.computeBoundingSphere();
  const objects = [];
  const count = 70;
  for (let i = 0; i < count; i++) {
    const geo = shapes[i % shapes.length];
    const mesh = new THREE.Mesh(geo, objMat);
    // A handful of large ones close to (and in front of) the screen plane, the rest deep.
    const near = i < 12;
    const z = near ? rnd(-35, 18) : rnd(-320, -35);
    const spread = near ? 0.5 : 1.2;
    const base = new THREE.Vector3(rnd(-W, W) * spread, rnd(floorY + H * 0.1, H * 0.55), z);
    const s = H * (near ? rnd(0.07, 0.13) : rnd(0.05, 0.16));
    mesh.scale.setScalar(s);
    mesh.position.copy(base);
    mesh.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    objects.push({
      mesh, base,
      amp: rnd(0.6, 2.2),
      freq: rnd(0.25, 0.6),
      phase: rnd(0, 6.28),
      rot: new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.4, 0.4), rnd(-0.2, 0.2)),
    });
  }

  // HUD tracks a few of the nearer objects (like the red boxes in the reference clip).
  const hudTargets = objects
    .filter((o) => o.base.z > -160)
    .slice(0, 9)
    .map((o) => o.mesh);

  function update(dt, time) {
    for (const o of objects) {
      o.mesh.position.set(
        o.base.x + Math.sin(time * o.freq * 0.7 + o.phase) * o.amp * 0.6,
        o.base.y + Math.sin(time * o.freq + o.phase) * o.amp,
        o.base.z + Math.cos(time * o.freq * 0.5 + o.phase) * o.amp * 0.5,
      );
      o.mesh.rotation.x += o.rot.x * dt;
      o.mesh.rotation.y += o.rot.y * dt;
      o.mesh.rotation.z += o.rot.z * dt;
    }
  }

  function dispose() {
    scene.traverse((o) => {
      if (o.geometry && !shapes.includes(o.geometry)) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    shapes.forEach((s) => s.dispose());
  }

  return { scene, update, dispose, hudTargets };
}
