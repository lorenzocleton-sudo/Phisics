import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { G } from './state.js';
import { A } from './assets.js';
import { skinMat } from './materials.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const tmpBoxes = [];
const BASE_H = 1.8; // the rig's natural height in metres

export const TYPES = {
  drudge:    { name: 'Drudge', h: [8, 12], walk: 3.2, run: 7.5, seam: 30, ankle: 14, arm: 16, xp: 40, marks: 22, build: 'normal', grab: 0.35, skin: [0xfff0e8, 0xffe6da, 0xfff6ee, 0xf6dccc] },
  sprinter:  { name: 'Sprinter', h: [7, 10], walk: 5, run: 13.5, seam: 24, ankle: 12, arm: 12, xp: 55, marks: 32, build: 'lanky', grab: 0.2, leap: true, skin: [0xffe2d4, 0xf8dccc, 0xffeadc] },
  brute:     { name: 'Brute', h: [14, 18], walk: 2.6, run: 5.8, seam: 70, ankle: 30, arm: 34, xp: 95, marks: 60, build: 'bulky', grab: 0.25, stomp: true, skin: [0xead0bc, 0xf2d8c4, 0xe2c6b0] },
  thornback: { name: 'Thornback', h: [26, 26], walk: 2.4, run: 6.5, seam: 120, ankle: 46, arm: 60, xp: 450, marks: 400, build: 'thorn', grab: 0.3, stomp: true, boss: true, armoredNape: true, kneelBoth: true, skin: [0xc8b4a4] },
  dummy:     { name: 'Training Dummy', h: [9, 9], seam: 14, ankle: 9, arm: 9, xp: 8, marks: 0, build: 'normal', static: true, skin: [0xc8a070] },
};

