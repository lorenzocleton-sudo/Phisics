import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';

const Grade = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.4 }, uCA: { value: 0 }, uBlur: { value: 0 }, uHurt: { value: 0 }, uSat: { value: 1.1 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uCA, uBlur, uHurt, uSat, uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * uCA * r2).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * uCA * r2).b);
      if (uBlur > 0.001) {
        vec3 acc = c;
        for (int i = 1; i <= 6; i++) acc += texture2D(tDiffuse, vUv - d * uBlur * float(i) * 0.025 * smoothstep(0.02, 0.2, r2)).rgb;
        c = acc / 7.0;
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      float edge = smoothstep(0.08, 0.35, r2);
      c = mix(c, c * vec3(1.0, 0.25, 0.2) + vec3(0.12, 0.0, 0.0), uHurt * edge);
      c *= 1.0 - uVig * r2 * 1.6;
      c += (h(vUv * 731.0 + uTime) - 0.5) * 0.012;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, vm) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.vm = vm;
    this.hurtT = 0;
    this.build('high');
  }
  build(q) {
    this.q = q;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q === 'low' ? 0 : 4 });
    if (this.composer) this.composer.dispose();
    this.composer = new EffectComposer(this.renderer, rt);
    if (q === 'low') {
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.ao = null;
    } else {
      this.ao = new N8AOPass(this.scene, this.camera, size.x, size.y);
      Object.assign(this.ao.configuration, { aoRadius: 6, distanceFalloff: 2, intensity: q === 'high' ? 3 : 2.2, halfRes: q !== 'high', aoSamples: q === 'high' ? 16 : 8, denoiseSamples: 4, denoiseRadius: 12, screenSpaceRadius: false, gammaCorrection: false });
      this.composer.addPass(this.ao);
    }
    const vmPass = new RenderPass(this.vm.scene, this.vm.camera);
    vmPass.clear = false; vmPass.clearDepth = true;
    this.composer.addPass(vmPass);
    if (q !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.55, 0.95);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  setSize(w, h) {
    this.composer.setSize(w, h);
    if (this.ao) this.ao.setSize(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }
  hurt() { this.hurtT = 1; }
  update(dt, speed) {
    const u = this.grade.uniforms;
    this.hurtT = Math.max(0, this.hurtT - dt * 1.5);
    u.uHurt.value = this.hurtT;
    u.uTime.value = (u.uTime.value + dt) % 100;
    const s = Math.max(0, Math.min(1, (speed - 25) / 40));
    u.uCA.value = 0.004 + s * 0.06;
    u.uBlur.value = s;
  }
  render() { this.composer.render(); }
}
