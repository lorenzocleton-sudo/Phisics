import * as THREE from 'three';
import { G } from './state.js';
import { Input } from './input.js';
import { stats } from './data.js';
import { raySphere } from './world.js';

const V = THREE.Vector3;
const HALF = { x: 0.35, y: 0.9, z: 0.35 };
const UP = new V(0, 1, 0);
const tmpBoxes = [];
const _a = new V(), _b = new V(), _c = new V();
const EYE = 0.72;

class Hook {
  constructor(side) {
    this.side = side; // -1 left, 1 right
    this.state = 'idle'; // idle | fly | attached | retract
    this.head = new V(); this.target = new V(); this.anchor = new V();
    this.att = null; this.hollow = null; this.willAttach = false; this.len = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x1a1a1a }));
    this.line.frustumCulled = false;
    this.headMesh = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 6), new THREE.MeshStandardMaterial({ color: 0xaab0b6, metalness: 0.9, roughness: 0.3 }));
    this.line.visible = this.headMesh.visible = false;
  }
}

export class Player {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new V(0, 0.9, 0); this.vel = new V();
    this.yaw = 0; this.pitch = -0.05; this.roll = 0;
    this.onGround = true;
    this.hooks = [new Hook(-1), new Hook(1)];
    for (const h of this.hooks) { scene.add(h.line); scene.add(h.headMesh); }
    this.slashT = 0; this.slashCd = 0; this.dashCd = 0;
    this.hitSet = new Set();
    this.invuln = 0; this.sinceHit = 99;
    this.grabbedBy = null; this.escape = 0;
    this.fov = 80; this.shake = 0; this.bob = 0; this.land = 0;
    this.aim = { ok: false, hollow: false, dist: 0 };
    this.dead = false;
    this.look = { dx: 0, dy: 0 };
    this.refreshStats(true);
  }

  refreshStats(fill = false) {
    this.st = stats();
    if (fill || this.hp === undefined) { this.hp = this.st.maxHp; this.gas = this.st.maxGas; this.blade = 100; this.spare = this.st.spare; }
    this.hp = Math.min(this.hp, this.st.maxHp);
    this.gas = Math.min(this.gas, this.st.maxGas);
  }
  setCoat(c) { if (G.vm) G.vm.setCoat(c); }
  setCape() {}

  eye() { return _c.set(this.pos.x, this.pos.y + EYE, this.pos.z); }
  fwd3() { const cp = Math.cos(this.pitch); return new V(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }
  hip(side) {
    const r = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return new V(this.pos.x + r.x * 0.32 * side, this.pos.y - 0.1, this.pos.z + r.z * 0.32 * side);
  }

  castAim(dir, maxRange) {
    const eye = this.eye().clone();
    let best = null;
    const r = G.world.raycast(eye, dir, maxRange + 2, true);
    if (r) best = { t: r.t, point: r.point, hollow: null };
    for (const h of G.hollows) {
      if (h.dead || !h.spheres) continue;
      if (h.pos.distanceTo(this.pos) > maxRange + h.H * 1.5) continue;
      for (const s of h.spheres) {
        if (!s.r) continue;
        const t = raySphere(eye, dir, s.c, s.r);
        if (t !== null && (!best || t < best.t)) best = { t, point: eye.clone().addScaledVector(dir, t), hollow: h };
      }
    }
    if (!best) return null;
    best.dist = best.point.distanceTo(this.pos);
    if (best.dist > maxRange) best.out = true;
    return best;
  }
  // controller players get a small cone of assist when the centre ray misses
  castAssisted(dir, range) {
    const hit = this.castAim(dir, range);
    if ((hit && !hit.out) || Input.device !== 'pad') return hit;
    const right = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = new V().crossVectors(right, dir).normalize();
    for (const a of [0.035, 0.07]) for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const d = dir.clone().addScaledVector(right, Math.cos(ang) * a).addScaledVector(up, Math.sin(ang) * a).normalize();
      const h = this.castAim(d, range);
      if (h && !h.out) return h;
    }
    return hit;
  }

  fire(hook, dir) {
    const hit = this.castAssisted(dir, this.st.range);
    hook.state = 'fly';
    hook.head.copy(this.hip(hook.side));
    hook.hollow = null; hook.att = null;
    if (hit && !hit.out) {
      hook.target.copy(hit.point); hook.willAttach = true;
      if (hit.hollow) { hook.hollow = hit.hollow; hook.att = hit.hollow.attach(hit.point); }
    } else {
      hook.target.copy(this.eye()).addScaledVector(dir, this.st.range);
      hook.willAttach = false;
    }
    G.vm.fire(hook.side < 0 ? 0 : 1);
    G.audio.play('hook');
    Input.rumble(0.1, 0.3, 60);
  }
  releaseHook(hook) {
    if (hook.state === 'fly' || hook.state === 'attached') { hook.state = 'retract'; hook.hollow = null; hook.att = null; }
  }

  update(dt) {
    const st = this.st;
    if (this.dead) return;
    const S = G.save.settings;
    const lk = Input.look(dt, S.sens, S.padSens);
    const inv = S.invert ? -1 : 1;
    this.look = lk;
    this.yaw -= lk.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - lk.dy * inv, -1.5, 1.5);
    const fwd = this.fwd3();
    const fwdF = new V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const mv = Input.move();
    const wish = new V().addScaledVector(fwdF, mv.y).addScaledVector(right, mv.x);
    const wishMag = Math.min(1, wish.length());
    if (wishMag > 0) wish.normalize();

    this.slashCd -= dt; this.dashCd -= dt; this.invuln -= dt; this.sinceHit += dt;

    if (this.grabbedBy) {
      for (const h of this.hooks) this.releaseHook(h);
      const g = this.grabbedBy;
      if (g.dead) this.grabbedBy = null;
      else {
        this.pos.copy(g.handWorld()); this.vel.set(0, 0, 0);
        if (Input.hit('interact') || Input.hit('slash') || Input.hit('jump')) {
          this.escape += 1; G.audio.play('slash'); G.vm.slash();
          G.gore.burst(this.eye().clone().addScaledVector(fwd, 1.2), fwd.clone().negate(), 20, 8);
          G.gore.screen(0.3);
          this.shake = Math.max(this.shake, 0.15); Input.rumble(0.6, 0.6, 120);
        }
        if (this.escape >= 7) {
          this.blade = Math.max(0, this.blade - 20);
          g.severGrip();
          this.grabbedBy = null;
          this.vel.set(fwd.x * 10, 9, fwd.z * 10);
          G.ui.toast('You hacked through its arm and broke free!');
          this.invuln = 1.2;
        }
        G.ui.grab(this.escape / 7);
        this.updateHooksVisual();
        this.updateCamera(dt);
        return;
      }
    }
    G.ui.grab(null);

    // ---- tethers
    const both = Input.down('both');
    const keyL = Input.down('hookL') || both;
    const keyR = Input.down('hookR') || both;
    const rotd = (d, a) => d.clone().applyAxisAngle(UP, a);
    if (Input.hit('both')) {
      if (this.hooks[0].state === 'idle') this.fire(this.hooks[0], rotd(fwd, 0.035));
      if (this.hooks[1].state === 'idle') this.fire(this.hooks[1], rotd(fwd, -0.035));
    }
    if (Input.hit('hookL') && this.hooks[0].state === 'idle') this.fire(this.hooks[0], fwd);
    if (Input.hit('hookR') && this.hooks[1].state === 'idle') this.fire(this.hooks[1], fwd);
    if (!keyL) this.releaseHook(this.hooks[0]);
    if (!keyR) this.releaseHook(this.hooks[1]);
    this.updateHooks(dt);
    const attached = this.hooks.filter((h) => h.state === 'attached');
    const hooked = attached.length > 0;

    // ---- forces
    const g = 24;
    const wasGround = this.onGround;
    if (this.onGround && !hooked) {
      const sp = 9.5 * wishMag;
      const k = Math.min(1, (wishMag > 0 ? 10 : 14) * dt);
      this.vel.x += (wish.x * sp - this.vel.x) * k;
      this.vel.z += (wish.z * sp - this.vel.z) * k;
      if (Input.hit('jump')) { this.vel.y = 9; this.onGround = false; G.audio.play('jump'); }
    } else {
      this.vel.addScaledVector(wish, 7 * wishMag * dt);
      if (Input.down('jump') && !this.onGround && this.gas > 0) {
        const td = new V().copy(fwd).addScaledVector(wish, 0.6).addScaledVector(UP, 0.3).normalize();
        this.vel.addScaledVector(td, 17 * dt);
        this.useGas(9 * dt);
        this.thrusting = true;
      } else this.thrusting = false;
    }
    this.vel.y -= g * (hooked && this.gas > 0 ? 0.45 : 1) * dt;
    if (hooked) {
      const per = (this.gas > 0 ? 42 : 10) * st.reel / (attached.length === 2 ? 1.5 : 1);
      for (const h of attached) {
        _a.subVectors(h.anchor, this.pos);
        const d = _a.length();
        if (d < 0.01) continue;
        _a.divideScalar(d);
        this.vel.addScaledVector(_a, per * dt);
        h.len = Math.max(1.6, Math.min(h.len, d) - 7 * st.reel * dt);
      }
      this.vel.addScaledVector(right, mv.x * 11 * dt);
      this.vel.addScaledVector(fwdF, mv.y * 4 * dt);
      this.useGas(2.4 * attached.length * dt);
      this.reeling = true;
    } else this.reeling = false;

    if (Input.hit('dash') && this.dashCd <= 0 && this.gas >= 6) {
      const dd = wishMag > 0 ? wish.clone() : fwd.clone();
      if (!this.onGround) dd.addScaledVector(UP, 0.15).normalize();
      this.vel.addScaledVector(dd, 15);
      if (this.onGround) this.vel.y += 4;
      this.useGas(6); this.dashCd = 0.5;
      G.fx.gasBurst(this.pos, dd.clone().negate(), 14);
      G.audio.play('dash'); Input.rumble(0.2, 0.4, 90);
      this.fov += 6;
    }

    if (Input.hit('slash') && this.slashCd <= 0) {
      if (this.blade <= 0) { G.ui.toast(this.spare > 0 ? `Blades shattered. Press ${Input.glyph('reload')} to swap.` : 'No blades left. Find a depot.'); this.slashCd = 0.3; }
      else { this.slashT = 0.3; this.slashCd = 0.42; this.hitSet.clear(); G.vm.slash(); G.audio.play('slash'); }
    }
    if (Input.hit('reload')) this.swapBlades();
    if (this.slashT > 0) { this.slashT -= dt; this.checkSlash(dt); }

    const sp = this.vel.length();
    if (!this.onGround) this.vel.multiplyScalar(1 - 0.06 * dt);
    if (sp > 85) this.vel.multiplyScalar(85 / sp);

    const steps = Math.min(12, Math.max(1, Math.ceil((this.vel.length() * dt) / 0.3)));
    const sdt = dt / steps;
    let grounded = false;
    const vyBefore = this.vel.y;
    for (let i = 0; i < steps; i++) {
      grounded = this.moveAxis('x', this.vel.x * sdt) || grounded;
      grounded = this.moveAxis('z', this.vel.z * sdt) || grounded;
      grounded = this.moveAxis('y', this.vel.y * sdt) || grounded;
      for (const h of attached) {
        _a.subVectors(h.anchor, this.pos);
        const d = _a.length();
        if (d > h.len && d > 0.01) {
          _a.divideScalar(d);
          this.pos.addScaledVector(_a, Math.min(d - h.len, 2));
          const vr = this.vel.dot(_a);
          if (vr < 0) this.vel.addScaledVector(_a, -vr);
        }
      }
    }
    if (this.pos.y <= HALF.y) { this.pos.y = HALF.y; if (this.vel.y < 0) this.vel.y = 0; grounded = true; }
    this.onGround = grounded;
    if (grounded && !wasGround && vyBefore < -8) { this.land = Math.min(1, -vyBefore / 30); Input.rumble(this.land * 0.5, 0.2, 80); }
    const B = G.world.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, B.x0 + 0.5, B.x1 - 0.5);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, B.z0 + 0.5, B.z1 - 0.5);
    if (this.pos.y > 420) { this.pos.y = 420; this.vel.y = Math.min(this.vel.y, 0); }

    for (const h of G.hollows) {
      if (h.dead || !h.spheres) continue;
      if (Math.abs(h.pos.x - this.pos.x) > h.H + 4 || Math.abs(h.pos.z - this.pos.z) > h.H + 4) continue;
      for (const s of h.spheres) {
        if (!s.r) continue;
        _a.subVectors(this.pos, s.c);
        const d = _a.length(), min = s.r + 0.45;
        if (d < min && d > 0.001) {
          _a.divideScalar(d);
          this.pos.addScaledVector(_a, min - d);
          const vn = this.vel.dot(_a);
          if (vn < 0) this.vel.addScaledVector(_a, -vn);
        }
      }
    }

    if (this.sinceHit > 6) this.hp = Math.min(st.maxHp, this.hp + 3 * dt);
    if (this.thrusting || (this.reeling && this.gas > 0)) { G.fx.gasTrail(this.pos, this.vel); G.audio.gas(this.thrusting ? 1 : 0.5); }
    else G.audio.gas(0);
    G.audio.wind(Math.min(1, Math.max(0, (this.vel.length() - 8) / 50)));

    this.updateHooksVisual();
    this.updateCamera(dt);
    this.updateAim(fwd);
  }

  useGas(n) { this.gas = Math.max(0, this.gas - n); }

  swapBlades() {
    if (this.blade >= 100 && G.vm.blood < 0.2) return;
    if (this.spare <= 0) { G.ui.toast('No spare blades. Restock at a depot.'); return; }
    this.spare--; this.blade = 100;
    G.vm.swap();
    G.audio.play('reload');
    G.ui.toast('Fresh blades locked in');
  }

  moveAxis(ax, d) {
    if (d === 0) return false;
    const p = this.pos;
    p[ax] += d;
    let grounded = false;
    G.world.query(p.x - 0.6, p.z - 0.6, p.x + 0.6, p.z + 0.6, tmpBoxes);
    for (const b of tmpBoxes) {
      if (p.x + HALF.x <= b.x0 || p.x - HALF.x >= b.x1 || p.y + HALF.y <= b.y0 || p.y - HALF.y >= b.y1 || p.z + HALF.z <= b.z0 || p.z - HALF.z >= b.z1) continue;
      if (ax === 'y') {
        if (d < 0) { p.y = b.y1 + HALF.y; if (this.vel.y < 0) this.vel.y = 0; grounded = true; }
        else { p.y = b.y0 - HALF.y - 1e-4; if (this.vel.y > 0) this.vel.y = 0; }
      } else {
        const lip = b.y1 - (p.y - HALF.y);
        if (lip > 0 && lip <= (this.onGround ? 0.75 : 0.35)) { p.y = b.y1 + HALF.y + 0.01; continue; }
        const v = ax === 'x' ? this.vel.x : this.vel.z;
        if (Math.abs(v) > 34) { this.shake = Math.max(this.shake, Math.min(0.5, Math.abs(v) / 120)); G.audio.play('thud'); Input.rumble(0.5, 0.3, 120); }
        if (ax === 'x') { p.x = d > 0 ? b.x0 - HALF.x - 1e-4 : b.x1 + HALF.x + 1e-4; this.vel.x = 0; }
        else { p.z = d > 0 ? b.z0 - HALF.z - 1e-4 : b.z1 + HALF.z + 1e-4; this.vel.z = 0; }
      }
    }
    return grounded;
  }

  updateHooks(dt) {
    for (const h of this.hooks) {
      const hip = this.hip(h.side);
      if (h.state === 'fly') {
        if (h.hollow) {
          if (h.hollow.dead) { h.state = 'retract'; h.hollow = null; continue; }
          h.target.copy(h.hollow.attachWorld(h.att));
        }
        _a.subVectors(h.target, h.head);
        const d = _a.length(), step = 260 * dt;
        if (d <= step) {
          h.head.copy(h.target);
          if (h.willAttach) {
            h.state = 'attached'; h.anchor.copy(h.target); h.len = h.anchor.distanceTo(this.pos);
            _b.subVectors(h.anchor, this.pos).normalize();
            this.vel.addScaledVector(_b, 7);
            if (this.onGround) { this.vel.y = Math.max(this.vel.y, 6); this.onGround = false; }
            G.audio.play('latch'); G.fx.sparks(h.anchor, 4);
            if (h.hollow) G.gore.burst(h.anchor, _b.clone().negate(), 10, 6);
            Input.rumble(0.3, 0.2, 70);
          } else h.state = 'retract';
        } else h.head.addScaledVector(_a, step / d);
      } else if (h.state === 'attached') {
        if (h.hollow) {
          if (h.hollow.dead) { h.state = 'retract'; h.hollow = null; continue; }
          h.anchor.copy(h.hollow.attachWorld(h.att));
        }
        h.head.copy(h.anchor);
        if (h.anchor.distanceTo(this.pos) > this.st.range * 1.6) h.state = 'retract';
      } else if (h.state === 'retract') {
        _a.subVectors(hip, h.head);
        const d = _a.length(), step = 320 * dt;
        if (d <= step) h.state = 'idle'; else h.head.addScaledVector(_a, step / d);
      }
    }
  }

  updateHooksVisual() {
    for (const h of this.hooks) {
      const vis = h.state !== 'idle';
      h.line.visible = h.headMesh.visible = vis;
      if (!vis) continue;
      const hip = this.hip(h.side);
      const a = h.line.geometry.attributes.position;
      a.setXYZ(0, hip.x, hip.y, hip.z); a.setXYZ(1, h.head.x, h.head.y, h.head.z); a.needsUpdate = true;
      h.headMesh.position.copy(h.head);
      _a.subVectors(h.head, hip).normalize();
      h.headMesh.quaternion.setFromUnitVectors(UP, _a);
    }
  }

  checkSlash(dt) {
    const st = this.st;
    const speed = this.vel.length();
    const reach = 2.9;
    let near = null, nd = 9;
    for (const h of G.hollows) {
      if (h.dead || !h.parts || this.hitSet.has(h)) continue;
      for (const p of h.parts) {
        if (p.off) continue;
        const d = p.c.distanceTo(this.pos) - p.r;
        if (d < nd) { nd = d; near = p; }
      }
    }
    if (near && nd > reach * 0.5) { _a.subVectors(near.c, this.pos).normalize(); this.vel.addScaledVector(_a, 30 * dt); }
    for (const h of G.hollows) {
      if (h.dead || !h.parts || this.hitSet.has(h)) continue;
      let best = null;
      for (const p of h.parts) {
        if (p.off) continue;
        if (p.c.distanceTo(this.pos) < p.r + reach) { if (!best || p.kind === 'nape') best = p; }
      }
      if (!best) continue;
      this.hitSet.add(h);
      const sf = Math.min(2.6, 0.35 + speed / 18);
      const dmg = 30 * st.dmg * sf;
      const res = h.takeHit(best.kind, dmg, this);
      if (res !== 'armored') this.blade = Math.max(0, this.blade - 14 * st.wear);
      if (res !== 'armored' && !h.T.static) {
        G.vm.addBlood(0.35);
        const close = best.c.distanceTo(this.eye());
        if (close < 9) G.gore.screen(res === 'kill' ? 1 : 0.5);
        Input.rumble(res === 'kill' ? 1 : 0.6, 0.8, res === 'kill' ? 260 : 140);
      }
      if (this.blade <= 0) G.ui.toast(this.spare > 0 ? `Blades shattered. Press ${Input.glyph('reload')} to swap.` : 'Blades shattered!');
    }
  }

  hurt(dmg, knock) {
    if (this.invuln > 0 || this.dead) return;
    this.hp -= dmg;
    this.invuln = 0.7; this.sinceHit = 0;
    if (knock) this.vel.add(knock);
    this.shake = Math.max(this.shake, 0.6);
    G.audio.play('hurt'); G.ui.flash('hurt'); if (G.post) G.post.hurt();
    Input.rumble(1, 1, 300);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; G.onPlayerDeath(); }
  }

  updateCamera(dt) {
    const cam = this.camera;
    const sp = this.vel.length();
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround) this.bob += dt * hv * 1.15;
    const bobA = this.onGround ? Math.min(1, hv / 9) : 0;
    this.land = Math.max(0, this.land - dt * 3);
    const e = this.eye();
    cam.position.set(e.x, e.y + Math.abs(Math.sin(this.bob)) * 0.06 * bobA - this.land * 0.35, e.z);
    const right = _a.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const lat = this.onGround ? 0 : this.vel.dot(right);
    const wantRoll = THREE.MathUtils.clamp(-lat * 0.006, -0.22, 0.22) + Math.sin(this.bob * 0.5) * 0.006 * bobA;
    this.roll += (wantRoll - this.roll) * Math.min(1, dt * 4);
    cam.rotation.set(this.pitch, this.yaw, this.roll);
    if (this.shake > 0) {
      const s = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
      cam.rotation.z += (Math.random() - 0.5) * s * 0.1;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    const base = G.save.settings.fov;
    const tf = base + THREE.MathUtils.clamp((sp - 14) * 0.5, 0, 24);
    this.fov += (tf - this.fov) * Math.min(1, 4 * dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    if (G.vm) G.vm.update(dt, this, this.look.dx, this.look.dy);
  }

  updateAim(fwd) {
    const r = this.castAssisted(fwd, this.st.range);
    this.aim.ok = !!(r && !r.out);
    this.aim.hollow = !!(r && r.hollow);
    this.aim.dist = r ? r.dist : 0;
  }

  resupply() {
    this.gas = this.st.maxGas; this.blade = 100; this.spare = this.st.spare;
    this.hp = Math.max(this.hp, this.st.maxHp * 0.6);
    if (G.vm) G.vm.blood = 0;
  }
  teleport(x, y, z) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    for (const h of this.hooks) { h.state = 'idle'; h.hollow = null; h.att = null; }
    this.grabbedBy = null; this.dead = false;
  }
}
