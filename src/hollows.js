import * as THREE from 'three';
import { G } from './state.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V();
const tmpBoxes = [];

export const TYPES = {
  drudge:    { name: 'Drudge', h: [8, 12], walk: 3.2, run: 7.5, seam: 30, ankle: 14, xp: 40, marks: 22, build: 'normal', grab: 0.35, skin: [0xcdb9a3, 0xc4ae98, 0xd6c4ae, 0xbba48e] },
  sprinter:  { name: 'Sprinter', h: [7, 10], walk: 5, run: 13.5, seam: 24, ankle: 12, xp: 55, marks: 32, build: 'lanky', grab: 0.2, leap: true, skin: [0xbfae9c, 0xb39f8a, 0xc9b6a0] },
  brute:     { name: 'Brute', h: [14, 18], walk: 2.6, run: 5.8, seam: 70, ankle: 30, xp: 95, marks: 60, build: 'bulky', grab: 0.25, stomp: true, skin: [0xa89482, 0xb19c88, 0x9c8a78] },
  thornback: { name: 'Thornback', h: [26, 26], walk: 2.4, run: 6.5, seam: 120, ankle: 46, xp: 450, marks: 400, build: 'thorn', grab: 0.3, stomp: true, boss: true, armoredNape: true, kneelBoth: true, skin: [0x8f8174] },
  dummy:     { name: 'Training Dummy', h: [9, 9], seam: 14, ankle: 9, xp: 8, marks: 0, build: 'normal', static: true, skin: [0x9b7a52] },
};

const BUILDS = {
  normal: { leg: 0.44, hipW: 0.07, thR: 0.045, tH: 0.30, tW: 0.26, tD: 0.15, neck: 0.04, hR: 0.085, shW: 0.16, arm: 0.4, aR: 0.035 },
  lanky:  { leg: 0.5, hipW: 0.06, thR: 0.032, tH: 0.27, tW: 0.2, tD: 0.12, neck: 0.05, hR: 0.07, shW: 0.13, arm: 0.5, aR: 0.026 },
  bulky:  { leg: 0.38, hipW: 0.1, thR: 0.065, tH: 0.34, tW: 0.36, tD: 0.22, neck: 0.03, hR: 0.08, shW: 0.22, arm: 0.42, aR: 0.055 },
  thorn:  { leg: 0.4, hipW: 0.1, thR: 0.062, tH: 0.34, tW: 0.34, tD: 0.22, neck: 0.03, hR: 0.08, shW: 0.21, arm: 0.44, aR: 0.05 },
};

let GEO = null;
function geo() {
  if (GEO) return GEO;
  GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 0.85, 1, 8).translate(0, -0.5, 0),
    sph: new THREE.SphereGeometry(1, 12, 10),
    cone: new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
  };
  return GEO;
}

export class Hollow {
  constructor(type, x, z, rng = Math.random) {
    this.type = type;
    this.T = TYPES[type];
    this.H = this.T.h[0] + (this.T.h[1] - this.T.h[0]) * rng();
    this.B = BUILDS[this.T.build];
    this.pos = new V(x, 0, z);
    this.vel = new V();
    this.yaw = rng() * Math.PI * 2;
    this.state = this.T.static ? 'static' : 'wander';
    this.timer = 0; this.cd = 2 + rng() * 2;
    this.target = new V(x, 0, z);
    this.seamHp = this.T.seam;
    this.ankleHp = [this.T.ankle, this.T.ankle];
    this.cut = [false, false];
    this.kneelT = 0; this.stagger = 0; this.flinch = 0;
    this.phase = rng() * 10;
    this.dead = false; this.deathT = 0;
    this.waypoint = null;
    this.aggro = false;
    this.stuck = 0; this.detour = 0; this.detourT = 0;
    this.stepAcc = 0;
    this.build();
    this.updateParts();
  }

