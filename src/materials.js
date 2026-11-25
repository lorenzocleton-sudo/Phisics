import * as THREE from 'three';
import { A } from './assets.js';

export const U = { time: { value: 0 } };

const COMMON = `
varying vec3 vWP; varying vec3 vWN;
uniform sampler2D tMap; uniform sampler2D tNorm; uniform float uScale; uniform float uNS;
float winMask = 0.0; float winLit = 0.0;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(6.0)); return w / (w.x + w.y + w.z); }
vec4 triSample(sampler2D t, vec3 p, vec3 w){
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
}
vec3 triNormal(vec3 n, vec3 p, vec3 w){
  vec3 tx = texture2D(tNorm, p.zy).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(tNorm, p.xz).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(tNorm, p.xy).xyz * 2.0 - 1.0;
  tx.xy *= uNS; ty.xy *= uNS; tz.xy *= uNS;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}`;

const VERT = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 wp4 = vec4(transformed, 1.0); vec3 wn3 = objectNormal;
      #ifdef USE_INSTANCING
        wp4 = instanceMatrix * wp4; wn3 = mat3(instanceMatrix) * wn3;
      #endif
      vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn3);`);
};

// World-space triplanar PBR material. Works on instanced boxes of any size without UV stretching.
// windows: overlays a facade grid of reflective glass, some panes lit (emissive, so they bloom).
export function triMat({ map, normal, scale = 0.25, rough = 0.85, metal = 0, ns = 1, windows = false, env = 0.7, color = 0xffffff, cell = [3.4, 3.6] }) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: env });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tMap = { value: A.tex[map] };
    sh.uniforms.tNorm = { value: A.tex[normal] };
    sh.uniforms.uScale = { value: scale };
    sh.uniforms.uNS = { value: ns };
    VERT(sh);
    const win = windows ? `
      {
        vec3 n = normalize(vWN);
        if (abs(n.y) < 0.5) {
          float u = abs(n.x) > 0.5 ? vWP.z : vWP.x;
          vec2 c = vec2(u / ${cell[0].toFixed(2)}, vWP.y / ${cell[1].toFixed(2)});
          vec2 f = fract(c); vec2 id = floor(c);
          float frame = step(0.26, f.x) * step(f.x, 0.74) * step(0.28, f.y) * step(f.y, 0.82);
          float inner = step(0.29, f.x) * step(f.x, 0.71) * step(0.31, f.y) * step(f.y, 0.79);
          float above = step(3.2, vWP.y);
          winMask = inner * above;
          float r = h21(id + floor(vWP.xz / 40.0) * 13.0);
          winLit = step(0.9, r) * winMask;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, (frame - inner) * above);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.065, 0.08), winMask);
          float sill = step(0.22, f.y) * step(f.y, 0.28) * step(0.24, f.x) * step(f.x, 0.76) * above;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.72, 0.66), sill);
          float band = step(fract(vWP.y / ${cell[1].toFixed(2)}), 0.05);
          diffuseColor.rgb *= 1.0 - band * 0.25;
          diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 8.0, vWP.y));
        }
      }` : '';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace('#include <map_fragment>', `
        vec3 tN0 = normalize(vWN); vec3 tW = triW(tN0); vec3 tP = vWP * uScale;
        vec4 texel = triSample(tMap, tP, tW);
        diffuseColor *= texel;`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + win)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor * (0.85 + 0.3 * (1.0 - texel.g)), 0.06, winMask);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.5, winMask);')
      .replace('#include <normal_fragment_maps>', `
        { vec3 wn = triNormal(tN0, tP, tW); wn = normalize(mix(wn, tN0, winMask));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * 2.2 * winLit;');
  };
  m.customProgramCacheKey = () => `tri_${map}_${windows}`;
  return m;
}

// Ground: blends cobble / grass / dirt by a painted mask, tinted by the section's paint layer.
export function groundMat(maskTex, tintTex, bounds) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, envMapIntensity: 0.5 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tMask: { value: maskTex }, tTint: { value: tintTex },
      tCob: { value: A.tex.cobble }, tCobN: { value: A.tex.cobble_n }, tGrass: { value: A.tex.grass },
      tDirt: { value: A.tex.dirt }, tDirtN: { value: A.tex.dirt_n },
      uB: { value: new THREE.Vector4(bounds.x0, bounds.z0, bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) },
    });
    VERT(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN;
        uniform sampler2D tMask, tTint, tCob, tCobN, tGrass, tDirt, tDirtN; uniform vec4 uB;
        vec4 gm; vec2 guv;`)
      .replace('#include <map_fragment>', `
        vec2 muv = (vWP.xz - uB.xy) / uB.zw;
        gm = texture2D(tMask, muv); guv = vWP.xz;
        float macro = texture2D(tGrass, guv / 173.0).g;
        vec3 cC = texture2D(tCob, guv / 3.2).rgb;
        vec3 cG = texture2D(tGrass, guv / 7.0).rgb * (0.8 + macro * 0.4);
        vec3 cD = texture2D(tDirt, guv / 6.0).rgb * (0.85 + macro * 0.3);
        float s = gm.r + gm.g + gm.b + 0.0001;
        vec3 gcol = (cC * gm.r + cG * gm.g + cD * gm.b) / s;
        vec3 tint = texture2D(tTint, muv).rgb;
        gcol *= mix(vec3(1.0), tint * 1.7, 0.28);
        diffuseColor.rgb *= gcol;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.78, gm.r / (gm.r + gm.g + gm.b + 0.0001));')
      .replace('#include <normal_fragment_maps>', `{
        vec3 nC = texture2D(tCobN, guv / 3.2).xyz * 2.0 - 1.0;
        vec3 nD = texture2D(tDirtN, guv / 6.0).xyz * 2.0 - 1.0;
        float s2 = gm.r + gm.g + gm.b + 0.0001;
        vec3 tn = normalize(nC * gm.r / s2 + nD * (gm.b + gm.g * 0.4) / s2 + vec3(0.0, 0.0, 1.0) * gm.g * 0.6 / s2);
        vec3 wn = normalize(vec3(tn.x, tn.z, tn.y));
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz); }`);
  };
  m.customProgramCacheKey = () => 'ground';
  return m;
}

export function waterMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0x1d3a44, roughness: 0.06, metalness: 0.15, envMapIntensity: 1.2, transparent: true, opacity: 0.93 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tN = { value: A.tex.water_n }; sh.uniforms.uT = U.time;
    VERT(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform sampler2D tN; uniform float uT;')
      .replace('#include <normal_fragment_maps>', `{
        vec3 a = texture2D(tN, vWP.xz / 18.0 + vec2(uT * 0.02, uT * 0.013)).xyz * 2.0 - 1.0;
        vec3 b = texture2D(tN, vWP.xz / 7.0 - vec2(uT * 0.017, -uT * 0.01)).xyz * 2.0 - 1.0;
        vec3 tn = normalize(a + b); tn.xy *= 0.35;
        normal = normalize((viewMatrix * vec4(normalize(vec3(tn.x, tn.z, tn.y)), 0.0)).xyz); }`);
  };
  return m;
}

export function skinMat(color, tex = 'skin', rough = 0.62) {
  const map = A.tex[tex].clone(); map.repeat.set(3, 3); map.needsUpdate = true;
  const n = A.tex[tex + '_n'].clone(); n.repeat.set(3, 3); n.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color, map, normalMap: n, normalScale: new THREE.Vector2(0.8, 0.8), roughness: rough, metalness: 0, envMapIntensity: 1.0, emissive: new THREE.Color(color).multiplyScalar(0.06) });
}
