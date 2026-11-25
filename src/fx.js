import * as THREE from 'three';

export class Pool {
  constructor(scene, n, additive, onGround = null) {
    this.n = n; this.i = 0; this.onGround = onGround;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.grow = new Float32Array(n); this.a0 = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        void main(){ vC=color; vA=alpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
        gl_PointSize = size * (420.0 / max(0.5, -mv.z)); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
        gl_FragColor=vec4(vC, vA*smoothstep(0.5,0.1,d)); }`,
      fog: false,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, r, gg, b, size, life, grav = 0, drag = 0, grow = 0, alpha = 1) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = gg; this.col[i * 3 + 2] = b;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
    this.a0[i] = alpha; this.alpha[i] = alpha;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = 1 - this.drag[i] * dt;
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.onGround && this.pos[i * 3 + 1] < 0.04 && this.vel[i * 3 + 1] < 0) { this.onGround(this.pos[i * 3], this.pos[i * 3 + 2], this.size[i]); this.life[i] = 0; continue; }
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = Math.max(0, this.life[i] / this.max[i]) * this.a0[i];
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

const R = () => Math.random() - 0.5;

export class FX {
  constructor(scene) {
    this.soft = new Pool(scene, 2600, false);
    this.glow = new Pool(scene, 1800, true);
    this.gasAcc = 0;
  }
  update(dt) { this.soft.update(dt); this.glow.update(dt); }
  clear() { this.soft.clear(); this.glow.clear(); }
  gasTrail(p, v) {
    this.gasAcc += 1;
    if (this.gasAcc % 2) return;
    this.soft.spawn(p.x + R() * 0.3, p.y - 0.1, p.z + R() * 0.3, -v.x * 0.1 + R(), -v.y * 0.1 + R(), -v.z * 0.1 + R(), 0.92, 0.94, 0.96, 0.35, 0.8, -0.3, 1.5, 1.4, 0.45);
  }
  gasBurst(p, d, n) {
    for (let i = 0; i < n; i++) this.soft.spawn(p.x, p.y, p.z, d.x * 8 + R() * 4, d.y * 8 + R() * 4, d.z * 8 + R() * 4, 0.95, 0.96, 0.98, 0.5, 0.7, 0, 3, 2, 0.6);
  }
  sparks(p, n) {
    for (let i = 0; i < n; i++) this.glow.spawn(p.x, p.y, p.z, R() * 14, R() * 14 + 3, R() * 14, 1, 0.85, 0.55, 0.12, 0.4, 18, 1, 0, 1);
  }
  embers(p, n) {
    for (let i = 0; i < n; i++) this.glow.spawn(p.x + R(), p.y + R(), p.z + R(), R() * 10, Math.random() * 9 + 2, R() * 10, 1, 0.45 + Math.random() * 0.3, 0.12, 0.25 + Math.random() * 0.3, 1.2 + Math.random(), -1.5, 1.2, -0.1, 1);
  }
  ash(p) {
    this.soft.spawn(p.x, p.y, p.z, R() * 2, 2 + Math.random() * 3, R() * 2, 0.35, 0.33, 0.32, 1.2 + Math.random(), 2.5, -0.6, 0.5, 1, 0.55);
    if (Math.random() < 0.5) this.glow.spawn(p.x, p.y, p.z, R() * 3, 3 + Math.random() * 3, R() * 3, 1, 0.5, 0.15, 0.25, 1.8, -0.8, 0.5, -0.05, 1);
  }
  steam(p, s = 1, n = 2) {
    for (let i = 0; i < n; i++) this.soft.spawn(p.x + R() * s, p.y + R() * s, p.z + R() * s, R() * 2, 2 + Math.random() * 3, R() * 2, 0.9, 0.88, 0.86, s * 0.8, 2.2, -0.8, 0.6, s * 0.8, 0.35);
  }
  dust(p, s, n = 6) {
    for (let i = 0; i < n; i++) this.soft.spawn(p.x + R() * s, 0.3, p.z + R() * s, R() * s * 1.5, Math.random() * 2, R() * s * 1.5, 0.62, 0.56, 0.46, s * 0.5, 1.4, 0.5, 1.5, s * 0.4, 0.5);
  }
}