  build() {
    const g = geo(), B = this.B, T = this.T;
    const skin = T.skin[Math.floor(Math.random() * T.skin.length)];
    const mat = new THREE.MeshLambertMaterial({ color: skin, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a1a18 });
    const plate = new THREE.MeshLambertMaterial({ color: 0x5e5650, flatShading: true });
    this.mats = [mat, dark, plate];
    const mesh = (gm, m, sx, sy, sz, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(gm, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; return o;
    };
    const root = new THREE.Group();
    root.scale.setScalar(this.H);
    const hips = new THREE.Group(); hips.position.y = B.leg; root.add(hips);
    // torso: a slightly tapered stack
    hips.add(mesh(g.box, mat, B.tW * 0.85, B.tH * 0.45, B.tD, 0, B.tH * 0.22, 0));
    hips.add(mesh(g.box, mat, B.tW, B.tH * 0.6, B.tD * 1.05, 0, B.tH * 0.68, 0));
    // ribs/cracks: dark seams on chest
    for (let i = 0; i < 3; i++) hips.add(mesh(g.box, dark, B.tW * 0.7, 0.004, 0.003, 0, B.tH * (0.5 + i * 0.1), -B.tD * 0.53));
    const neck = new THREE.Group(); neck.position.y = B.tH; hips.add(neck);
    neck.add(mesh(g.cyl, mat, B.hR * 0.45, -B.neck - 0.01, B.hR * 0.45, 0, 0, 0));
    const head = new THREE.Group(); head.position.y = B.neck; neck.add(head);
    head.add(mesh(g.sph, mat, B.hR, B.hR * 1.12, B.hR * 1.02, 0, B.hR, 0));
    // hollow eye sockets with faint embers
    const ember = new THREE.MeshBasicMaterial({ color: 0xffa24a });
    for (const s of [-1, 1]) {
      head.add(mesh(g.sph, dark, B.hR * 0.24, B.hR * 0.2, B.hR * 0.12, s * B.hR * 0.38, B.hR * 1.2, -B.hR * 0.88));
      head.add(mesh(g.sph, ember, B.hR * 0.05, B.hR * 0.05, B.hR * 0.04, s * B.hR * 0.38, B.hR * 1.2, -B.hR * 0.97));
    }
    // wide grin
    head.add(mesh(g.box, dark, B.hR * 1.15, B.hR * 0.18, B.hR * 0.2, 0, B.hR * 0.6, -B.hR * 0.86));
    const teeth = new THREE.MeshLambertMaterial({ color: 0xe8e0cc });
    for (let i = -3; i <= 3; i++) head.add(mesh(g.box, teeth, B.hR * 0.09, B.hR * 0.1, B.hR * 0.05, i * B.hR * 0.15, B.hR * 0.62, -B.hR * 0.97));
    // ember seam on the nape (the only weak point)
    this.seamMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
    this.seam = mesh(g.sph, this.seamMat, B.hR * 0.7, B.hR * 0.25, B.hR * 0.22, 0, B.hR * 0.45, B.hR * 0.92);
    head.add(this.seam);
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * B.shW, B.tH * 0.9, 0); hips.add(sh);
      sh.add(mesh(g.sph, mat, B.aR * 1.6, B.aR * 1.6, B.aR * 1.6));
      sh.add(mesh(g.cyl, mat, B.aR, B.arm * 0.5, B.aR));
      const el = new THREE.Group(); el.position.y = -B.arm * 0.5; sh.add(el);
      el.add(mesh(g.cyl, mat, B.aR * 0.85, B.arm * 0.5, B.aR * 0.85));
      const hand = new THREE.Group(); hand.position.y = -B.arm * 0.5; el.add(hand);
      hand.add(mesh(g.sph, mat, B.aR * 1.5, B.aR * 1.9, B.aR * 1.2, 0, -B.aR, 0));
      if (T.build === 'bulky' || T.build === 'thorn') {
        el.add(mesh(g.box, plate, B.aR * 2.4, B.arm * 0.35, B.aR * 2.4, 0, -B.arm * 0.25, 0));
        sh.add(mesh(g.box, plate, B.aR * 3, B.aR * 1.4, B.aR * 3, 0, B.aR * 0.6, 0));
      }
      this.arms.push({ sh, el, hand, s });
    }
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * B.hipW, B.leg, 0); root.add(hip);
      hip.add(mesh(g.cyl, mat, B.thR, B.leg * 0.5, B.thR));
      const knee = new THREE.Group(); knee.position.y = -B.leg * 0.5; hip.add(knee);
      knee.add(mesh(g.cyl, mat, B.thR * 0.8, B.leg * 0.5, B.thR * 0.8));
      knee.add(mesh(g.box, mat, B.thR * 2, B.thR * 0.8, B.thR * 3.2, 0, -B.leg * 0.5 + B.thR * 0.3, -B.thR * 0.8));
      // ankle tendon glows faintly so players learn where to cut
      knee.add(mesh(g.sph, new THREE.MeshBasicMaterial({ color: 0xc8643a }), B.thR * 0.5, B.thR * 0.5, B.thR * 0.3, 0, -B.leg * 0.42, B.thR * 0.75));
      if (T.build === 'bulky' || T.build === 'thorn') hip.add(mesh(g.box, plate, B.thR * 2.6, B.leg * 0.3, B.thR * 2.6, 0, -B.leg * 0.2, 0));
      this.legs.push({ hip, knee, s });
    }
    if (T.build === 'thorn') {
      // bone plates over the back and nape
      this.napeGuard = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const sp = mesh(g.cone, plate, B.tW * 0.12, B.tH * 0.35, B.tW * 0.12, (i % 2 ? 1 : -1) * B.tW * 0.18, B.tH * (0.2 + i * 0.12), B.tD * 0.55);
        sp.rotation.x = 0.6; hips.add(sp);
      }
      const guard = mesh(g.box, plate, B.hR * 1.3, B.hR * 0.7, B.hR * 0.35, 0, B.hR * 0.5, B.hR * 1.05);
      head.add(guard); this.guard = guard;
    }
    if (T.static) {
      // training dummy: post through the body
      root.add(mesh(g.box, new THREE.MeshLambertMaterial({ color: 0x5e4530 }), 0.03, 1, 0.03, 0, 0.5, 0.08));
    }
    this.group = root; this.hips = hips; this.neck = neck; this.head = head;
    // hit/collision definitions (unit space; radii scale by H)
    this.sphereDefs = [
      { o: hips, l: new V(0, B.tH * 0.6, 0), r: B.tW * 0.55 },
      { o: hips, l: new V(0, B.tH * 0.15, 0), r: B.tW * 0.45 },
      { o: head, l: new V(0, B.hR, 0), r: B.hR * 1.15 },
      ...this.legs.flatMap((L) => [{ o: L.hip, l: new V(0, -B.leg * 0.25, 0), r: B.thR * 1.5 }, { o: L.knee, l: new V(0, -B.leg * 0.25, 0), r: B.thR * 1.3 }]),
      ...this.arms.flatMap((A) => [{ o: A.el, l: new V(0, -B.arm * 0.25, 0), r: B.aR * 1.6 }, { o: A.hand, l: new V(0, -B.aR, 0), r: B.aR * 2 }]),
    ];
    this.partDefs = [
      { kind: 'nape', o: head, l: new V(0, B.hR * 0.45, B.hR * 0.95), r: B.hR * 0.75 },
      { kind: 'ankle0', o: this.legs[0].knee, l: new V(0, -B.leg * 0.4, 0), r: B.thR * 1.9 },
      { kind: 'ankle1', o: this.legs[1].knee, l: new V(0, -B.leg * 0.4, 0), r: B.thR * 1.9 },
    ];
    this.spheres = this.sphereDefs.map(() => ({ c: new V(), r: 0 }));
    this.parts = this.partDefs.map((p) => ({ kind: p.kind, c: new V(), r: 0 }));
  }

  updateParts() {
    const g = this.group;
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    g.updateMatrixWorld(true);
    this.sphereDefs.forEach((d, i) => { this.spheres[i].c.copy(d.l).applyMatrix4(d.o.matrixWorld); this.spheres[i].r = d.r * this.H; });
    this.partDefs.forEach((d, i) => { this.parts[i].c.copy(d.l).applyMatrix4(d.o.matrixWorld); this.parts[i].r = d.r * this.H; });
  }

  handWorld() {
    return this.arms[1].hand.localToWorld(new V(0, -this.B.aR * 2, 0));
  }

  // ---------------------------------------------------------------- AI
  update(dt) {
    const P = G.player;
    if (this.dead) { this.updateDeath(dt); return; }
    if (this.T.static) { this.animateIdle(dt); this.updateParts(); return; }
    this.timer += dt; this.cd -= dt;
    const toP = _a.set(P.pos.x - this.pos.x, 0, P.pos.z - this.pos.z);
    const distH = toP.length();
    const sees = !P.dead && distH < (this.aggro ? 220 : 140);
    if (sees && !this.aggro) {
      this.aggro = true;
      G.audio.roar(distH, this.H);
    }
    if (!sees) this.aggro = false;
    if (this.flinch > 0) this.flinch -= dt;

    if (this.kneelT > 0) {
      this.kneelT -= dt;
      if (this.kneelT <= 0) { this.cut = [false, false]; this.ankleHp = [this.T.ankle, this.T.ankle]; this.state = 'chase'; }
      this.animateKneel(dt);
      this.updateParts();
      return;
    }
    if (this.stagger > 0) { this.stagger -= dt; this.animateIdle(dt); this.updateParts(); return; }

    let speed = 0;
    const reach = this.H * 0.6;
    const pHeight = P.pos.y;
    switch (this.state) {
      case 'wander': {
        if (this.waypoint) { this.target.copy(this.waypoint); }
        else if (this.timer > 6 || this.pos.distanceTo(this.target) < 6) {
          this.timer = 0;
          this.target.set(this.pos.x + (Math.random() - 0.5) * 120, 0, this.pos.z + (Math.random() - 0.5) * 120);
          const B = G.world.bounds;
          this.target.x = THREE.MathUtils.clamp(this.target.x, B.x0 + 30, B.x1 - 30);
          this.target.z = THREE.MathUtils.clamp(this.target.z, B.z0 + 30, B.z1 - 30);
        }
        speed = this.waypoint ? this.T.run * 0.7 : this.T.walk;
        if (this.waypoint && this.pos.distanceTo(this.waypoint) < 18) this.waypoint = null;
        if (this.aggro && !this.waypoint) this.state = 'chase';
        break;
      }
      case 'chase': {
        if (!this.aggro) { this.state = 'wander'; break; }
        this.target.set(P.pos.x, 0, P.pos.z);
        speed = this.T.run;
        if (distH < reach + 2) speed = this.T.walk * 0.5;
        if (this.cd <= 0) {
          if (this.T.stomp && distH < this.H * 0.55 && pHeight < 4) { this.state = 'stomp'; this.timer = 0; }
          else if (distH < reach && pHeight < this.H * 1.15 && pHeight > 0) { this.state = 'windup'; this.timer = 0; }
          else if (this.T.leap && distH > 22 && distH < 70 && pHeight < this.H * 1.4) {
            this.state = 'leap'; this.timer = 0;
            const t = 1.1;
            this.vel.set(toP.x / t, 13, toP.z / t);
            G.audio.play('roarShort');
          }
        }
        break;
      }
      case 'windup': {
        this.faceTo(P.pos, dt, 3);
        this.aimArm(P.pos);
        if (this.timer > 0.6) { this.state = 'strike'; this.timer = 0; this.hitDone = false; G.audio.play('swoosh'); }
        break;
      }
      case 'strike': {
        if (!this.hitDone && this.timer > 0.08) {
          // swipe zone in front of the body, in units of the Hollow's height
          const L = this.group.worldToLocal(_b.copy(P.pos));
          const inZone = L.z < 0.2 && Math.abs(L.x) < 0.5 && Math.hypot(L.x, L.z) < 0.85 && L.y > -0.1 && L.y < 1.0;
          if (inZone) {
            this.hitDone = true;
            if (Math.random() < this.T.grab && !P.grabbedBy && P.invuln <= 0) {
              this.state = 'hold'; this.timer = 0; P.grabbedBy = this; P.escape = 0;
              G.ui.toast('GRABBED! Mash F / Click to cut free!', 'warn');
              G.audio.play('grab');
              break;
            }
            _b.subVectors(P.pos, this.pos).setY(0).normalize().multiplyScalar(22).setY(8);
            P.hurt(this.T.boss ? 40 : 26, _b);
          }
        }
        if (this.timer > 0.35) { this.state = 'recover'; this.timer = 0; }
        break;
      }
      case 'recover': {
        if (this.timer > 0.7) { this.state = 'chase'; this.cd = 1.2 + Math.random(); }
        break;
      }
      case 'hold': {
        if (P.grabbedBy !== this) { this.state = 'recover'; this.timer = 0; break; }
        P.hp -= 7 * dt; P.sinceHit = 0;
        if (P.hp <= 0) { P.hp = 1; }
        if (this.timer > 4.5) {
          this.release(false);
          P.hurt(45, new V(0, 6, 0));
        }
        break;
      }
      case 'leap': {
        this.vel.y -= 24 * dt;
        this.pos.addScaledVector(this.vel, dt);
        this.faceTo(P.pos, dt, 6);
        if (!this.hitDone && P.pos.distanceTo(_b.copy(this.pos).setY(this.H * 0.6)) < this.H * 0.45) {
          this.hitDone = true;
          P.hurt(24, _b.subVectors(P.pos, this.pos).setY(0).normalize().multiplyScalar(18).setY(6));
        }
        if (this.pos.y <= 0 && this.vel.y < 0) {
          this.pos.y = 0; this.vel.set(0, 0, 0); this.hitDone = false;
          this.state = 'recover'; this.timer = 0; this.cd = 3;
          this.impact(0.7);
        }
        this.animateLeap(dt); this.updateParts();
        return;
      }
      case 'stomp': {
        if (this.timer > 0.65 && !this.stomped) {
          this.stomped = true;
          this.impact(1.5);
          const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
          if (d < this.H * 0.6 && P.pos.y < 3) {
            P.hurt(this.T.boss ? 35 : 22, _b.subVectors(P.pos, this.pos).setY(0).normalize().multiplyScalar(20).setY(10));
          }
        }
        if (this.timer > 1.1) { this.state = 'chase'; this.stomped = false; this.cd = 2; }
        break;
      }
    }
    if (speed > 0 && this.flinch <= 0) this.moveToward(this.target, speed, dt);
    this.animate(dt, speed);
    this.separate();
    this.updateParts();
  }

  aimArm(p) {
    const B = this.B;
    const L = this.group.worldToLocal(_b.copy(p));
    const dy = L.y - (B.leg + B.tH * 0.9), dz = L.z;
    this.aimA = THREE.MathUtils.clamp(Math.atan2(-dz, -dy), 0.15, 2.4);
  }

  faceTo(p, dt, rate) {
    const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
  }

  moveToward(t, speed, dt) {
    let dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return;
    let ang = Math.atan2(-dx, -dz);
    if (this.detourT > 0) { ang += this.detour; this.detourT -= dt; }
    let diff = ang - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += THREE.MathUtils.clamp(diff, -1.6 * dt, 1.6 * dt);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const step = speed * dt * Math.max(0.2, Math.cos(Math.min(Math.abs(diff), 1.5)));
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += fx * step; this.pos.z += fz * step;
    this.collide();
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (moved < step * 0.3) {
      this.stuck += dt;
      if (this.stuck > 0.8) { this.detour = (Math.random() < 0.5 ? -1 : 1) * 1.2; this.detourT = 2.2; this.stuck = 0; }
    } else this.stuck = Math.max(0, this.stuck - dt);
    // footsteps
    this.stepAcc += step;
    if (this.stepAcc > this.H * 0.35) {
      this.stepAcc = 0;
      const dist = this.pos.distanceTo(G.player.pos);
      G.audio.step(dist, this.H);
      if (dist < this.H * 4) G.player.shake = Math.max(G.player.shake, (this.H / 40) * (1 - dist / (this.H * 4)));
      G.fx.dust(this.pos, this.H * 0.15);
    }
  }

  collide() {
    const r = this.H * 0.12;
    const W = G.world;
    W.query(this.pos.x - r, this.pos.z - r, this.pos.x + r, this.pos.z + r, tmpBoxes);
    for (const b of tmpBoxes) {
      if (b.y1 < Math.max(6, this.H * 0.45) || b.y0 > this.H * 0.7) continue;
      const cx = THREE.MathUtils.clamp(this.pos.x, b.x0, b.x1), cz = THREE.MathUtils.clamp(this.pos.z, b.z0, b.z1);
      const dx = this.pos.x - cx, dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); this.pos.x = cx + (dx / d) * r; this.pos.z = cz + (dz / d) * r; }
        else {
          const l = this.pos.x - b.x0, rr = b.x1 - this.pos.x, n = this.pos.z - b.z0, s = b.z1 - this.pos.z;
          const m = Math.min(l, rr, n, s);
          if (m === l) this.pos.x = b.x0 - r; else if (m === rr) this.pos.x = b.x1 + r; else if (m === n) this.pos.z = b.z0 - r; else this.pos.z = b.z1 + r;
        }
      }
    }
  }

  separate() {
    for (const o of G.hollows) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const min = (this.H + o.H) * 0.14;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push;
      }
    }
  }

  impact(strength) {
    const dist = this.pos.distanceTo(G.player.pos);
    G.audio.step(dist * 0.6, this.H * 1.5);
    G.fx.dust(this.pos, this.H * 0.35, 20);
    if (dist < this.H * 5) G.player.shake = Math.max(G.player.shake, strength * (1 - dist / (this.H * 5)));
  }

  release(escaped) {
    if (G.player.grabbedBy === this) G.player.grabbedBy = null;
    this.state = 'recover'; this.timer = 0;
    if (escaped) { this.stagger = 1.6; this.cd = 2.5; }
  }

  // ---------------------------------------------------------------- damage
  takeHit(kind, dmg, P) {
    const pc = this.parts.find((p) => p.kind === kind).c;
    if (kind === 'nape') {
      if (this.T.armoredNape && this.kneelT <= 0) {
        G.fx.sparks(pc, 14); G.audio.play('clang');
        G.ui.popup(pc, 'ARMORED', '#9aa3ad');
        G.ui.toast('Its nape is plated. Cut both ankles to bring it down!');
        return 'armored';
      }
      this.seamHp -= dmg;
      G.ui.popup(pc, Math.round(dmg), dmg >= this.T.seam ? '#ffd27a' : '#ff9a5a');
      if (this.seamHp <= 0) { this.die(P, dmg); return 'kill'; }
      G.fx.embers(pc, 12); G.audio.play('cut');
      this.flinch = 0.4;
      G.ui.toast(P.vel.length() < 16 ? 'Seam wounded. Hit faster to sever it.' : 'Seam wounded!');
      return 'wound';
    }
    const i = kind === 'ankle0' ? 0 : 1;
    this.ankleHp[i] -= dmg;
    G.fx.embers(pc, 8); G.audio.play('cut');
    G.ui.popup(pc, Math.round(dmg), '#e8b08a');
    if (this.ankleHp[i] <= 0 && !this.cut[i]) {
      this.cut[i] = true;
      const down = this.T.kneelBoth ? this.cut[0] && this.cut[1] : true;
      if (down) {
        this.kneelT = this.T.boss ? 9 : 6.5;
        if (G.player.grabbedBy === this) this.release(true);
        this.state = 'kneel';
        G.ui.toast(`${this.T.name} brought to its knees!`);
        this.impact(1);
      } else G.ui.toast('One ankle severed. Take the other!');
    }
    return 'limb';
  }

  die(P, dmg) {
    this.dead = true; this.deathT = 0;
    if (G.player.grabbedBy === this) G.player.grabbedBy = null;
    for (const m of this.mats) { m.transparent = true; }
    const pc = this.parts[0].c.clone();
    G.fx.embers(pc, 60); G.fx.sparks(pc, 20);
    G.audio.play('kill');
    G.hitstop(this.T.boss ? 0.5 : 0.12);
    G.player.shake = Math.max(G.player.shake, 0.4);
    G.onKill(this, dmg);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = this.deathT;
    const fall = Math.min(1, t / 1.4);
    this.group.rotation.x = -fall * fall * 1.45;
    this.group.position.y = -this.H * 0.1 * fall;
    if (t > 1.2) {
      const k = Math.min(1, (t - 1.2) / 2.2);
      for (const m of this.mats) m.opacity = 1 - k;
      this.seamMat.opacity = 1 - k; this.seamMat.transparent = true;
      if (Math.random() < 0.6) {
        _b.copy(this.pos).add(new V((Math.random() - 0.5) * this.H * 0.4, Math.random() * this.H * 0.3, (Math.random() - 0.5) * this.H * 0.8));
        G.fx.ash(_b);
      }
    }
    if (t > 3.6) this.remove = true;
  }

  // ---------------------------------------------------------------- animation
  animate(dt, speed) {
    const B = this.B;
    this.phase += dt * (speed / (this.H * 0.28)) * 2;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = Math.min(0.55, speed / 12);
    const running = speed > this.T.walk + 0.5;
    for (const L of this.legs) {
      const ph = L.s > 0 ? s : -s;
      L.hip.rotation.x = ph * amp;
      L.knee.rotation.x = -Math.max(0, (L.s > 0 ? -c : c)) * amp * 1.2;
    }
    this.hips.position.y = B.leg - Math.abs(c) * 0.012 * (amp > 0 ? 1 : 0);
    this.hips.rotation.x = running ? (this.T.build === 'lanky' ? -0.45 : -0.18) : -0.05;
    this.hips.rotation.z = s * 0.03;
    this.group.rotation.x = 0;
    this.head.rotation.x = running && this.T.build === 'lanky' ? 0.5 : 0;
    const A = this.arms;
    if (this.state === 'windup') {
      const k = Math.min(1, this.timer / 0.6);
      A[1].sh.rotation.x = k * 2.7; A[1].el.rotation.x = k * 0.6; A[1].sh.rotation.z = 0;
      A[0].sh.rotation.x = 0.3; A[0].sh.rotation.z = -0.2;
    } else if (this.state === 'strike') {
      const k = Math.min(1, this.timer / 0.25);
      const end = (this.aimA ?? 0.6) - 0.15;
      A[1].sh.rotation.x = 2.7 + (end - 2.7) * k; A[1].el.rotation.x = 0.6 - k * 0.55; A[1].sh.rotation.z = 0;
      this.hips.rotation.x = -0.35 * k;
    } else if (this.state === 'hold') {
      const k = Math.min(1, this.timer / 0.8);
      A[1].sh.rotation.x = 0.4 + k * 1.3; A[1].el.rotation.x = k * 1.0; A[1].sh.rotation.z = 0.25 * k;
      A[0].sh.rotation.x = 0.6;
      this.head.rotation.x = 0.2;
    } else if (this.state === 'stomp') {
      const k = this.timer < 0.65 ? this.timer / 0.65 : Math.max(0, 1 - (this.timer - 0.65) / 0.15);
      this.legs[1].hip.rotation.x = k * 0.9; this.legs[1].knee.rotation.x = -k * 0.8;
      A[0].sh.rotation.x = k * 0.5; A[1].sh.rotation.x = k * 0.5;
    } else {
      for (const a of A) {
        const ph = a.s > 0 ? -s : s;
        a.sh.rotation.x = ph * amp * 0.8 + (running && this.T.build === 'lanky' ? 0.9 : 0);
        a.sh.rotation.z = a.s * (0.08 + (this.T.build === 'lanky' && running ? 0.5 : 0));
        a.el.rotation.x = 0.25 + (running ? 0.5 : 0);
      }
    }
    if (this.flinch > 0) this.head.rotation.x = -0.4;
    this.seamMat.color.setHSL(0.06, 1, 0.5 + Math.sin(G.time * 6) * 0.08);
  }
  animateIdle(dt) {
    this.phase += dt;
    for (const L of this.legs) { L.hip.rotation.x = 0; L.knee.rotation.x = 0; }
    for (const a of this.arms) { a.sh.rotation.x = this.T.static ? 0 : Math.sin(this.phase) * 0.05; a.sh.rotation.z = a.s * (this.T.static ? 0.9 : 0.15); a.el.rotation.x = 0.2; }
    this.hips.position.y = this.B.leg; this.hips.rotation.x = this.stagger > 0 ? 0.2 : 0;
    this.head.rotation.x = this.stagger > 0 ? -0.5 : 0;
  }
  animateKneel(dt) {
    const B = this.B;
    const k = Math.min(1, (this.T.boss ? 9 : 6.5) - this.kneelT);
    const e = Math.min(1, k * 3);
    this.hips.position.y = B.leg * (1 - 0.55 * e);
    this.hips.rotation.x = -0.55 * e;
    for (const L of this.legs) {
      L.hip.position.y = B.leg * (1 - 0.55 * e);
      L.hip.rotation.x = 1.3 * e; L.knee.rotation.x = -1.9 * e;
    }
    for (const a of this.arms) { a.sh.rotation.x = 0.8 * e; a.sh.rotation.z = a.s * 0.25; a.el.rotation.x = 0.4; }
    this.head.rotation.x = 0.5 * e;
    if (this.kneelT < 0.6) for (const L of this.legs) L.hip.position.y = B.leg;
  }
  animateLeap() {
    for (const L of this.legs) { L.hip.rotation.x = -0.9 * L.s; L.knee.rotation.x = -1.2; }
    for (const a of this.arms) { a.sh.rotation.x = 2.2; a.el.rotation.x = 0.3; }
    this.hips.rotation.x = -0.5;
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.seamMat.dispose();
  }
}

