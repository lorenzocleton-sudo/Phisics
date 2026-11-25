import * as THREE from 'three';

// First-person arms and blades, rendered in their own scene on top of the world.
export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3028, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    this.sun.position.set(0.5, 1, 0.6);
    this.scene.add(this.sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.t = 0; this.slashT = 0; this.swapT = 0; this.kick = [0, 0]; this.blood = 0; this.side = 1;
    this.sway = new THREE.Vector2(); this.bob = 0;

    const coat = new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.85 });
    this.coat = coat;
    const leather = new THREE.MeshStandardMaterial({ color: 0x3a281c, roughness: 0.55 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.3, metalness: 0.95 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.35, metalness: 0.8 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8dfe6, roughness: 0.14, metalness: 1.0, envMapIntensity: 1.0 });
    this.bladeMat = steel;
    this.cleanColor = new THREE.Color(0xd8dfe6);
    this.bloodColor = new THREE.Color(0x5a0604);
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.3 * s, -0.34, -0.22);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.36, 6, 14), coat);
      sleeve.rotation.x = Math.PI / 2; sleeve.position.set(0.02 * s, -0.02, 0.05); pivot.add(sleeve);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.009, 8, 20), brass);
      cuff.position.z = -0.15; pivot.add(cuff);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.006, 6, 20), leather);
      strap.position.z = -0.05; pivot.add(strap);
      const hand = new THREE.Group(); hand.position.z = -0.24; pivot.add(hand);
      const glove = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.05, 6, 12), leather);
      glove.rotation.z = Math.PI / 2; glove.scale.set(1, 1, 1.15); hand.add(glove);
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.03, 4, 8), leather);
        f.position.set(-0.03 + k * 0.02, -0.02, -0.035); f.rotation.x = 1.2; hand.add(f);
      }
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.13, 10), iron);
      grip.position.set(0, 0.0, -0.03); grip.rotation.x = 0.25; hand.add(grip);
      const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.014), brass); trigger.position.set(0, -0.035, -0.05); hand.add(trigger);
      // long tapered blade with a darker spine
      const bg = new THREE.BoxGeometry(0.005, 0.032, 1.1, 1, 1, 10);
      const p = bg.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getZ(i); const k = 1 - Math.max(0, -z - 0.1) * 0.4; p.setY(i, p.getY(i) * k); if (z < -0.5) p.setX(i, p.getX(i) * 0.5); }
      bg.computeVertexNormals();
      const bladeG = new THREE.Group(); bladeG.position.set(0, 0.02, -0.06); bladeG.rotation.set(0.38, -s * 0.24, -s * 0.18); hand.add(bladeG);
      const blade = new THREE.Mesh(bg, steel); blade.position.set(0, 0.02, -0.55); bladeG.add(blade);
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.006, 1.05), iron); spine.position.set(0, 0.038, -0.53); bladeG.add(spine);
      pivot.userData = { hand, base: pivot.position.clone(), s };
      this.root.add(pivot);
      this.arms.push(pivot);
    }
    // slash trail
    this.trail = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.05, 32, 1, 0, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.trail.position.set(0, -0.05, -0.6);
    this.scene.add(this.trail);
  }

  setCoat(c) { this.coat.color.setHex(c); }
  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  slash() { this.slashT = 0.3; this.side *= -1; }
  fire(i) { this.kick[i] = 1; }
  swap() { this.swapT = 0.6; this.blood = 0; }
  addBlood(a) { this.blood = Math.min(1, this.blood + a); }

  update(dt, P, lookDx, lookDy) {
    this.t += dt;
    const sp = Math.hypot(P.vel.x, P.vel.z);
    const air = !P.onGround;
    if (!air) this.bob += dt * sp * 1.1;
    const bobAmt = air ? 0 : Math.min(1, sp / 9);
    this.sway.x += (-lookDx * 0.6 - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (lookDy * 0.6 - this.sway.y) * Math.min(1, dt * 8);
    this.root.position.set(
      this.sway.x * 0.5 + Math.sin(this.bob) * 0.012 * bobAmt,
      -this.sway.y * 0.5 + Math.abs(Math.cos(this.bob)) * 0.014 * bobAmt + Math.sin(this.t * 1.6) * 0.004,
      0,
    );
    // flying pose: blades swept back a little, more with speed
    const fly = air ? Math.min(1, P.vel.length() / 40) : 0;
    const swapK = this.swapT > 0 ? Math.sin((1 - this.swapT / 0.6) * Math.PI) : 0;
    this.swapT = Math.max(0, this.swapT - dt);
    for (let i = 0; i < 2; i++) {
      const a = this.arms[i], s = a.userData.s;
      this.kick[i] = Math.max(0, this.kick[i] - dt * 6);
      a.position.copy(a.userData.base);
      a.position.z += this.kick[i] * 0.08;
      a.position.y -= swapK * 0.35;
      a.rotation.set(0.05 - fly * 0.25 + swapK * 0.8, s * (0.12 + fly * 0.15), s * -0.15);
    }
    // the slash: a wide cross-body sweep, both blades, one after the other
    if (this.slashT > 0) {
      const k = 1 - this.slashT / 0.3;
      for (let i = 0; i < 2; i++) {
        const a = this.arms[i], s = a.userData.s;
        const kk = Math.min(1, Math.max(0, k * 1.3 - (i === (this.side > 0 ? 0 : 1) ? 0.15 : 0)));
        const e = Math.sin(kk * Math.PI);
        a.rotation.y = s * (0.12 + 0.9 - kk * 1.9 * 1.0) * 1.0;
        a.rotation.x = 0.3 * e - 0.2;
        a.rotation.z = s * (-0.15 - e * 0.9);
        a.position.x = a.userData.base.x - s * e * 0.18;
        a.position.z = a.userData.base.z - e * 0.12;
      }
      this.trail.material.opacity = Math.sin(k * Math.PI) * 0.45;
      this.trail.rotation.z = this.side * (1.2 - k * 2.6);
      this.slashT -= dt;
    } else this.trail.material.opacity = 0;
    this.bladeMat.color.copy(this.cleanColor).lerp(this.bloodColor, this.blood * 0.85);
    this.bladeMat.roughness = 0.12 + this.blood * 0.25;
    this.bladeMat.metalness = 1 - this.blood * 0.5;
  }
}