// Clips without scale tracks (we scale bones for proportions and severing) and without root drift.
let CLIPS = null;
export function clips() {
  if (CLIPS) return CLIPS;
  CLIPS = A.xbot.animations.map((c) => {
    const tracks = c.tracks.filter((t) => !t.name.endsWith('.scale')).map((t) => {
      if (t.name.endsWith('Hips.position')) {
        t = t.clone();
        const v = t.values, x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
      return t;
    });
    return new THREE.AnimationClip(c.name, c.duration, tracks);
  });
  return CLIPS;
}

export class Hollow {
  constructor(type, x, z, rng = Math.random) {
    this.type = type;
    this.T = TYPES[type];
    this.H = this.T.h[0] + (this.T.h[1] - this.T.h[0]) * rng();
    this.pos = new V(x, 0, z);
    this.vel = new V();
    this.yaw = rng() * Math.PI * 2;
    this.state = this.T.static ? 'static' : 'wander';
    this.timer = 0; this.cd = 2 + rng() * 2;
    this.target = new V(x, 0, z);
    this.seamHp = this.T.seam;
    this.limbHp = { ankle0: this.T.ankle, ankle1: this.T.ankle, arm0: this.T.arm, arm1: this.T.arm };
    this.severed = { ankle0: 0, ankle1: 0, arm0: 0, arm1: 0 }; // 0 intact, >0 seconds since cut
    this.kneelT = 0; this.stagger = 0; this.flinch = 0;
    this.dead = false; this.deathT = 0;
    this.waypoint = null; this.aggro = false;
    this.stuck = 0; this.detour = 0; this.detourT = 0; this.stepAcc = 0;
    this.anim = null; this.yOff = 0;
    this.build();
    this.updateParts();
  }

  build() {
    const T = this.T;
    const root = new THREE.Group();
    const model = SkeletonUtils.clone(A.xbot.scene);
    model.rotation.y = Math.PI; // the rig faces +Z; our forward is -Z
    model.scale.setScalar(this.H / BASE_H);
    root.add(model);
    const skin = T.skin[Math.floor(Math.random() * T.skin.length)];
    this.skinMat = skinMat(skin);
    this.jointMat = skinMat(new THREE.Color(skin).multiplyScalar(0.82).getHex());
    if (T.static) { this.skinMat = skinMat(0xc8a070, 'wood', 0.8); this.jointMat = this.skinMat; }
    model.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = o.name.includes('Joints') ? this.jointMat : this.skinMat;
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      }
    });
    const bones = {};
    model.traverse((o) => { if (o.isBone) bones[o.name.replace('mixamorig:', '').replace('mixamorig', '')] = o; });
    this.bones = bones;
    this.group = root; this.model = model;
    // body proportions
    const sc = (n, x, y, z) => bones[n] && bones[n].scale.set(x, y, z);
    if (T.build === 'lanky') { sc('LeftUpLeg', 1, 1.15, 1); sc('RightUpLeg', 1, 1.15, 1); sc('LeftLeg', 0.9, 1.12, 0.9); sc('RightLeg', 0.9, 1.12, 0.9); sc('Spine', 0.85, 1.05, 0.85); sc('LeftArm', 1.18, 0.85, 0.85); sc('RightArm', 1.18, 0.85, 0.85); }
    if (T.build === 'bulky' || T.build === 'thorn') { sc('Spine', 1.3, 1.05, 1.35); sc('Neck', 1.2, 0.7, 1.2); sc('Head', 0.8, 0.85, 0.8); sc('LeftArm', 1, 1.3, 1.3); sc('RightArm', 1, 1.3, 1.3); sc('LeftUpLeg', 1.3, 0.95, 1.3); sc('RightUpLeg', 1.3, 0.95, 1.3); }
    if (T.build === 'normal' && !T.static) sc('Spine', 1.12, 1, 1.18);
    this.baseScale = {};
    for (const n of ['LeftFoot', 'RightFoot', 'LeftForeArm', 'RightForeArm']) this.baseScale[n] = bones[n].scale.clone();
    // the face: hollow eye sockets, ember pupils and a wide grin (head bone units are cm)
    const head = bones.Head;
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a0a08, roughness: 0.9 });
    const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.0, 0.3) });
    const teethM = new THREE.MeshStandardMaterial({ color: 0xeee6d0, roughness: 0.4 });
    const sph = new THREE.SphereGeometry(1, 14, 10);
    const add = (parent, geo, mat, s, p, r) => { const m = new THREE.Mesh(geo, mat); m.scale.set(...s); m.position.set(...p); if (r) m.rotation.set(...r); parent.add(m); return m; };
    for (const s of [-1, 1]) {
      add(head, sph, dark, [3.4, 2.8, 2.6], [s * 4.0, 11, 11.8]);
      add(head, sph, ember, [0.9, 0.9, 0.6], [s * 4.0, 11, 14.0]);
      add(head, sph, dark, [2.2, 0.8, 1.4], [s * 4.0, 14.4, 12.6]);
    }
    // a too-wide grin, cheek to cheek
    add(head, new THREE.BoxGeometry(1, 1, 1), dark, [15, 3.6, 6], [0, 4.2, 10.4]);
    for (let i = -7; i <= 7; i++) {
      const zz = 13.6 - Math.abs(i) * 0.3;
      add(head, new THREE.BoxGeometry(1, 1, 1), teethM, [0.85, 1.5, 0.8], [i * 1.0, 5.4, zz]);
      add(head, new THREE.BoxGeometry(1, 1, 1), teethM, [0.85, 1.3, 0.8], [i * 1.0, 3.0, zz - 0.1]);
    }
    add(head, sph, dark, [1.6, 0.8, 1.0], [0, 7.8, 14.2]);
    // ember seam on the nape: the only killing spot
    this.seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.1, 0.3) });
    this.seam = add(bones.Neck, sph, this.seamMat, [5.5, 2.2, 1.6], [0, 5, -5.2]);
    if (T.build === 'thorn') {
      const plate = new THREE.MeshStandardMaterial({ color: 0x6e6660, roughness: 0.7, metalness: 0.1 });
      const cone = new THREE.ConeGeometry(1, 1, 6);
      for (let i = 0; i < 8; i++) {
        const b = i < 4 ? bones.Spine2 : bones.Spine1;
        add(b, cone, plate, [4, 14, 4], [(i % 2 ? 1 : -1) * 6, (i % 4) * 5 - 4, -11], [-1.2, 0, (i % 2 ? 1 : -1) * 0.2]);
      }
      this.guard = add(bones.Neck, new THREE.BoxGeometry(1, 1, 1), plate, [12, 8, 4], [0, 6, -7.5]);
    }
    // animation
    if (!T.static) {
      this.mixer = new THREE.AnimationMixer(model);
      this.actions = {};
      for (const clip of clips()) this.actions[clip.name] = this.mixer.clipAction(clip);
      this.setAnim('idle', 0);
      this.mixer.update(Math.random() * 2);
    } else {
      // dummies stand with arms out, on a post
      add(root, new THREE.CylinderGeometry(0.25, 0.25, this.H * 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x6b4f35 }), [1, 1, 1], [0, this.H * 0.27, 0.6]);
    }
    // body spheres from bone pairs (radius in units of H)
    const pair = (a, b, r) => ({ a: bones[a], b: b ? bones[b] : null, r });
    this.sphereDefs = [
      pair('Hips', null, 0.12), pair('Spine1', null, 0.13), pair('Spine2', null, 0.14), pair('Head', 'HeadTop_End', 0.095),
      pair('LeftUpLeg', 'LeftLeg', 0.075), pair('RightUpLeg', 'RightLeg', 0.075), pair('LeftLeg', 'LeftFoot', 0.06), pair('RightLeg', 'RightFoot', 0.06),
      pair('LeftArm', 'LeftForeArm', 0.05), pair('RightArm', 'RightForeArm', 0.05),
      { ...pair('LeftForeArm', 'LeftHand', 0.045), limb: 'arm0' }, { ...pair('RightForeArm', 'RightHand', 0.045), limb: 'arm1' },
      { ...pair('LeftHand', null, 0.05), limb: 'arm0' }, { ...pair('RightHand', null, 0.05), limb: 'arm1' },
    ];
    this.spheres = this.sphereDefs.map(() => ({ c: new V(), r: 0 }));
    this.parts = [
      { kind: 'nape', c: new V(), r: 0 }, { kind: 'ankle0', c: new V(), r: 0 }, { kind: 'ankle1', c: new V(), r: 0 },
      { kind: 'arm0', c: new V(), r: 0 }, { kind: 'arm1', c: new V(), r: 0 },
    ];
  }

  setAnim(name, fade = 0.3) {
    if (!this.mixer || this.anim === name) return;
    const next = this.actions[name];
    if (!next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.anim && this.actions[this.anim]) this.actions[this.anim].crossFadeTo(next, fade, false);
    this.anim = name;
  }

  fwd() { return _b.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  bw(name, out = new V()) { return this.bones[name].getWorldPosition(out); }

  updateParts() {
    const g = this.group;
    g.position.set(this.pos.x, this.pos.y + this.yOff, this.pos.z);
    g.rotation.y = this.yaw;
    g.updateMatrixWorld(true);
    const H = this.H;
    this.sphereDefs.forEach((d, i) => {
      const s = this.spheres[i];
      if (d.limb && this.severed[d.limb]) { s.r = 0; return; }
      d.a.getWorldPosition(s.c);
      if (d.b) { d.b.getWorldPosition(_a); s.c.lerp(_a, 0.5); }
      s.r = d.r * H;
    });
    const f = this.fwd().clone();
    const P = this.parts;
    this.bw('Neck', P[0].c).addScaledVector(f, -0.045 * H); P[0].c.y += 0.025 * H; P[0].r = 0.065 * H;
    this.bw('LeftFoot', P[1].c); P[1].c.y += 0.03 * H; P[1].r = 0.06 * H; P[1].off = !!this.severed.ankle0;
    this.bw('RightFoot', P[2].c); P[2].c.y += 0.03 * H; P[2].r = 0.06 * H; P[2].off = !!this.severed.ankle1;
    this.bw('LeftForeArm', P[3].c).lerp(this.bw('LeftHand', _a), 0.45); P[3].r = 0.055 * H; P[3].off = !!this.severed.arm0;
    this.bw('RightForeArm', P[4].c).lerp(this.bw('RightHand', _a), 0.45); P[4].r = 0.055 * H; P[4].off = !!this.severed.arm1;
  }

  // hook attachment to the nearest bone, so tethers ride the animation
  attach(point) {
    let best = null, bd = Infinity;
    for (const n of ['Hips', 'Spine1', 'Spine2', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm']) {
      const d = this.bw(n, _a).distanceTo(point);
      if (d < bd) { bd = d; best = n; }
    }
    const bone = this.bones[best];
    return { bone, local: bone.worldToLocal(point.clone()) };
  }
  attachWorld(att) { return att.bone.localToWorld(_a.copy(att.local)); }
  handWorld() { return this.bw(this.gripArm === 0 ? 'LeftHand' : 'RightHand', new V()); }

  // ---------------------------------------------------------------- AI
  update(dt) {
    const P = G.player;
    if (this.dead) { this.updateDeath(dt); return; }
    if (this.T.static) { this.updateParts(); return; }
    this.timer += dt; this.cd -= dt;
    this.yOff = 0;
    this.updateSevered(dt);
    const toP = _a.set(P.pos.x - this.pos.x, 0, P.pos.z - this.pos.z);
    const distH = toP.length();
    const sees = !P.dead && distH < (this.aggro ? 240 : 150);
    if (sees && !this.aggro) { this.aggro = true; G.audio.roar(distH, this.H); }
    if (!sees) this.aggro = false;
    if (this.flinch > 0) this.flinch -= dt;

    if (this.kneelT > 0) {
      this.kneelT -= dt;
      if (this.kneelT <= 0 && !this.severed.ankle0 && !this.severed.ankle1) { this.state = 'chase'; this.limbHp.ankle0 = this.limbHp.ankle1 = this.T.ankle; }
      else if (this.kneelT <= 0) this.kneelT = 0.1;
      this.setAnim('idle');
      this.mixer.update(dt * 0.6);
      this.poseKneel();
      this.updateParts();
      return;
    }
    if (this.stagger > 0) { this.stagger -= dt; this.setAnim('idle'); this.mixer.update(dt); this.applyOverrides(); this.updateParts(); return; }

    let speed = 0;
    const reach = this.H * 0.6;
    const pH = P.pos.y;
    switch (this.state) {
      case 'wander': {
        if (this.waypoint) this.target.copy(this.waypoint);
        else if (this.timer > 6 || this.pos.distanceTo(this.target) < 6) {
          this.timer = 0;
          const B = G.world.bounds;
          this.target.set(THREE.MathUtils.clamp(this.pos.x + (Math.random() - 0.5) * 120, B.x0 + 30, B.x1 - 30), 0, THREE.MathUtils.clamp(this.pos.z + (Math.random() - 0.5) * 120, B.z0 + 30, B.z1 - 30));
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
        const hasArm = !this.severed.arm1 || !this.severed.arm0;
        if (this.cd <= 0) {
          if (this.T.stomp && distH < this.H * 0.55 && pH < 4) { this.state = 'stomp'; this.timer = 0; }
          else if (hasArm && distH < reach && pH < this.H * 1.15) { this.state = 'windup'; this.timer = 0; this.atkArm = this.severed.arm1 ? 0 : 1; }
          else if (this.T.leap && distH > 22 && distH < 70 && pH < this.H * 1.4) {
            this.state = 'leap'; this.timer = 0;
            this.vel.set(toP.x / 1.1, 13, toP.z / 1.1);
            G.audio.play('roarShort');
          }
        }
        break;
      }
      case 'windup': this.faceTo(P.pos, dt, 3); if (this.timer > 0.6) { this.state = 'strike'; this.timer = 0; this.hitDone = false; G.audio.play('swoosh'); } break;
      case 'strike': {
        if (!this.hitDone && this.timer > 0.08) {
          const L = this.group.worldToLocal(_b.copy(P.pos)).divideScalar(this.H);
          if (L.z < 0.2 && Math.abs(L.x) < 0.5 && Math.hypot(L.x, L.z) < 0.85 && L.y > -0.1 && L.y < 1.0) {
            this.hitDone = true;
            if (Math.random() < this.T.grab && !P.grabbedBy && P.invuln <= 0) {
              this.state = 'hold'; this.timer = 0; this.gripArm = this.atkArm; P.grabbedBy = this; P.escape = 0;
              G.ui.toast(`GRABBED! Mash ${G.input.glyph('slash')} to hack free!`, 'warn');
              G.audio.play('grab'); G.input.rumble(1, 1, 500);
              break;
            }
            _b.subVectors(P.pos, this.pos).setY(0).normalize().multiplyScalar(22).setY(8);
            P.hurt(this.T.boss ? 40 : 26, _b);
          }
        }
        if (this.timer > 0.35) { this.state = 'recover'; this.timer = 0; }
        break;
      }
      case 'recover': if (this.timer > 0.7) { this.state = 'chase'; this.cd = 1.2 + Math.random(); } break;
      case 'hold': {
        if (P.grabbedBy !== this) { this.state = 'recover'; this.timer = 0; break; }
        P.hp -= 7 * dt; P.sinceHit = 0;
        if (P.hp <= 0) P.hp = 1;
        if (this.timer > 4.5) { this.release(false); P.hurt(45, new V(0, 6, 0)); }
        break;
      }
      case 'leap': {
        this.vel.y -= 24 * dt;
        this.pos.addScaledVector(this.vel, dt);
        this.faceTo(P.pos, dt, 6);
        if (!this.hitDone && P.pos.distanceTo(_b.copy(this.pos).setY(this.pos.y + this.H * 0.6)) < this.H * 0.45) {
          this.hitDone = true;
          P.hurt(24, _b.subVectors(P.pos, this.pos).setY(0).normalize().multiplyScalar(18).setY(6));
        }
        if (this.pos.y <= 0 && this.vel.y < 0) { this.pos.y = 0; this.vel.set(0, 0, 0); this.hitDone = false; this.state = 'recover'; this.timer = 0; this.cd = 3; this.impact(0.7); }
        this.setAnim('run'); this.mixer.update(dt * 0.3); this.applyOverrides(); this.updateParts();
        return;
      }
      case 'stomp': {
        if (this.timer > 0.65 && !this.stomped) {
          this.stomped = true; this.impact(1.5);
          const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
          if (d < this.H * 0.6 && P.pos.y < 3) P.hurt(this.T.boss ? 35 : 22, _b.subVectors(P.pos, this.pos).setY(0).normalize().multiplyScalar(20).setY(10));
        }
        if (this.timer > 1.1) { this.state = 'chase'; this.stomped = false; this.cd = 2; }
        break;
      }
    }
    if (speed > 0 && this.flinch <= 0) this.moveToward(this.target, speed, dt);
    // animation: walk/run cycles scaled to the giant's stride
    const k = this.H / BASE_H;
    if (speed <= 0.1 || this.flinch > 0) { this.setAnim('idle'); this.mixer.update(dt); }
    else if (speed > this.T.walk + 0.5) { this.setAnim('run'); this.mixer.update(dt * speed / (3.6 * k)); }
    else { this.setAnim('walk'); this.mixer.update(dt * speed / (1.45 * k)); }
    this.applyOverrides();
    this.separate();
    this.updateParts();
  }

  // aim a bone's length axis along a world direction
  aimBone(name, dir) {
    const bone = this.bones[name], child = bone.children.find((c) => c.isBone);
    if (!child) return;
    bone.parent.updateMatrixWorld(true);
    bone.parent.getWorldQuaternion(_q).invert();
    const dp = dir.clone().applyQuaternion(_q).normalize();
    const axis = child.position.clone().normalize();
    bone.quaternion.setFromUnitVectors(axis, dp);
  }

  applyOverrides() {
    const P = G.player;
    const f = this.fwd().clone(), up = new V(0, 1, 0);
    const arm = this.atkArm === 0 ? 'Left' : 'Right';
    if (this.state === 'windup' || this.state === 'strike') {
      const sh = this.bw(arm + 'Arm', new V());
      const toP = new V().subVectors(P.pos, sh).normalize();
      const raised = f.clone().multiplyScalar(0.4).addScaledVector(up, 1).normalize();
      let d;
      if (this.state === 'windup') d = raised.lerp(toP, 0.0).normalize().lerp(raised, 1 - Math.min(1, this.timer / 0.6));
      else d = raised.clone().lerp(toP.clone().addScaledVector(up, -0.3), Math.min(1, this.timer / 0.22)).normalize();
      this.aimBone(arm + 'Arm', d);
      this.bones[arm + 'ForeArm'].quaternion.identity();
      if (this.state === 'strike') this.bones.Spine.rotation.x += 0.35 * Math.min(1, this.timer / 0.2);
    } else if (this.state === 'hold') {
      const ga = this.gripArm === 0 ? 'Left' : 'Right';
      const k = Math.min(1, this.timer / 0.8);
      const d = f.clone().multiplyScalar(1).addScaledVector(up, -0.2 + k * 0.9).normalize();
      this.aimBone(ga + 'Arm', d);
      this.bones[ga + 'ForeArm'].quaternion.setFromAxisAngle(new V(0, 0, ga === 'Left' ? 1 : -1), 0.9 * k);
      this.bones.Neck.rotation.x += 0.3;
    } else if (this.state === 'stomp') {
      const k = this.timer < 0.65 ? this.timer / 0.65 : Math.max(0, 1 - (this.timer - 0.65) / 0.15);
      this.aimBone('RightUpLeg', new V(0, -1, 0).lerp(f, k * 0.9).normalize());
    } else if (this.state === 'leap') {
      for (const s of ['Left', 'Right']) { this.aimBone(s + 'UpLeg', f.clone().addScaledVector(up, -0.6).normalize()); this.aimBone(s + 'Leg', f.clone().negate().addScaledVector(up, -0.5).normalize()); }
      this.aimBone('LeftArm', up.clone().addScaledVector(f, 0.5).normalize()); this.aimBone('RightArm', up.clone().addScaledVector(f, 0.5).normalize());
    }
    if (this.flinch > 0) this.bones.Neck.rotation.x -= 0.5;
    if (this.T.build === 'lanky' && this.anim === 'run') this.bones.Spine.rotation.x += 0.35;
    this.applySever();
  }

  poseKneel() {
    const f = this.fwd().clone(), up = new V(0, 1, 0);
    this.yOff = -this.H * 0.27;
    this.group.position.y = this.pos.y + this.yOff;
    this.group.updateMatrixWorld(true);
    for (const s of ['Left', 'Right']) {
      this.aimBone(s + 'UpLeg', f.clone().addScaledVector(up, -0.55).normalize());
      this.aimBone(s + 'Leg', f.clone().multiplyScalar(-1).addScaledVector(up, -0.25).normalize());
      this.aimBone(s + 'Arm', f.clone().multiplyScalar(0.5).addScaledVector(up, -1).normalize());
    }
    this.bones.Spine.rotation.x += 0.55;
    this.bones.Neck.rotation.x += 0.5;
    this.applySever();
  }

  applySever() {
    const map = { ankle0: 'LeftFoot', ankle1: 'RightFoot', arm0: 'LeftForeArm', arm1: 'RightForeArm' };
    for (const [k, b] of Object.entries(map)) {
      const t = this.severed[k];
      const bone = this.bones[b], base = this.baseScale[b];
      if (!t) { bone.scale.copy(base); continue; }
      const regrowAt = k.startsWith('arm') ? 12 : 9;
      const g = t < regrowAt ? 0.001 : Math.min(1, (t - regrowAt) / 3);
      bone.scale.copy(base).multiplyScalar(Math.max(0.001, g));
    }
  }

  updateSevered(dt) {
    for (const k of Object.keys(this.severed)) {
      if (!this.severed[k]) continue;
      this.severed[k] += dt;
      const regrowAt = k.startsWith('arm') ? 12 : 9;
      if (this.severed[k] > regrowAt && this.severed[k] < regrowAt + 3) {
        const b = { ankle0: 'LeftLeg', ankle1: 'RightLeg', arm0: 'LeftForeArm', arm1: 'RightForeArm' }[k];
        if (Math.random() < 0.5) G.fx.steam(this.bw(b, _b), this.H * 0.05, 1);
      }
      if (this.severed[k] > regrowAt + 3) { this.severed[k] = 0; this.limbHp[k] = this.T[k.startsWith('arm') ? 'arm' : 'ankle']; }
    }
  }

  faceTo(p, dt, rate) {
    const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
  }

  moveToward(t, speed, dt) {
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    if (Math.hypot(dx, dz) < 0.5) return;
    let ang = Math.atan2(-dx, -dz);
    if (this.detourT > 0) { ang += this.detour; this.detourT -= dt; }
    let diff = ang - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += THREE.MathUtils.clamp(diff, -1.6 * dt, 1.6 * dt);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const limp = (this.severed.ankle0 || this.severed.ankle1) ? 0.3 : 1;
    const step = speed * limp * dt * Math.max(0.2, Math.cos(Math.min(Math.abs(diff), 1.5)));
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += fx * step; this.pos.z += fz * step;
    this.collide();
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (moved < step * 0.3) {
      this.stuck += dt;
      if (this.stuck > 0.8) { this.detour = (Math.random() < 0.5 ? -1 : 1) * 1.2; this.detourT = 2.2; this.stuck = 0; }
    } else this.stuck = Math.max(0, this.stuck - dt);
    this.stepAcc += step;
    if (this.stepAcc > this.H * 0.35) {
      this.stepAcc = 0;
      const dist = this.pos.distanceTo(G.player.pos);
      G.audio.step(dist, this.H);
      if (dist < this.H * 4) { const s = (this.H / 40) * (1 - dist / (this.H * 4)); G.player.shake = Math.max(G.player.shake, s); G.input.rumble(s, s * 0.5, 80); }
      G.fx.dust(this.pos, this.H * 0.15);
    }
  }

  collide() {
    const r = this.H * 0.12;
    G.world.query(this.pos.x - r, this.pos.z - r, this.pos.x + r, this.pos.z + r, tmpBoxes);
    for (const b of tmpBoxes) {
      if (b.y1 < Math.max(6, this.H * 0.45) || b.y0 > this.H * 0.7) continue;
      const cx = THREE.MathUtils.clamp(this.pos.x, b.x0, b.x1), cz = THREE.MathUtils.clamp(this.pos.z, b.z0, b.z1);
      const dx = this.pos.x - cx, dz = this.pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); this.pos.x = cx + (dx / d) * r; this.pos.z = cz + (dz / d) * r; }
        else {
          const l = this.pos.x - b.x0, rr = b.x1 - this.pos.x, n = this.pos.z - b.z0, s = b.z1 - this.pos.z, m = Math.min(l, rr, n, s);
          if (m === l) this.pos.x = b.x0 - r; else if (m === rr) this.pos.x = b.x1 + r; else if (m === n) this.pos.z = b.z0 - r; else this.pos.z = b.z1 + r;
        }
      }
    }
  }

  separate() {
    for (const o of G.hollows) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, min = (this.H + o.H) * 0.14, d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 0.01) { const d = Math.sqrt(d2), p = (min - d) * 0.5; this.pos.x += (dx / d) * p; this.pos.z += (dz / d) * p; }
    }
  }

  impact(strength) {
    const dist = this.pos.distanceTo(G.player.pos);
    G.audio.step(dist * 0.6, this.H * 1.5);
    G.fx.dust(this.pos, this.H * 0.35, 20);
    if (dist < this.H * 5) { const s = strength * (1 - dist / (this.H * 5)); G.player.shake = Math.max(G.player.shake, s); G.input.rumble(Math.min(1, s), 0.5, 200); }
  }

  release(escaped) {
    if (G.player.grabbedBy === this) G.player.grabbedBy = null;
    this.state = 'recover'; this.timer = 0;
    if (escaped) { this.stagger = 1.6; this.cd = 2.5; }
  }
  // the player hacked through the gripping arm
  severGrip() { this.sever('arm' + (this.gripArm ?? 1), G.player.fwd3()); this.release(true); }

  // ---------------------------------------------------------------- damage + gore
  takeHit(kind, dmg, P) {
    const part = this.parts.find((p) => p.kind === kind);
    const pc = part.c.clone();
    if (this.T.static) {
      G.fx.sparks(pc, 10); G.fx.dust(pc, 1.5, 8); G.audio.play('cut');
      G.ui.popup(pc, Math.round(dmg), '#e8c890');
      if (kind !== 'nape') { G.ui.toast('Good cut. Now the glowing nape!'); return 'limb'; }
      this.seamHp -= dmg;
      if (this.seamHp <= 0) {
        this.dead = true; this.deathT = 0; this.seam.visible = false;
        G.audio.play('kill'); G.hitstop(0.1); G.onKill(this, dmg);
        return 'kill';
      }
      return 'wound';
    }
    const away = new V().subVectors(pc, P.pos).normalize();
    if (kind === 'nape') {
      if (this.T.armoredNape && this.kneelT <= 0) {
        G.fx.sparks(pc, 14); G.audio.play('clang');
        G.ui.popup(pc, 'ARMORED', '#9aa3ad');
        G.ui.toast('Its nape is plated. Sever both ankles to bring it down!');
        return 'armored';
      }
      this.seamHp -= dmg;
      G.ui.popup(pc, Math.round(dmg), dmg >= this.T.seam ? '#ffd27a' : '#ff9a5a');
      G.gore.burst(pc, away.clone().add(new V(0, 0.5, 0)), 60, 12);
      if (this.seamHp <= 0) { this.die(P, dmg, away); return 'kill'; }
      G.gore.spurt(() => (this.dead ? null : this.parts[0].c), () => this.fwd().clone().negate().add(new V(0, 0.6, 0)), 1.2, 90, 10);
      G.audio.play('cut');
      this.flinch = 0.4;
      G.ui.toast(P.vel.length() < 16 ? 'Seam wounded. Hit it faster to sever it.' : 'Seam wounded!');
      return 'wound';
    }
    this.limbHp[kind] -= dmg;
    G.ui.popup(pc, Math.round(dmg), '#e8b08a');
    G.gore.burst(pc, away, 35, 10);
    G.audio.play('cut');
    if (this.limbHp[kind] <= 0 && !this.severed[kind]) {
      this.sever(kind, away);
      if (kind.startsWith('ankle')) {
        const down = this.T.kneelBoth ? this.severed.ankle0 && this.severed.ankle1 : true;
        if (down) {
          this.kneelT = this.T.boss ? 9 : 7;
          if (G.player.grabbedBy === this) this.release(true);
          this.state = 'kneel';
          G.ui.toast(`Foot severed! The ${this.T.name} drops to its knees!`);
          this.impact(1);
        } else G.ui.toast('One foot gone. Take the other!');
      } else {
        G.ui.toast(`${this.T.name}'s arm severed!`);
        if (G.player.grabbedBy === this && this.gripArm === +kind[3]) { this.release(true); G.player.grabbedBy = null; }
      }
    }
    return 'limb';
  }

  sever(kind, away) {
    if (this.severed[kind]) return;
    this.severed[kind] = 0.0001;
    const H = this.H;
    const isArm = kind.startsWith('arm');
    const side = kind.endsWith('0') ? 'Left' : 'Right';
    const stumpBone = isArm ? side + 'ForeArm' : side + 'Foot';
    const start = this.bw(stumpBone, new V());
    const len = isArm ? 0.16 * H : 0.08 * H, rad = isArm ? 0.035 * H : 0.04 * H;
    const chunk = G.gore.limbChunk(len, rad, this.skinMat, isArm);
    const vel = away.clone().multiplyScalar(8).add(new V(0, 9, 0));
    G.gore.chunk(chunk, start.clone().add(new V(0, isArm ? 0 : rad, 0)), vel, new V(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    G.gore.burst(start, away, 90, 13, 0.8);
    // the stump pumps blood until it regrows
    const bone = this.bones[stumpBone];
    G.gore.spurt(() => (this.dead && this.deathT > 6 ? null : bone.getWorldPosition(new V())),
      () => (isArm ? new V(0, -0.4, 0).add(this.fwd().clone().multiplyScalar(0.5)) : new V(Math.random() - 0.5, 0.6, Math.random() - 0.5)), isArm ? 6 : 5, 140, 9);
    this.updateParts();
  }

  die(P, dmg, away) {
    this.dead = true; this.deathT = 0;
    if (G.player.grabbedBy === this) G.player.grabbedBy = null;
    const pc = this.parts[0].c.clone();
    const neck = this.bones.Neck;
    // a huge burst, a chunk of nape flesh torn out, and the neck pumping
    G.gore.burst(pc, away.clone().add(new V(0, 0.8, 0)), 260, 16, 0.9);
    G.gore.chunk(G.gore.meatChunk(this.H * 0.035), pc, away.clone().multiplyScalar(14).add(new V(0, 10, 0)), new V(8, 5, 7));
    G.gore.spurt(() => (this.deathT > 8 ? null : neck.getWorldPosition(new V())), () => this.fwd().clone().negate().add(new V(0, 1.2, 0)), 4.5, 220, 15);
    if (G.gore.level === 'off') G.fx.embers(pc, 60);
    G.fx.sparks(pc, 16);
    this.seam.visible = false;
    G.audio.play('kill');
    G.hitstop(this.T.boss ? 0.5 : 0.14);
    G.player.shake = Math.max(G.player.shake, 0.4);
    if (this.mixer) this.mixer.stopAllAction();
    G.onKill(this, dmg);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = this.deathT;
    const fall = Math.min(1, t / 1.5);
    const e = fall * fall;
    this.group.rotation.x = -e * 1.5;
    this.group.position.y = this.pos.y + this.yOff - this.H * 0.08 * e;
    this.bones.Neck.rotation.x = 0.9 * fall;
    this.applySever();
    if (t > 1.5 && !this.pooled) {
      this.pooled = true;
      const f = this.fwd();
      G.gore.pool(this.pos.x + f.x * this.H * 0.6, this.pos.z + f.z * this.H * 0.6, this.H * 1.1);
      this.impact(0.8);
    }
    // Hollow corpses steam away after a while
    if (t > 14) {
      const k = Math.min(1, (t - 14) / 4);
      if (!this.fading) { this.fading = true; for (const m of [this.skinMat, this.jointMat]) { m.transparent = true; } }
      this.skinMat.opacity = this.jointMat.opacity = 1 - k;
      if (Math.random() < 0.7) G.fx.steam(this.bw('Spine1', _b), this.H * 0.15, 2);
    }
    if (t > 18 || (this.T.static && t > 3.5)) this.remove = true;
    this.group.updateMatrixWorld(true);
  }

  dispose() {
    this.skinMat.dispose(); if (this.jointMat !== this.skinMat) this.jointMat.dispose();
    if (this.mixer) this.mixer.stopAllAction();
  }
}

// ---------------------------------------------------------------- spawning
export class Spawner {
  constructor(cfg) { this.cfg = cfg; this.t = 0; this.spawned = 0; this.active = true; }
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
      if (c.aggro) h.aggro = true;
      G.addHollow(h);
      this.spawned++;
      break;
    }
  }
}