// ---------------------------------------------------------------- spawning
export class Spawner {
  constructor(cfg) {
    this.cfg = cfg; this.t = 0; this.spawned = 0; this.active = true;
  }
  pickType() {
    const w = this.cfg.types; let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
    return 'drudge';
  }
  update(dt) {
    if (!this.active) return;
    const c = this.cfg;
    this.t -= dt;
    const alive = G.hollows.filter((h) => !h.dead && !h.T.static && !h.T.boss).length;
    if (alive >= c.max || this.t > 0) return;
    if (c.total && this.spawned >= c.total) return;
    this.t = c.interval;
    const P = G.player.pos, W = G.world;
    for (let tries = 0; tries < 12; tries++) {
      let x, z;
      if (c.origin) { x = c.origin.x + (Math.random() - 0.5) * 30; z = c.origin.z + Math.random() * 30; }
      else {
        const a = Math.random() * Math.PI * 2, d = c.minDist + Math.random() * (c.maxDist - c.minDist);
        x = P.x + Math.cos(a) * d; z = P.z + Math.sin(a) * d;
        const B = W.bounds;
        if (x < B.x0 + 40 || x > B.x1 - 40 || z < B.z0 + (c.wallMargin || 40) || z > B.z1 - 40) continue;
        W.query(x - 6, z - 6, x + 6, z + 6, tmpBoxes);
        if (tmpBoxes.some((b) => b.y1 > 5)) continue;
      }
      const h = new Hollow(this.pickType(), x, z);
      if (c.waypoint) h.waypoint = new V(c.waypoint.x, 0, c.waypoint.z);
      if (c.aggro) { h.aggro = true; }
      G.addHollow(h);
      this.spawned++;
      break;
    }
  }
}
