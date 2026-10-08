// Post-processing chain: bloom → depth of field → film grain + vignette → tone mapping/sRGB.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.04 },
    vignette: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, grain, vignette;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb += (hash(vUv * 1000.0) - 0.5) * grain;
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = c;
    }`,
};

export const DEFAULT_POST = { bloom: 0.2, bloomThreshold: 0.9, bloomRadius: 0.4, dof: 0, maxBlur: 0.006, grain: 0.03, vignette: 0.3 };

export function createPost(renderer, camera) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.2, 0.4, 0.9);
  const bokeh = new BokehPass(new THREE.Scene(), camera, { focus: 60, aperture: 0, maxblur: 0.006 });
  const grain = new ShaderPass(GrainShader);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(bokeh);
  composer.addPass(grain);
  composer.addPass(new OutputPass());

  let cfg = DEFAULT_POST;

  return {
    composer,
    setScene(scene, preset = {}) {
      renderPass.scene = scene;
      bokeh.scene = scene;
      cfg = { ...DEFAULT_POST, ...preset };
      bloom.strength = cfg.bloom;
      bloom.threshold = cfg.bloomThreshold;
      bloom.radius = cfg.bloomRadius;
      bloom.enabled = cfg.bloom > 0;
      bokeh.enabled = cfg.dof > 0;
      bokeh.uniforms.aperture.value = cfg.dof;
      bokeh.uniforms.maxblur.value = cfg.maxBlur;
      grain.uniforms.grain.value = cfg.grain;
      grain.uniforms.vignette.value = cfg.vignette;
    },
    setSize(w, h) {
      composer.setSize(w, h);
    },
    // focusDist: distance from the eye (cm) that stays sharp — the screen plane.
    render(time, focusDist) {
      grain.uniforms.time.value = time % 100;
      bokeh.uniforms.focus.value = focusDist;
      composer.render();
    },
  };
}
