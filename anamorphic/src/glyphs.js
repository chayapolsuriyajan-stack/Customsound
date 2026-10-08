// 2D glyph outlines (unit size ~1) used for the extruded symbols in both scenes.
import * as THREE from 'three';

function rect(s, x, y, w, h) {
  s.moveTo(x, y);
  s.lineTo(x + w, y);
  s.lineTo(x + w, y + h);
  s.lineTo(x, y + h);
  s.lineTo(x, y);
}

function circlePath(path, cx, cy, r, ccw = false) {
  path.absarc(cx, cy, r, 0, Math.PI * 2, ccw);
}

function poly(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

const t = 0.3; // stroke thickness

export const GLYPHS = {
  plus: () => poly([
    [-t / 2, -0.5], [t / 2, -0.5], [t / 2, -t / 2], [0.5, -t / 2], [0.5, t / 2], [t / 2, t / 2],
    [t / 2, 0.5], [-t / 2, 0.5], [-t / 2, t / 2], [-0.5, t / 2], [-0.5, -t / 2], [-t / 2, -t / 2],
  ]),
  cross: () => {
    const s = GLYPHS.plus();
    const pts = s.getPoints().map((p) => p.rotateAround(new THREE.Vector2(), Math.PI / 4));
    return new THREE.Shape(pts);
  },
  ring: () => {
    const s = new THREE.Shape();
    circlePath(s, 0, 0, 0.5);
    const hole = new THREE.Path();
    circlePath(hole, 0, 0, 0.5 - t, true);
    s.holes.push(hole);
    return s;
  },
  disc: () => {
    const s = new THREE.Shape();
    circlePath(s, 0, 0, 0.45);
    return s;
  },
  square: () => {
    const s = new THREE.Shape();
    rect(s, -0.45, -0.45, 0.9, 0.9);
    return s;
  },
  frame: () => {
    const s = new THREE.Shape();
    rect(s, -0.45, -0.45, 0.9, 0.9);
    const h = new THREE.Path();
    const i = 0.45 - t * 0.9;
    h.moveTo(-i, -i);
    h.lineTo(-i, i);
    h.lineTo(i, i);
    h.lineTo(i, -i);
    h.lineTo(-i, -i);
    s.holes.push(h);
    return s;
  },
  triangle: () => poly([[-0.5, -0.43], [0.5, -0.43], [0, 0.45]]),
  chevronL: () => poly([[0.35, 0.5], [0.35 - t, 0.5], [-0.4, 0], [0.35 - t, -0.5], [0.35, -0.5], [-0.4 + t * 1.2, 0]]),
  chevronR: () => poly([[-0.35, 0.5], [-0.35 + t, 0.5], [0.4, 0], [-0.35 + t, -0.5], [-0.35, -0.5], [0.4 - t * 1.2, 0]]),
  ell: () => poly([[-0.4, 0.5], [-0.4 + t, 0.5], [-0.4 + t, -0.5 + t], [0.45, -0.5 + t], [0.45, -0.5], [-0.4, -0.5]]),
  minus: () => {
    const s = new THREE.Shape();
    rect(s, -0.5, -t / 2, 1, t);
    return s;
  },
  dots: () => {
    // four dots in a 2x2 grid: one compound shape is not possible, so return an array
    return [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]].map(([x, y]) => {
      const s = new THREE.Shape();
      circlePath(s, x, y, 0.17);
      return s;
    });
  },
};

export const GLYPH_NAMES = Object.keys(GLYPHS);

const cache = new Map();

// Extruded, bevelled and centred geometry for a glyph. `depth` is relative to unit size.
export function glyphGeometry(name, depth = 0.4) {
  const key = `${name}:${depth}`;
  if (cache.has(key)) return cache.get(key);
  const geo = new THREE.ExtrudeGeometry(GLYPHS[name](), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 18,
  });
  geo.center();
  geo.computeBoundingSphere();
  cache.set(key, geo);
  return geo;
}
