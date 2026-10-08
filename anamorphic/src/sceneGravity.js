// Scene 1 — "GRAVITY": a white box recessed behind the screen whose back wall is tiled with
// extruded symbols. Symbols ripple in depth, periodically detach, fall to the floor and
// then fly back to their slots.
import * as THREE from 'three';
import { glyphGeometry, GLYPH_NAMES } from './glyphs.js';

const CYCLE = 16; // seconds: drop 0–9, rest 9–12, return 12–14, idle 14–16

function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#5d6168';
  g.font = '600 96px "Helvetica Neue", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.letterSpacing = '48px';
  g.fillText(text, 20, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createGravityScene(W, H) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const D = H * 0.8; // box depth behind the screen

  // Room: inside of a box whose open front face coincides with the screen.
  const roomMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.92, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), roomMat);
  room.position.z = -D / 2;
  room.receiveShadow = true;
  scene.add(room);

  // Lighting: soft fill plus a key light from the upper front that throws shadows into the box.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8ccd0, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(W * 0.25, H * 0.9, 90);
  key.target.position.set(0, -H * 0.1, -D);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const ext = Math.max(W, H) * 0.8;
  Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 600 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.4;
  key.shadow.radius = 4;
  scene.add(key, key.target);

  // Label on the back wall.
  const labelH = H * 0.06;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(labelH * 6.4, labelH),
    new THREE.MeshBasicMaterial({ map: labelTexture('GRAVITY'), transparent: true }),
  );
  label.position.set(W / 2 - labelH * 4, H / 2 - labelH * 1.2, -D + 0.2);
  scene.add(label);

  // Glyph wall.
  const mats = {
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.55 }),
    mid: new THREE.MeshStandardMaterial({ color: 0x8c9097, roughness: 0.6 }),
    light: new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.8 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x48d6e6, roughness: 0.4, emissive: 0x0b4a52 }),
  };
  const pickMat = () => {
    const r = Math.random();
    return r < 0.55 ? mats.dark : r < 0.78 ? mats.mid : r < 0.96 ? mats.light : mats.cyan;
  };

  const cols = 22;
  const cell = W / (cols + 1);
  const top = H / 2 - labelH * 2.2;
  const bottom = -H / 2 + cell * 0.6;
  const rows = Math.floor((top - bottom) / cell);
  const size = cell * 0.78;
  const depth = 0.45;
  const halfDepth = (size * (depth + 0.1)) / 2;
  const glyphs = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const name = GLYPH_NAMES[Math.floor(Math.random() * GLYPH_NAMES.length)];
      const mesh = new THREE.Mesh(glyphGeometry(name, depth), pickMat());
      mesh.scale.setScalar(size);
      const home = new THREE.Vector3(
        (c - (cols - 1) / 2) * cell + (Math.random() - 0.5) * cell * 0.08,
        bottom + (r + 0.5) * cell,
        -D + halfDepth + 0.2,
      );
      const homeQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, Math.random() < 0.3 ? (Math.floor(Math.random() * 4) * Math.PI) / 2 : 0),
      );
      mesh.position.copy(home);
      mesh.quaternion.copy(homeQ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      glyphs.push({
        mesh, home, homeQ,
        state: 'wall', // wall | falling | resting | returning
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        fromP: new THREE.Vector3(),
        fromQ: new THREE.Quaternion(),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  const g = -900; // cm/s², a little lighter than real gravity so it reads on screen
  const floorY = -H / 2;
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  let lastPhase = 0;

  function update(dt, time) {
    dt = Math.min(dt, 1 / 30);
    const phase = time % CYCLE;

    // Start of a new cycle: everything is home again.
    if (phase < lastPhase) {
      for (const s of glyphs) if (s.state !== 'wall') s.state = 'wall';
    }
    lastPhase = phase;

    // Detach glyphs — the rate ramps up through the drop window.
    if (phase < 9) {
      const rate = 4 + phase * 9; // glyphs per second
      let n = rate * dt;
      while (n > 0) {
        if (Math.random() < n) {
          const s = glyphs[Math.floor(Math.random() * glyphs.length)];
          if (s.state === 'wall') {
            s.state = 'falling';
            s.vel.set((Math.random() - 0.5) * 30, Math.random() * 20, 40 + Math.random() * 90);
            s.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6);
          }
        }
        n -= 1;
      }
    }

    // Begin the return flight.
    const returning = phase >= 12 && phase < 14;
    const k = returning ? THREE.MathUtils.smootherstep((phase - 12) / 2, 0, 1) : 0;

    const hs = size * 0.32; // approximate half-extent used for collisions
    for (const s of glyphs) {
      const m = s.mesh;
      if (returning && (s.state === 'falling' || s.state === 'resting')) {
        s.state = 'returning';
        s.fromP.copy(m.position);
        s.fromQ.copy(m.quaternion);
      }
      if (s.state === 'wall') {
        // Gentle depth ripple across the wall.
        const w = Math.sin(time * 1.3 + s.home.x * 0.08 + s.home.y * 0.05 + s.phase * 0.3);
        m.position.set(s.home.x, s.home.y, s.home.z + Math.max(0, w) * size * 0.35);
        m.quaternion.copy(s.homeQ);
      } else if (s.state === 'returning') {
        m.position.lerpVectors(s.fromP, s.home, k);
        m.quaternion.slerpQuaternions(s.fromQ, s.homeQ, k);
        if (phase >= 14 || k >= 1) s.state = 'wall';
      } else if (s.state === 'falling') {
        s.vel.y += g * dt;
        m.position.addScaledVector(s.vel, dt);
        tmpQ.setFromEuler(tmpE.set(s.spin.x * dt, s.spin.y * dt, s.spin.z * dt));
        m.quaternion.multiply(tmpQ);

        // Bounce off the room's walls (front opening is the screen: keep them inside).
        const p = m.position;
        if (p.x < -W / 2 + hs) { p.x = -W / 2 + hs; s.vel.x *= -0.4; }
        if (p.x > W / 2 - hs) { p.x = W / 2 - hs; s.vel.x *= -0.4; }
        if (p.z < -D + hs) { p.z = -D + hs; s.vel.z *= -0.4; }
        if (p.z > -hs) { p.z = -hs; s.vel.z *= -0.3; }
        if (p.y < floorY + hs) {
          p.y = floorY + hs;
          s.vel.y *= -0.28;
          s.vel.x *= 0.7;
          s.vel.z *= 0.7;
          s.spin.multiplyScalar(0.5);
          if (Math.abs(s.vel.y) < 25) {
            s.state = 'resting';
            // Settle flat on the floor so piles look plausible.
            tmpE.setFromQuaternion(m.quaternion);
            m.quaternion.setFromEuler(tmpE.set(-Math.PI / 2, 0, tmpE.z));
          }
        }
      }
    }
  }

  function dispose() {
    scene.traverse((o) => {
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    room.geometry.dispose();
    label.geometry.dispose();
  }

  return { scene, update, dispose, hudTargets: [] };
}
