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

class Hook {
  constructor(side) {
    this.side = side; // -1 left, 1 right
    this.state = 'idle'; // idle | fly | attached | retract
    this.head = new V();
    this.target = new V();
    this.anchor = new V();
    this.local = new V();
    this.hollow = null;
    this.willAttach = false;
    this.len = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
    this.line.frustumCulled = false;
    this.headMesh = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
    this.line.visible = this.headMesh.visible = false;
  }
}

export class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.pos = new V(0, 0.9, 0);
    this.vel = new V();
    this.yaw = 0; this.pitch = -0.1;
    this.onGround = true;
    this.hooks = [new Hook(-1), new Hook(1)];
    for (const h of this.hooks) { scene.add(h.line); scene.add(h.headMesh); }
    this.slashT = 0; this.slashCd = 0; this.dashCd = 0;
    this.hitSet = new Set();
    this.invuln = 0; this.sinceHit = 99;
    this.grabbedBy = null; this.escape = 0;
    this.camDist = 6; this.fov = 72; this.shake = 0;
    this.aim = { ok: false, hollow: false, dist: 0 };
    this.modelYaw = 0; this.spin = 0; this.anim = 0;
    this.dead = false;
    this.buildModel();
    this.refreshStats(true);
  }

  refreshStats(fill = false) {
    this.st = stats();
    if (fill || this.hp === undefined) {
      this.hp = this.st.maxHp; this.gas = this.st.maxGas;
      this.blade = 100; this.spare = this.st.spare;
    }
    this.hp = Math.min(this.hp, this.st.maxHp);
    this.gas = Math.min(this.gas, this.st.maxGas);
  }

  buildModel() {
    const coat = G.save ? G.save.coat : 0x3b4a5c;
    const m = (c) => new THREE.MeshLambertMaterial({ color: c });
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);
    this.mCoat = m(coat);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), this.mCoat);
    torso.position.y = 1.15; torso.castShadow = true; body.add(torso);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.34), m(0x6b4a2a)); belt.position.y = 0.86; body.add(belt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), m(0xe0b896)); head.position.y = 1.62; head.castShadow = true; body.add(head);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.12, 0.31), m(0x3a2a1e)); hair.position.set(0, 1.72, 0.03); body.add(hair);
    // gear: canisters + blade boxes
    const brass = m(0xb08a4a), steel = m(0x9aa3ad);
    for (const s of [-1, 1]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), steel);
      can.rotation.x = Math.PI / 2; can.position.set(s * 0.3, 0.86, 0.12); body.add(can);
      const sheath = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.62), brass);
      sheath.position.set(s * 0.34, 0.78, -0.05); body.add(sheath);
    }
    this.mCape = m(0x22262c);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.04), this.mCape);
    cape.position.set(0, 1.05, 0.18); body.add(cape); this.cape = cape;
    this.legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.13, 0.84, 0);
      const lm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.82, 0.18), m(0xd8d0c0)); lm.position.y = -0.41; lm.castShadow = true;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.26), m(0x3a2a20)); boot.position.set(0, -0.76, -0.03);
      leg.add(lm); leg.add(boot); body.add(leg); this.legs.push(leg);
    }
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.32, 1.4, 0);
      const am = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.14), this.mCoat); am.position.y = -0.3;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 1.0), new THREE.MeshLambertMaterial({ color: 0xdfe6ee, emissive: 0x000000 }));
      blade.position.set(0, -0.62, -0.45);
      arm.add(am); arm.add(blade); body.add(arm); this.arms.push(arm);
      arm.userData.blade = blade;
    }
    // slash arc
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.6, 24, 1, 0, Math.PI * 1.3),
      new THREE.MeshBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    arc.rotation.x = -Math.PI / 2; arc.position.y = 1.1;
    g.add(arc); this.arc = arc;
    body.position.y = -0.9;
    this.model = g; this.body = body;
    this.scene.add(g);
  }
  setCoat(c) { this.mCoat.color.setHex(c); }
  setCape(c) { this.mCape.color.setHex(c); }

  // ------------------------------------------------------------------
  fwd3() {
    const cp = Math.cos(this.pitch);
    return new V(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  hip(side) {
    return new V(this.pos.x + Math.cos(this.modelYaw) * 0.3 * side, this.pos.y - 0.05, this.pos.z - Math.sin(this.modelYaw) * 0.3 * side);
  }

  castAim(dir, maxRange) {
    const W = G.world;
    const cam = this.camera.position;
    const camToPlayer = cam.distanceTo(this.pos);
    const maxT = maxRange + camToPlayer + 2;
    let best = null;
    const r = W.raycast(cam, dir, maxT, true);
    if (r && r.t > camToPlayer * 0.6) best = { t: r.t, point: r.point, hollow: null };
    for (const h of G.hollows) {
      if (h.dead || !h.spheres) continue;
      if (h.pos.distanceTo(this.pos) > maxRange + h.H * 1.5) continue;
      for (const s of h.spheres) {
        const t = raySphere(cam, dir, s.c, s.r);
        if (t !== null && t > camToPlayer * 0.6 && (!best || t < best.t)) {
          best = { t, point: cam.clone().addScaledVector(dir, t), hollow: h };
        }
      }
    }
    if (!best) return null;
    best.dist = best.point.distanceTo(this.pos);
    if (best.dist > maxRange) return { ...best, out: true };
    return best;
  }

  fire(hook, dir) {
    const hit = this.castAim(dir, this.st.range);
    hook.state = 'fly';
    hook.head.copy(this.hip(hook.side));
    if (hit && !hit.out) {
      hook.target.copy(hit.point);
      hook.willAttach = true;
      hook.hollow = hit.hollow;
      if (hit.hollow) hook.local.copy(hit.hollow.group.worldToLocal(hit.point.clone()));
    } else {
      hook.target.copy(this.pos).addScaledVector(dir, this.st.range);
      hook.willAttach = false;
      hook.hollow = null;
    }
    G.audio.play('hook');
  }

  releaseHook(hook) {
    if (hook.state === 'fly' || hook.state === 'attached') { hook.state = 'retract'; hook.hollow = null; }
  }

  update(dt) {
    const st = this.st;
    if (this.dead) return;
    const sens = (G.save.settings?.sens ?? 1) * 0.0022;
    const inv = G.save.settings?.invert ? -1 : 1;
    this.yaw -= Input.dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - Input.dy * sens * inv, -1.45, 1.35);
    const fwd = this.fwd3();
    const fwdF = new V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const ix = (Input.down('KeyD') ? 1 : 0) - (Input.down('KeyA') ? 1 : 0);
    const iz = (Input.down('KeyW') ? 1 : 0) - (Input.down('KeyS') ? 1 : 0);
    const wish = new V().addScaledVector(fwdF, iz).addScaledVector(right, ix);
    if (wish.lengthSq() > 0) wish.normalize();

    this.slashCd -= dt; this.dashCd -= dt; this.invuln -= dt; this.sinceHit += dt;

    // grabbed by a hollow: mash to escape
    if (this.grabbedBy) {
      for (const h of this.hooks) this.releaseHook(h);
      const g = this.grabbedBy;
      if (g.dead) { this.grabbedBy = null; }
      else {
        this.pos.copy(g.handWorld());
        this.vel.set(0, 0, 0);
        if (Input.hit('KeyF') || Input.mhit(0) || Input.hit('Space')) {
          this.escape += 1; G.audio.play('slash'); G.fx.sparks(this.pos, 6);
          this.shake = Math.max(this.shake, 0.15);
        }
        if (this.escape >= 8) {
          this.blade = Math.max(0, this.blade - 20);
          g.release(true);
          this.grabbedBy = null;
          this.vel.set(fwd.x * 14, 10, fwd.z * 14);
          G.ui.toast('Cut free!');
          this.invuln = 1.2;
        }
        G.ui.grab(this.escape / 8);
        this.updateHooksVisual(dt);
        this.updateModel(dt);
        this.updateCamera(dt);
        return;
      }
    }
    G.ui.grab(null);

    // ---- hooks input
    const keyL = Input.down('KeyQ') || Input.mdown(2);
    const keyR = Input.down('KeyE') || Input.mdown(2);
    const rotd = (d, a) => d.clone().applyAxisAngle(UP, a);
    if (Input.mhit(2)) {
      if (this.hooks[0].state === 'idle') this.fire(this.hooks[0], rotd(fwd, 0.035));
      if (this.hooks[1].state === 'idle') this.fire(this.hooks[1], rotd(fwd, -0.035));
    }
    if (Input.hit('KeyQ') && this.hooks[0].state === 'idle') this.fire(this.hooks[0], fwd);
    if (Input.hit('KeyE') && this.hooks[1].state === 'idle') this.fire(this.hooks[1], fwd);
    if (!keyL) this.releaseHook(this.hooks[0]);
    if (!keyR) this.releaseHook(this.hooks[1]);
    this.updateHooks(dt);

    const attached = this.hooks.filter((h) => h.state === 'attached');
    const hooked = attached.length > 0;

    // ---- forces
    const g = 24;
    if (this.onGround && !hooked) {
      const sp = Input.down('ShiftLeft') && wish.lengthSq() > 0 ? 9.5 : 9.5;
      const k = Math.min(1, (wish.lengthSq() > 0 ? 10 : 14) * dt);
      this.vel.x += (wish.x * sp - this.vel.x) * k;
      this.vel.z += (wish.z * sp - this.vel.z) * k;
      if (Input.hit('Space')) { this.vel.y = 9; this.onGround = false; G.audio.play('jump'); }
    } else {
      this.vel.addScaledVector(wish, 7 * dt);
      if (Input.down('Space') && !this.onGround && this.gas > 0) {
        const td = new V().copy(fwd).addScaledVector(wish, 0.6).addScaledVector(UP, 0.3).normalize();
        this.vel.addScaledVector(td, 17 * dt);
        this.useGas(9 * dt);
        this.thrusting = true;
      } else this.thrusting = false;
    }
    // the rig's reel carries much of your weight while it has gas
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
      this.vel.addScaledVector(right, ix * 11 * dt);
      this.vel.addScaledVector(fwdF, iz * 4 * dt);
      this.useGas(2.4 * attached.length * dt);
      this.reeling = true;
    } else this.reeling = false;

    // dash
    if (Input.hit('ShiftLeft') || Input.hit('ShiftRight')) {
      if (this.dashCd <= 0 && this.gas >= 6) {
        const dd = wish.lengthSq() > 0 ? wish.clone() : fwd.clone();
        if (!this.onGround) dd.addScaledVector(UP, 0.15).normalize();
        this.vel.addScaledVector(dd, 15);
        if (this.onGround) this.vel.y += 4;
        this.useGas(6); this.dashCd = 0.5;
        G.fx.gasBurst(this.pos, dd.clone().negate(), 14);
        G.audio.play('dash');
      }
    }

    // slash
    if (Input.mhit(0) && this.slashCd <= 0) {
      if (this.blade <= 0) { G.ui.toast(this.spare > 0 ? 'Blades shattered. Press R to swap.' : 'No blades left. Find a depot.'); this.slashCd = 0.3; }
      else {
        this.slashT = 0.3; this.slashCd = 0.42; this.hitSet.clear(); this.spin = 0;
        G.audio.play('slash');
      }
    }
    if (Input.hit('KeyR')) this.swapBlades();
    if (this.slashT > 0) { this.slashT -= dt; this.checkSlash(dt); }

    // drag + cap
    const sp = this.vel.length();
    if (!this.onGround) this.vel.multiplyScalar(1 - 0.06 * dt);
    if (sp > 85) this.vel.multiplyScalar(85 / sp);

    // ---- integrate with substeps
    const steps = Math.min(12, Math.max(1, Math.ceil((this.vel.length() * dt) / 0.3)));
    const sdt = dt / steps;
    let grounded = false;
    for (let i = 0; i < steps; i++) {
      grounded = this.moveAxis('x', this.vel.x * sdt) || grounded;
      grounded = this.moveAxis('z', this.vel.z * sdt) || grounded;
      grounded = this.moveAxis('y', this.vel.y * sdt) || grounded;
      // rope constraint
      for (const h of attached) {
        _a.subVectors(h.anchor, this.pos);
        const d = _a.length();
        if (d > h.len && d > 0.01) {
          _a.divideScalar(d);
          const corr = d - h.len;
          this.pos.addScaledVector(_a, Math.min(corr, 2));
          const vr = this.vel.dot(_a);
          if (vr < 0) this.vel.addScaledVector(_a, -vr);
        }
      }
    }
    if (this.pos.y <= HALF.y) { this.pos.y = HALF.y; if (this.vel.y < 0) this.vel.y = 0; grounded = true; }
    this.onGround = grounded;
    // bounds
    const B = G.world.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, B.x0 + 0.5, B.x1 - 0.5);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, B.z0 + 0.5, B.z1 - 0.5);
    if (this.pos.y > 400) { this.pos.y = 400; this.vel.y = Math.min(this.vel.y, 0); }

    // hollow bodies are solid
    for (const h of G.hollows) {
      if (h.dead || !h.spheres) continue;
      if (Math.abs(h.pos.x - this.pos.x) > h.H + 4 || Math.abs(h.pos.z - this.pos.z) > h.H + 4) continue;
      for (const s of h.spheres) {
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

    // regen
    if (this.sinceHit > 6) this.hp = Math.min(st.maxHp, this.hp + 3 * dt);

    // gas fx
    if (this.thrusting || (this.reeling && this.gas > 0)) {
      G.fx.gasTrail(this.pos, this.vel);
      G.audio.gas(this.thrusting ? 1 : 0.5);
    } else G.audio.gas(0);
    G.audio.wind(Math.min(1, Math.max(0, (this.vel.length() - 8) / 50)));

    this.updateHooksVisual(dt);
    this.updateModel(dt);
    this.updateCamera(dt);
    this.updateAim(fwd);
  }

  useGas(n) { this.gas = Math.max(0, this.gas - n); }

  swapBlades() {
    if (this.blade >= 100) return;
    if (this.spare <= 0) { G.ui.toast('No spare blades. Restock at a depot.'); return; }
    this.spare--; this.blade = 100;
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
        const feet = p.y - HALF.y;
        const lip = b.y1 - feet;
        if (lip > 0 && lip <= (this.onGround ? 0.75 : 0.35)) { p.y = b.y1 + HALF.y + 0.01; continue; }
        const v = ax === 'x' ? this.vel.x : this.vel.z;
        if (Math.abs(v) > 34) { this.shake = Math.max(this.shake, Math.min(0.5, Math.abs(v) / 120)); G.audio.play('thud'); }
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
          h.target.copy(h.hollow.group.localToWorld(_b.copy(h.local)));
        }
        _a.subVectors(h.target, h.head);
        const d = _a.length(), step = 260 * dt;
        if (d <= step) {
          h.head.copy(h.target);
          if (h.willAttach) {
            h.state = 'attached'; h.anchor.copy(h.target); h.len = h.anchor.distanceTo(this.pos);
            // initial yank off the ground
            _c.subVectors(h.anchor, this.pos).normalize();
            this.vel.addScaledVector(_c, 7);
            if (this.onGround) { this.vel.y = Math.max(this.vel.y, 6); this.onGround = false; }
            G.audio.play('latch'); G.fx.sparks(h.anchor, 4);
          } else h.state = 'retract';
        } else h.head.addScaledVector(_a, step / d);
      } else if (h.state === 'attached') {
        if (h.hollow) {
          if (h.hollow.dead) { h.state = 'retract'; h.hollow = null; continue; }
          h.anchor.copy(h.hollow.group.localToWorld(_b.copy(h.local)));
        }
        h.head.copy(h.anchor);
        if (h.anchor.distanceTo(this.pos) > this.st.range * 1.6) h.state = 'retract';
      } else if (h.state === 'retract') {
        _a.subVectors(hip, h.head);
        const d = _a.length(), step = 320 * dt;
        if (d <= step) h.state = 'idle';
        else h.head.addScaledVector(_a, step / d);
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
    const reach = 2.7;
    // magnetism toward the nearest seam in front of us
    let near = null, nd = 8;
    for (const h of G.hollows) {
      if (h.dead || !h.parts || this.hitSet.has(h)) continue;
      for (const p of h.parts) {
        const d = p.c.distanceTo(this.pos) - p.r;
        if (d < nd) { nd = d; near = { h, p }; }
      }
    }
    if (near && nd > reach * 0.5) {
      _a.subVectors(near.p.c, this.pos).normalize();
      this.vel.addScaledVector(_a, 28 * dt);
    }
    for (const h of G.hollows) {
      if (h.dead || !h.parts || this.hitSet.has(h)) continue;
      let bestPart = null;
      for (const p of h.parts) {
        if (p.c.distanceTo(this.pos) < p.r + reach) {
          if (!bestPart || p.kind === 'nape') bestPart = p;
        }
      }
      if (!bestPart) continue;
      this.hitSet.add(h);
      const sf = Math.min(2.6, 0.35 + speed / 18);
      const dmg = 30 * st.dmg * sf;
      const res = h.takeHit(bestPart.kind, dmg, this);
      if (res !== 'armored') this.blade = Math.max(0, this.blade - 14 * st.wear);
      if (this.blade <= 0) G.ui.toast(this.spare > 0 ? 'Blades shattered. Press R to swap.' : 'Blades shattered!');
    }
  }

  hurt(dmg, knock) {
    if (this.invuln > 0 || this.dead) return;
    this.hp -= dmg;
    this.invuln = 0.7; this.sinceHit = 0;
    if (knock) this.vel.add(knock);
    this.shake = Math.max(this.shake, 0.6);
    G.audio.play('hurt');
    G.ui.flash('hurt');
    if (this.hp <= 0) { this.hp = 0; this.dead = true; G.onPlayerDeath(); }
  }

  updateModel(dt) {
    const m = this.model;
    m.position.copy(this.pos);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    let targetYaw = this.modelYaw;
    if (this.onGround) { if (hv > 0.5) targetYaw = Math.atan2(-this.vel.x, -this.vel.z); }
    else if (hv > 2) targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
    let dy = targetYaw - this.modelYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.modelYaw += dy * Math.min(1, 12 * dt);
    m.rotation.set(0, this.modelYaw, 0);
    this.anim += dt * (this.onGround ? hv * 1.4 : 3);
    const air = !this.onGround;
    const pitchLean = air ? THREE.MathUtils.clamp(-this.vel.y / 40, -0.6, 0.6) + Math.min(0.9, hv / 40) : 0;
    this.body.rotation.x = -pitchLean;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      this.legs[i].rotation.x = air ? -0.5 + s * 0.15 : Math.sin(this.anim) * s * Math.min(0.8, hv / 10);
      this.arms[i].rotation.x = air ? -0.4 : -Math.sin(this.anim) * s * Math.min(0.7, hv / 12);
      this.arms[i].rotation.z = air ? s * 0.9 : 0;
    }
    // slash spin
    if (this.slashT > 0) {
      const t = 1 - this.slashT / 0.3;
      this.spin = t * Math.PI * 2 * (air ? 1 : 0.5);
      this.body.rotation.y = this.spin;
      for (const a of this.arms) { a.rotation.x = 1.6; a.rotation.z = 0; a.userData.blade.material.emissive.setHex(0x335566); }
      this.arc.material.opacity = 0.55 * (1 - t);
      this.arc.rotation.z = -this.spin;
    } else {
      this.body.rotation.y = 0;
      for (const a of this.arms) a.userData.blade.material.emissive.setHex(0);
      this.arc.material.opacity = 0;
    }
    this.cape.rotation.x = air ? Math.min(1.3, hv / 25) : 0.1;
    m.visible = this.camDist > 1.2;
  }

  updateCamera(dt) {
    const fwd = this.fwd3();
    const right = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const focus = _c.copy(this.pos).add(new V(0, 1.15, 0)).addScaledVector(right, 0.85);
    const speed = this.vel.length();
    const want = 5.6 + Math.min(3, speed / 25);
    const back = fwd.clone().negate();
    const r = G.world.raycast(focus, back, want + 0.5, false);
    let d = want;
    if (r) d = Math.max(0.6, r.t - 0.4);
    this.camDist += (d - this.camDist) * Math.min(1, (d < this.camDist ? 30 : 6) * dt);
    const cam = this.camera;
    cam.position.copy(focus).addScaledVector(back, this.camDist);
    if (cam.position.y < 0.3) cam.position.y = 0.3;
    cam.lookAt(_b.copy(cam.position).add(fwd));
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    const baseFov = G.save.settings?.fov ?? 75;
    const tf = baseFov + THREE.MathUtils.clamp((speed - 14) * 0.45, 0, 20);
    this.fov += (tf - this.fov) * Math.min(1, 4 * dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  updateAim(fwd) {
    const r = this.castAim(fwd, this.st.range);
    this.aim.ok = !!(r && !r.out);
    this.aim.hollow = !!(r && r.hollow);
    this.aim.dist = r ? r.dist : 0;
  }

  resupply() {
    this.gas = this.st.maxGas; this.blade = 100; this.spare = this.st.spare;
    this.hp = Math.max(this.hp, this.st.maxHp * 0.6);
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    for (const h of this.hooks) { h.state = 'idle'; h.hollow = null; }
    this.grabbedBy = null; this.dead = false;
  }
}
