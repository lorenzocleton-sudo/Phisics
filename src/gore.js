import * as THREE from 'three';
import { G } from './state.js';
import { A } from './assets.js';
import { Pool } from './fx.js';

const V = THREE.Vector3;
const R = () => Math.random() - 0.5;
const _v = new V(), _d = new V();

// Blood, decals, arterial spurts, severed chunks and screen blood.
// Gore level: 'high' | 'low' | 'off'. Off swaps blood for embers and ash.
export class Gore {
  constructor(scene) {
    this.scene = scene;
    this.decalN = 0;
    this.blood = new Pool(scene, 7000, false, (x, z, size) => { if (Math.random() < 0.22) this.decal(x, 0.03 + Math.random() * 0.02, z, size * (2 + Math.random() * 3)); });
    this.mist = new Pool(scene, 1500, false);
    this.spurts = [];
    this.chunks = [];
    this.pools = [];
    // decals: 4 splat variants from the atlas, one instanced mesh each
    this.decals = [];
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let k = 0; k < 4; k++) {
      const t = A.splat.clone(); t.needsUpdate = true;
      t.repeat.set(0.5, 0.5); t.offset.set((k % 2) * 0.5, k < 2 ? 0.5 : 0);
      const m = new THREE.MeshStandardMaterial({ color: 0x4a0302, roughness: 0.18, metalness: 0.1, alphaMap: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, envMapIntensity: 1.2 });
      const im = new THREE.InstancedMesh(geo, m, 300);
      im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.renderOrder = 1;
      this.decals.push({ im, i: 0 });
      scene.add(im);
    }
    this.meat = new THREE.MeshStandardMaterial({ color: 0x7a0a08, roughness: 0.35, metalness: 0.05, emissive: 0x120000 });
    this.bone = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 });
    // screen blood
    this.cv = document.getElementById('screenBlood');
    this.ctx = this.cv ? this.cv.getContext('2d') : null;
    this.drips = [];
    this.screenA = 0;
  }
  get level() { return (G.save && G.save.settings && G.save.settings.gore) || 'high'; }

  reset() {
    for (const d of this.decals) { d.im.count = 0; d.i = 0; }
    for (const c of this.chunks) this.scene.remove(c.mesh);
    for (const p of this.pools) this.scene.remove(p.mesh);
    this.chunks = []; this.pools = []; this.spurts = [];
    this.blood.clear(); this.mist.clear();
  }

  // a burst of blood droplets
  burst(p, dir, n, speed = 12, spread = 0.6) {
    const L = this.level;
    if (L === 'off') { G.fx.embers(p, Math.ceil(n / 4)); return; }
    if (L === 'low') n = Math.ceil(n * 0.3);
    for (let i = 0; i < n; i++) {
      const s = speed * (0.4 + Math.random() * 0.8);
      _d.set(dir.x + R() * spread * 2, dir.y + R() * spread * 2, dir.z + R() * spread * 2).normalize();
      const dark = 0.35 + Math.random() * 0.3;
      this.blood.spawn(p.x + R() * 0.4, p.y + R() * 0.4, p.z + R() * 0.4, _d.x * s, _d.y * s, _d.z * s,
        dark, 0.02, 0.015, 0.18 + Math.random() * 0.45, 2.5 + Math.random() * 1.5, 18, 0.25, 0, 0.95);
    }
    for (let i = 0; i < n / 6; i++) {
      this.mist.spawn(p.x, p.y, p.z, dir.x * 4 + R() * 5, dir.y * 4 + R() * 5, dir.z * 4 + R() * 5, 0.45, 0.03, 0.02, 1.2 + Math.random() * 2, 1.2, 1.5, 2.5, 2.5, 0.35);
    }
  }

  // continuous arterial spray from a moving point (pulsing)
  spurt(getPos, getDir, dur, rate = 120, speed = 14) {
    if (this.level === 'off') return;
    this.spurts.push({ getPos, getDir, t: 0, dur, rate: this.level === 'low' ? rate * 0.3 : rate, speed, acc: 0 });
  }

  decal(x, y, z, size) {
    if (this.level === 'off') return;
    const d = this.decals[(this.decalN++) % 4];
    const m = new THREE.Matrix4().compose(new V(x, y, z), new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), Math.random() * 6.28), new V(size, 1, size));
    d.im.setMatrixAt(d.i, m);
    d.i = (d.i + 1) % 300;
    d.im.count = Math.max(d.im.count, d.i === 0 ? 300 : d.i);
    d.im.instanceMatrix.needsUpdate = true;
  }

  // a spreading pool under a corpse
  pool(x, z, size) {
    if (this.level === 'off') return;
    const d = this.decals[Math.floor(Math.random() * 4)];
    const mesh = new THREE.Mesh(d.im.geometry, d.im.material);
    mesh.position.set(x, 0.035, z); mesh.rotation.y = Math.random() * 6.28; mesh.scale.setScalar(0.1);
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    this.pools.push({ mesh, size, t: 0 });
    if (this.pools.length > 12) this.scene.remove(this.pools.shift().mesh);
  }

  // a severed piece flying off with physics and a blood trail
  chunk(mesh, pos, vel, spin, bleed = true) {
    if (this.level === 'off') { G.fx.ash(pos); return; }
    mesh.position.copy(pos);
    this.scene.add(mesh);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.chunks.push({ mesh, vel: vel.clone(), spin: spin.clone(), t: 0, bleed, rest: false });
    if (this.chunks.length > 24) { const c = this.chunks.shift(); this.scene.remove(c.mesh); }
  }

  limbChunk(len, radius, skinMat, withHand) {
    const g = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 4, 10), skinMat);
    limb.rotation.z = Math.PI / 2; g.add(limb);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.98, 16), this.meat);
    cap.position.x = -len / 2 - radius * 0.2; cap.rotation.y = -Math.PI / 2; g.add(cap);
    const bone = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.3, 10), this.bone);
    bone.position.x = -len / 2 - radius * 0.22; bone.rotation.y = -Math.PI / 2; g.add(bone);
    if (withHand) { const h = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.4, 12, 10), skinMat); h.position.x = len / 2 + radius; h.scale.set(1.3, 0.7, 1); g.add(h); }
    return g;
  }
  meatChunk(r) {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.7 + Math.random() * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, this.meat);
  }

  // splatter the camera
  screen(amount) {
    if (!this.ctx || this.level !== 'high') return;
    const c = this.ctx, W = this.cv.width, H = this.cv.height;
    const n = Math.ceil(amount * 8);
    for (let i = 0; i < n; i++) {
      const x = Math.random() < 0.5 ? Math.random() * W * 0.35 : W - Math.random() * W * 0.35;
      const y = Math.random() * H * 0.8;
      const r = 10 + Math.random() * 40 * amount;
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(70,0,0,0.95)'); gr.addColorStop(0.6, 'rgba(110,4,2,0.8)'); gr.addColorStop(1, 'rgba(110,4,2,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      for (let k = 0; k < 6; k++) {
        c.fillStyle = 'rgba(90,2,0,0.85)';
        c.beginPath(); c.arc(x + R() * r * 3, y + R() * r * 3, 1 + Math.random() * 5, 0, 7); c.fill();
      }
      if (Math.random() < 0.7) this.drips.push({ x: x + R() * r * 0.5, y, w: 2 + Math.random() * 5, v: 20 + Math.random() * 50, life: 1.5 + Math.random() * 2 });
    }
    this.screenA = Math.min(1, this.screenA + 0.4 + amount * 0.4);
    this.cv.style.opacity = this.screenA;
  }

  update(dt) {
    this.blood.update(dt); this.mist.update(dt);
    // spurts
    for (let i = this.spurts.length - 1; i >= 0; i--) {
      const s = this.spurts[i];
      s.t += dt;
      if (s.t > s.dur) { this.spurts.splice(i, 1); continue; }
      const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(s.t * 11));
      const fade = 1 - s.t / s.dur;
      s.acc += s.rate * pulse * fade * dt;
      const p = s.getPos(), d = s.getDir();
      if (!p) { this.spurts.splice(i, 1); continue; }
      while (s.acc >= 1) {
        s.acc -= 1;
        const sp = s.speed * (0.7 + Math.random() * 0.5) * (0.5 + pulse * 0.6);
        _d.set(d.x + R() * 0.25, d.y + R() * 0.25, d.z + R() * 0.25).normalize();
        this.blood.spawn(p.x, p.y, p.z, _d.x * sp, _d.y * sp, _d.z * sp, 0.4 + Math.random() * 0.25, 0.02, 0.012, 0.25 + Math.random() * 0.4, 2.5, 18, 0.2, 0, 0.95);
      }
      if (Math.random() < 0.3) this.mist.spawn(p.x, p.y, p.z, d.x * 3, d.y * 3, d.z * 3, 0.4, 0.02, 0.02, 1.5, 1, 1, 2, 2, 0.25);
    }
    // chunks
    for (const c of this.chunks) {
      c.t += dt;
      if (c.rest) continue;
      c.vel.y -= 24 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt;
      if (c.bleed && c.t < 3 && Math.random() < 0.8) {
        _v.copy(c.mesh.position);
        this.blood.spawn(_v.x, _v.y, _v.z, R() * 2, R() * 2, R() * 2, 0.45, 0.02, 0.015, 0.3, 2, 18, 0.2, 0, 0.9);
      }
      if (c.mesh.position.y < 0.6 && c.vel.y < 0) {
        c.mesh.position.y = 0.6;
        if (Math.abs(c.vel.y) > 4) {
          this.decal(c.mesh.position.x, 0.03, c.mesh.position.z, 2 + Math.random() * 3);
          this.burst(c.mesh.position, new V(0, 1, 0), 12, 5, 1);
          c.vel.y *= -0.3; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.5);
        } else { c.rest = true; this.decal(c.mesh.position.x, 0.03, c.mesh.position.z, 4); }
      }
    }
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      if (this.chunks[i].t > 40) { this.scene.remove(this.chunks[i].mesh); this.chunks.splice(i, 1); }
    }
    for (const p of this.pools) { p.t += dt; p.mesh.scale.setScalar(Math.min(p.size, 0.1 + p.t * p.size * 0.25)); }
    // screen blood: drips run down, then everything fades
    if (this.ctx && this.screenA > 0) {
      const c = this.ctx;
      for (let i = this.drips.length - 1; i >= 0; i--) {
        const d = this.drips[i];
        d.life -= dt;
        const ny = d.y + d.v * dt; d.v *= 0.995;
        c.fillStyle = 'rgba(90,3,1,0.9)';
        c.fillRect(d.x - d.w / 2, d.y, d.w, ny - d.y + 1);
        d.y = ny; d.w *= 0.997;
        if (d.life <= 0) this.drips.splice(i, 1);
      }
      this.screenA = Math.max(0, this.screenA - dt * 0.28);
      this.cv.style.opacity = this.screenA;
      if (this.screenA === 0) { c.clearRect(0, 0, this.cv.width, this.cv.height); this.drips = []; }
    }
  }
}
