// Scene 1 — "GRAVITY": a white box recessed behind the screen whose back wall is tiled with
// extruded symbols. Symbols ripple in depth, periodically detach, tumble and pile up on the
// floor (rigid-body physics via cannon-es), then fly back to their slots.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
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

  // Physics world: the room is five static planes plus the screen glass at z = 0.
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -900, 0) }); // cm/s², a bit lighter than real
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 10;
  world.defaultContactMaterial.friction = 0.5;
  world.defaultContactMaterial.restitution = 0.15;
  const addPlane = (x, y, z, ax, ay, az, angle) => {
    const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    b.position.set(x, y, z);
    if (angle) b.quaternion.setFromAxisAngle(new CANNON.Vec3(ax, ay, az), angle);
    world.addBody(b);
  };
  addPlane(0, -H / 2, 0, 1, 0, 0, -Math.PI / 2); // floor
  addPlane(0, H / 2, 0, 1, 0, 0, Math.PI / 2); // ceiling
  addPlane(0, 0, -D, 0, 0, 0, 0); // back wall
  addPlane(0, 0, 0, 0, 1, 0, Math.PI); // screen glass
  addPlane(-W / 2, 0, 0, 0, 1, 0, Math.PI / 2); // left
  addPlane(W / 2, 0, 0, 0, 1, 0, -Math.PI / 2); // right

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
      const bb = mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox);
      const he = bb.getSize(new THREE.Vector3()).multiplyScalar(size / 2);
      const body = new CANNON.Body({
        mass: 1,
        type: CANNON.Body.KINEMATIC,
        shape: new CANNON.Box(new CANNON.Vec3(he.x, he.y, he.z)),
        sleepSpeedLimit: 4,
        linearDamping: 0.05,
        angularDamping: 0.1,
      });
      body.position.set(home.x, home.y, home.z);
      body.quaternion.set(homeQ.x, homeQ.y, homeQ.z, homeQ.w);
      world.addBody(body);
      glyphs.push({
        body,
        mesh, home, homeQ,
        state: 'wall', // wall | falling | returning
        fromP: new THREE.Vector3(),
        fromQ: new THREE.Quaternion(),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  let lastPhase = 0;

  function setKinematic(s) {
    s.body.type = CANNON.Body.KINEMATIC;
    s.body.velocity.setZero();
    s.body.angularVelocity.setZero();
    s.body.updateMassProperties();
  }

  function syncBody(s) {
    const p = s.mesh.position, q = s.mesh.quaternion;
    s.body.position.set(p.x, p.y, p.z);
    s.body.quaternion.set(q.x, q.y, q.z, q.w);
  }

  function update(dt, time) {
    const phase = time % CYCLE;

    // Start of a new cycle: everything is home again.
    if (phase < lastPhase) {
      for (const s of glyphs) if (s.state !== 'wall') { s.state = 'wall'; setKinematic(s); }
    }
    lastPhase = phase;

    // Detach glyphs — the share that has fallen follows the cycle clock (accelerating),
    // so the effect looks the same at any frame rate.
    if (phase < 9) {
      const want = Math.floor(glyphs.length * 0.6 * Math.pow(phase / 9, 1.6));
      let fallen = glyphs.length - glyphs.filter((s) => s.state === 'wall').length;
      for (let tries = 0; fallen < want && tries < 200; tries++) {
        const s = glyphs[Math.floor(Math.random() * glyphs.length)];
        if (s.state !== 'wall') continue;
        s.state = 'falling';
        const b = s.body;
        b.type = CANNON.Body.DYNAMIC;
        b.updateMassProperties();
        b.velocity.set((Math.random() - 0.5) * 30, Math.random() * 20, 40 + Math.random() * 90);
        b.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6);
        b.wakeUp();
        fallen++;
      }
    }

    // Return flight: take the glyphs out of the simulation and tween them home.
    const returning = phase >= 12 && phase < 14;
    const k = returning ? THREE.MathUtils.smootherstep((phase - 12) / 2, 0, 1) : 0;

    for (const s of glyphs) {
      const m = s.mesh;
      if (returning && s.state === 'falling') {
        s.state = 'returning';
        setKinematic(s);
        s.fromP.copy(m.position);
        s.fromQ.copy(m.quaternion);
      }
      if (s.state === 'wall') {
        // Gentle depth ripple across the wall; the kinematic body follows so it can knock others.
        const w = Math.sin(time * 1.3 + s.home.x * 0.08 + s.home.y * 0.05 + s.phase * 0.3);
        m.position.set(s.home.x, s.home.y, s.home.z + Math.max(0, w) * size * 0.35);
        m.quaternion.copy(s.homeQ);
        syncBody(s);
      } else if (s.state === 'returning') {
        m.position.lerpVectors(s.fromP, s.home, k);
        m.quaternion.slerpQuaternions(s.fromQ, s.homeQ, k);
        syncBody(s);
        if (phase >= 14 || k >= 1) s.state = 'wall';
      }
    }

    world.step(1 / 60, Math.min(dt, 0.1), 3);

    for (const s of glyphs) {
      if (s.state !== 'falling') continue;
      const { position: p, quaternion: q } = s.body;
      s.mesh.position.set(p.x, p.y, p.z);
      s.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  function dispose() {
    while (world.bodies.length) world.removeBody(world.bodies[0]);
    scene.traverse((o) => {
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    room.geometry.dispose();
    label.geometry.dispose();
  }

  return {
    scene, update, dispose, hudTargets: [], glyphs,
    post: { bloom: 0.12, bloomThreshold: 0.97, dof: 0.00015, grain: 0.03, vignette: 0.22 },
  };
}
