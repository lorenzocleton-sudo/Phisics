import * as THREE from 'three';
import { makeRng } from './rng.js';
import { triMat, groundMat, waterMat } from './materials.js';

export const CELL = 24;
export const WALL_H = 50;
export const WALL_T = 12;
const WALLC = 0xc8bfae;

export const SECTIONS = {
  wilds: {
    id: 'wilds', name: 'The Greenreach Wilds', sub: 'Beyond the Outer Bulwark', seed: 7741,
    bounds: [-1000, 1000, -1000, 1000], fog: 0x9fb0a0, skyTop: 0x5b8cc4, skyBot: 0xcbd9c4,
    ground: '#556f3c', outside: 0x4b6136, fogNear: 140, fogFar: 1150, mask: [0, 0.7, 0.3], sun: [-0.35, 0.8, 0.45], sunCol: 0xfff0d8, env: 'env_wilds',
  },
  lowmarch: {
    id: 'lowmarch', name: 'Lowmarch', sub: 'Within the Outer Bulwark', seed: 1203,
    bounds: [-700, 700, -650, 650], fog: 0xd3c3ad, skyTop: 0x5f8fca, skyBot: 0xead8b6,
    ground: '#7c8a56', outside: 0x6c7a49, fogNear: 260, fogFar: 1700, mask: [0.15, 0.45, 0.4], sun: [-0.6, 0.42, 0.55], sunCol: 0xffd6a8, env: 'env_lowmarch',
  },
  ironvale: {
    id: 'ironvale', name: 'Ironvale', sub: 'Within the Middle Bulwark', seed: 5521,
    bounds: [-900, 900, -800, 800], fog: 0xbfb4a6, skyTop: 0x587aa6, skyBot: 0xdcc8ae,
    ground: '#77705f', outside: 0x6b665a, fogNear: 260, fogFar: 1800, mask: [0.85, 0.0, 0.15], sun: [0.45, 0.62, 0.5], sunCol: 0xffe4c0, env: 'env_ironvale',
  },
  solspire: {
    id: 'solspire', name: 'Solspire', sub: 'Within the Crown Bulwark', seed: 9917,
    bounds: [-800, 800, -800, 800], fog: 0xe6cba0, skyTop: 0x5b84c2, skyBot: 0xf3d6a4,
    ground: '#968a74', outside: 0x7b7060, fogNear: 280, fogFar: 2000, mask: [0.95, 0.05, 0.0], sun: [-0.5, 0.33, 0.7], sunCol: 0xffc888, env: 'env_solspire',
  },
};
export const SECTION_ORDER = ['wilds', 'lowmarch', 'ironvale', 'solspire'];

function jitter(hex, rng, amt = 0.06) {
  const c = new THREE.Color(hex);
  c.offsetHSL(rng.range(-0.015, 0.015), rng.range(-amt, amt) * 0.5, rng.range(-amt, amt));
  return c.getHex();
}

// ---------- shaders ----------
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // gable roof prism, ridge along X
  const rv = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,
    -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, 0.5, 0, 0.5,
    -0.5, 0, -0.5, -0.5, 1, 0, -0.5, 0, 0.5,
    0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,
  ];
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
  roof.computeVertexNormals();
  SHARED = {
    box,
    roof,
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0),
    cylT: new THREE.CylinderGeometry(0.62, 1, 1, 12).translate(0, 0.5, 0),
    cone: new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0),
    pyr: new THREE.ConeGeometry(0.7072, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
    sph: (() => { const g = new THREE.IcosahedronGeometry(1, 3); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 7.1 + p.getY(i) * 3.3) * 0.08 + Math.sin(p.getZ(i) * 9.7 - p.getX(i) * 4.1) * 0.07; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
      g.computeVertexNormals(); return g; })(),
    mats: {
      bld: triMat({ map: 'plaster', normal: 'plaster_n', scale: 1 / 4, windows: true, rough: 0.9 }),
      brick: triMat({ map: 'brick', normal: 'brick_n', scale: 1 / 3.2, windows: true, rough: 0.92 }),
      stone: triMat({ map: 'stone', normal: 'stone_n', scale: 1 / 11, rough: 0.88, ns: 1.3 }),
      plain: triMat({ map: 'wood', normal: 'wood_n', scale: 1 / 2.5, rough: 0.8 }),
      rock: triMat({ map: 'dirt', normal: 'stone_n', scale: 1 / 14, rough: 0.95, ns: 0.7 }),
      roof: triMat({ map: 'roof', normal: 'roof_n', scale: 1 / 4, rough: 0.72, ns: 1.2 }),
      trunk: triMat({ map: 'bark', normal: 'bark_n', scale: 1 / 3, rough: 0.95, ns: 1.4 }),
      leaf: triMat({ map: 'leaf', normal: 'leaf_n', scale: 1 / 5, rough: 0.8, ns: 1.5 }),
    },
  };
  return SHARED;
}

export class World {
  constructor(id, flags = {}) {
    this.id = id;
    this.def = SECTIONS[id];
    this.flags = flags;
    const [x0, x1, z0, z1] = this.def.bounds;
    this.bounds = { x0, x1, z0, z1 };
    this.boxes = [];
    this.hookSpheres = [];
    this.gates = [];
    this.depots = [];
    this.streetsX = [];
    this.streetsZ = [];
    this.tops = [];
    this.free = [];
    this.paint = [];
    this.poi = {};
    this.rings = {};
    this.insignias = [];
    this.animated = [];
    this.lights = [];
    this.R = { bld: [], brick: [], stone: [], plain: [], rock: [], roof: [], cyl: [], cylT: [], trunk: [], dome: [], cone: [], pyr: [], sph: [], far: [] };
    this.group = new THREE.Group();
    this.rng = makeRng(this.def.seed);
    GEN[id](this, this.rng);
    this.buildGrid();
    this.buildMeshes();
    this.buildGround();
  }

  // ---------- primitives ----------
  box(x0, y0, z0, x1, y1, z1, mat = 'bld', color = 0x888888, collide = true, render = true) {
    if (collide) this.boxes.push({ x0, y0, z0, x1, y1, z1 });
    if (render) this.R[mat].push({ x0, y0, z0, x1, y1, z1, color });
  }
  roof(x0, z0, x1, z1, y, h, color) {
    const w = x1 - x0, d = z1 - z0;
    const axis = w >= d ? 'x' : 'z';
    this.R.roof.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w, d, y, h, color, axis });
    // stepped collision approximating the slope
    if (axis === 'x') {
      const cz = (z0 + z1) / 2;
      this.box(x0, y, cz - d * 0.25, x1, y + h * 0.5, cz + d * 0.25, 'plain', 0, true, false);
      this.box(x0, y, cz - d * 0.12, x1, y + h * 0.76, cz + d * 0.12, 'plain', 0, true, false);
    } else {
      const cx = (x0 + x1) / 2;
      this.box(cx - w * 0.25, y, z0, cx + w * 0.25, y + h * 0.5, z1, 'plain', 0, true, false);
      this.box(cx - w * 0.12, y, z0, cx + w * 0.12, y + h * 0.76, z1, 'plain', 0, true, false);
    }
  }
  cyl(x, z, y0, h, r, color, o = {}) {
    (o.list ? this.R[o.list] : o.taper ? this.R.cylT : this.R.cyl).push({ x, z, y0, h, r, color });
    if (o.collide !== false) {
      const k = r * (o.taper ? 0.75 : 0.85);
      this.box(x - k, y0, z - k, x + k, y0 + h, z + k, 'plain', 0, true, false);
    }
  }
  cone(x, z, y0, h, r, color, kind = 'cone') {
    this.R[kind].push({ x, z, y0, h, r, color });
  }
  sphere(x, y, z, r, color, hook = false, list = 'sph') {
    this.R[list].push({ x, y, z, r, color });
    if (hook) this.hookSpheres.push({ x, y, z, r });
  }
  isFree(x0, z0, x1, z1) {
    for (const f of this.free) {
      if (x1 > f[0] && x0 < f[2] && z1 > f[1] && z0 < f[3]) return false;
    }
    return true;
  }
  addFree(x0, z0, x1, z1) { this.free.push([x0, z0, x1, z1]); }

  // ---------- composite builders ----------
  building(x0, z0, x1, z1, h, st, rng) {
    const color = jitter(rng.pick(st.colors), rng);
    const mat = st.mats ? rng.pick(st.mats) : 'bld';
    this.box(x0, 0, z0, x1, h, z1, mat, color);
    const w = x1 - x0, d = z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (st.roof && rng.chance(st.roof) && h < 40) {
      const rh = Math.min(w, d) * rng.range(0.32, 0.5);
      this.roof(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, h, rh, jitter(rng.pick(st.roofColors), rng, 0.04));
      if (rng.chance(0.3)) this.cyl(cx + w * 0.22, cz + d * 0.15, h, rh + 2, 0.6, 0x9a7a6a, { collide: false });
      return;
    }
    let top = h;
    if (st.tier && h > 26 && rng.chance(st.tier)) {
      let ix0 = x0, ix1 = x1, iz0 = z0, iz1 = z1;
      const tiers = rng.int(1, 2);
      for (let i = 0; i < tiers; i++) {
        const sw = (ix1 - ix0) * 0.16, sd = (iz1 - iz0) * 0.16;
        ix0 += sw; ix1 -= sw; iz0 += sd; iz1 -= sd;
        const th = h * rng.range(0.15, 0.3);
        this.box(ix0, top, iz0, ix1, top + th, iz1, mat, color);
        top += th;
      }
      if (st.spire && rng.chance(st.spire)) {
        const r = Math.min(ix1 - ix0, iz1 - iz0) * 0.45;
        this.cone(cx, cz, top, r * rng.range(2.5, 4), r, jitter(rng.pick(st.roofColors), rng), rng.chance(0.5) ? 'cone' : 'pyr');
        return;
      }
    } else if (rng.chance(0.35)) {
      const hw = Math.min(w * 0.3, 4), hd = Math.min(d * 0.3, 4);
      const ox = rng.range(-w * 0.2, w * 0.2), oz = rng.range(-d * 0.2, d * 0.2);
      this.box(cx + ox - hw, h, cz + oz - hd, cx + ox + hw, h + 3, cz + oz + hd, mat, jitter(color, rng));
    }
    // parapet lip (render only)
    if (h > 14) {
      const c2 = jitter(color, rng, 0.1);
      this.box(x0, h, z0, x1, h + 0.8, z0 + 0.5, 'plain', c2, false);
      this.box(x0, h, z1 - 0.5, x1, h + 0.8, z1, 'plain', c2, false);
      this.box(x0, h, z0, x0 + 0.5, h + 0.8, z1, 'plain', c2, false);
      this.box(x1 - 0.5, h, z0, x1, h + 0.8, z1, 'plain', c2, false);
    }
    this.tops.push({ x: cx, z: cz, y: top, w, d });
  }

  cityFill(area, st, rng) {
    const xs = [], zs = [];
    let x = area.x0;
    while (x < area.x1 - 20) {
      const x1 = Math.min(x + rng.range(st.block[0], st.block[1]), area.x1);
      xs.push([x, x1]);
      const sw = rng.range(st.street[0], st.street[1]);
      if (x1 + sw < area.x1) this.streetsX.push(x1 + sw / 2);
      x = x1 + sw;
    }
    let z = area.z0;
    while (z < area.z1 - 20) {
      const z1 = Math.min(z + rng.range(st.block[0], st.block[1]), area.z1);
      zs.push([z, z1]);
      const sw = rng.range(st.street[0], st.street[1]);
      if (z1 + sw < area.z1) this.streetsZ.push(z1 + sw / 2);
      z = z1 + sw;
    }
    for (const [bx0, bx1] of xs) for (const [bz0, bz1] of zs) this.fillBlock(bx0, bz0, bx1, bz1, st, rng);
  }

  fillBlock(bx0, bz0, bx1, bz1, st, rng) {
    if (bx1 - bx0 < 8 || bz1 - bz0 < 8) return;
    const rows = [];
    const alongX = (bx1 - bx0) >= (bz1 - bz0);
    if (alongX) {
      if (bz1 - bz0 > 26) { const m = (bz0 + bz1) / 2; rows.push([bz0, m - 0.5, -1], [m + 0.5, bz1, 1]); }
      else rows.push([bz0, bz1, 0]);
      for (const [r0, r1] of rows) {
        let lx = bx0;
        while (lx < bx1 - 5) {
          const lw = Math.min(rng.range(st.lot[0], st.lot[1]), bx1 - lx);
          if (lw < 5) break;
          this.lot(lx, r0, lx + lw, r1, st, rng);
          lx += lw + (rng.chance(0.25) ? rng.range(1, 3) : 0);
        }
      }
    } else {
      if (bx1 - bx0 > 26) { const m = (bx0 + bx1) / 2; rows.push([bx0, m - 0.5], [m + 0.5, bx1]); }
      else rows.push([bx0, bx1]);
      for (const [r0, r1] of rows) {
        let lz = bz0;
        while (lz < bz1 - 5) {
          const lw = Math.min(rng.range(st.lot[0], st.lot[1]), bz1 - lz);
          if (lw < 5) break;
          this.lot(r0, lz, r1, lz + lw, st, rng);
          lz += lw + (rng.chance(0.25) ? rng.range(1, 3) : 0);
        }
      }
    }
  }

  lot(x0, z0, x1, z1, st, rng) {
    const ins = rng.range(0.3, 1.4);
    x0 += ins; z0 += ins; x1 -= ins; z1 -= ins;
    if (x1 - x0 < 4 || z1 - z0 < 4) return;
    if (!this.isFree(x0, z0, x1, z1)) return;
    if (rng.chance(st.skip || 0.05)) return;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const hm = st.heightFn ? st.heightFn(cx, cz) : 1;
    let h = rng.range(st.h[0], st.h[1]) * hm;
    const tc = typeof st.tallChance === 'function' ? st.tallChance(cx, cz) : (st.tallChance || 0);
    if (rng.chance(tc)) h = rng.range(st.tall[0], st.tall[1]);
    const zoneSt = st.zone ? st.zone(cx, cz) : null;
    if (zoneSt) { h = rng.range(zoneSt.h[0], zoneSt.h[1]); st = { ...st, ...zoneSt }; }
    this.building(x0, z0, x1, z1, Math.max(4, h), st, rng);
    if (st.chimney && rng.chance(st.chimney)) {
      this.cyl(x0 + 2.5, z0 + 2.5, 0, rng.range(38, 60), rng.range(1.6, 2.4), 0xa07868, { taper: true });
    }
  }

  wallX(zIn, zOut, x0, x1, openings = [], towers = 190) {
    const za = Math.min(zIn, zOut), zb = Math.max(zIn, zOut);
    openings.sort((a, b) => a.x - b.x);
    let cur = x0;
    const rng = this.rng;
    for (const o of openings) {
      const a = o.x - o.w / 2, b = o.x + o.w / 2;
      if (a > cur) this.box(cur, 0, za, a, WALL_H, zb, 'stone', WALLC);
      if (o.kind === 'gate') {
        this.box(a, o.h, za, b, WALL_H, zb, 'stone', WALLC);
        const zm = (za + zb) / 2;
        this.box(a, 0, zm - 1.2, b, o.h, zm + 1.2, 'plain', 0x8a6a50);
        for (let i = 0; i < 6; i++) {
          const bx = a + (i + 0.5) * (o.w / 6);
          this.box(bx - 0.25, 0, zm - 1.5, bx + 0.25, o.h, zm + 1.5, 'plain', 0x2e2a27, false);
        }
        const face = zIn < zOut ? za : zb;
        const s = zIn < zOut ? -1 : 1;
        this.box(a - 3, 0, Math.min(face, face + s * 2), a, o.h + 3, Math.max(face, face + s * 2), 'stone', 0xb8ae9c);
        this.box(b, 0, Math.min(face, face + s * 2), b + 3, o.h + 3, Math.max(face, face + s * 2), 'stone', 0xb8ae9c);
        this.box(a - 3, o.h, Math.min(face, face + s * 2), b + 3, o.h + 3, Math.max(face, face + s * 2), 'stone', 0xb8ae9c);
      } else if (o.kind === 'breach') {
        const n = Math.ceil(o.w / 4);
        for (let i = 0; i < n; i++) {
          const sx = a + i * (o.w / n);
          const edge = Math.min(i, n - 1 - i);
          const bottom = Math.min(WALL_H, 14 + edge * edge * 5 + rng.range(0, 6));
          this.box(sx, bottom, za, sx + o.w / n, WALL_H - rng.range(0, edge < 2 ? 0 : 6), zb, 'stone', WALLC);
        }
        for (let i = 0; i < 18; i++) {
          const rx = rng.range(a - 6, b + 6), rz = rng.range(za - 18, zb + 18);
          const s = rng.range(2, 6);
          this.box(rx - s, 0, rz - s, rx + s, rng.range(1, 5), rz + s, 'stone', 0xbcb2a0);
        }
      } else if (o.kind === 'patch') {
        this.box(a, 0, za + 2, b, WALL_H, zb - 2, 'stone', 0xa89e8c);
        for (let i = 0; i < 5; i++) {
          const sx = a + i * (o.w / 4);
          this.box(sx - 0.5, 0, zb - 2, sx + 0.5, WALL_H, zb + 0.5, 'plain', 0xa08060, false);
        }
        for (let y = 10; y < WALL_H; y += 10) this.box(a, y, zb - 2, b, y + 0.6, zb + 0.6, 'plain', 0xa08060, false);
      }
      cur = b;
    }
    if (cur < x1) this.box(cur, 0, za, x1, WALL_H, zb, 'stone', WALLC);
    // crenels + towers
    for (let x = x0 + 3; x < x1 - 3; x += 7) {
      if (openings.some((o) => o.kind === 'breach' && Math.abs(x - o.x) < o.w / 2 + 2)) continue;
      this.box(x - 1.3, WALL_H, za, x + 1.3, WALL_H + 2.2, za + 1.4, 'stone', 0xc2b8a8, false);
      this.box(x - 1.3, WALL_H, zb - 1.4, x + 1.3, WALL_H + 2.2, zb, 'stone', 0xc2b8a8, false);
    }
    if (towers) {
      for (let x = x0 + towers / 2; x < x1 - 30; x += towers) {
        if (openings.some((o) => Math.abs(x - o.x) < o.w / 2 + 14)) continue;
        this.box(x - 8, WALL_H, za - 2, x + 8, WALL_H + 14, zb + 2, 'stone', 0xc0b6a4);
        this.roof(x - 9, za - 3, x + 9, zb + 3, WALL_H + 14, 7, 0xa06450);
      }
    }
  }
  wallZ(xIn, xOut, z0, z1, towers = 190) {
    const xa = Math.min(xIn, xOut), xb = Math.max(xIn, xOut);
    this.box(xa, 0, z0, xb, WALL_H, z1, 'stone', WALLC);
    for (let z = z0 + 3; z < z1 - 3; z += 7) {
      this.box(xa, WALL_H, z - 1.3, xa + 1.4, WALL_H + 2.2, z + 1.3, 'stone', 0xc2b8a8, false);
      this.box(xb - 1.4, WALL_H, z - 1.3, xb, WALL_H + 2.2, z + 1.3, 'stone', 0xc2b8a8, false);
    }
    if (towers) {
      for (let z = z0 + towers / 2; z < z1 - 30; z += towers) {
        this.box(xa - 2, WALL_H, z - 8, xb + 2, WALL_H + 14, z + 8, 'stone', 0xc0b6a4);
        this.roof(xa - 3, z - 9, xb + 3, z + 9, WALL_H + 14, 7, 0xa06450);
      }
    }
  }
  gate(x, zFace, inward, dest, label) {
    this.gates.push({ x, z: zFace, inward, dest, label });
    this.addFree(x - 22, Math.min(zFace, zFace + inward * 40), x + 22, Math.max(zFace, zFace + inward * 40));
  }
  depot(x, z, label = 'Supply Depot') {
    this.box(x - 4, 0, z - 3, x + 4, 3.6, z + 3, 'plain', 0xb09070);
    this.roof(x - 4.6, z - 3.6, x + 4.6, z + 3.6, 3.6, 2.4, 0x5a9a66);
    for (let i = 0; i < 4; i++) {
      const cx = x + 5.5 + (i % 2) * 1.6, cz = z - 2 + Math.floor(i / 2) * 1.8;
      this.box(cx - 0.7, 0, cz - 0.7, cx + 0.7, 1.4, cz + 0.7, 'plain', 0xc0a070);
    }
    this.cyl(x - 5.5, z + 3, 0, 9, 0.18, 0x3a3a3a, { collide: false });
    this.box(x - 5.4, 6.4, z + 3, x - 3.2, 8.6, z + 3.12, 'plain', 0x3aa36a, false);
    this.cyl(x + 5.2, z + 2.6, 0, 1.8, 0.7, 0x7a8a92);
    this.depots.push({ x, z, label });
    this.addFree(x - 8, z - 6, x + 9, z + 6);
  }
  tree(x, z, h, rng, leaf = 0xc8e0b0) {
    this.cyl(x, z, 0, h * 0.55, h * 0.045, 0x8c7660, { collide: h > 10, list: 'trunk' });
    const c = jitter(leaf, rng, 0.08);
    this.sphere(x, h * 0.62, z, h * 0.26, c, h > 10);
    this.sphere(x + h * 0.08, h * 0.8, z - h * 0.05, h * 0.18, jitter(c, rng, 0.05), false);
  }
  bigTree(x, z, rng) {
    const h = rng.range(45, 88);
    const r = rng.range(2.4, 4.4);
    this.cyl(x, z, 0, h, r, jitter(0x9a8270, rng, 0.07), { taper: true, list: 'trunk' });
    // root flares
    this.cyl(x, z, 0, 4, r * 1.5, 0x8a7260, { taper: true, collide: false, list: 'trunk' });
    const c = jitter(0xb0d098, rng, 0.08);
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(4, 11);
      const sr = rng.range(9, 15);
      this.sphere(x + Math.cos(a) * d, h - rng.range(0, 12), z + Math.sin(a) * d, sr, jitter(c, rng, 0.05), true);
    }
    // a couple of thick branches to land on
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2), y = rng.range(h * 0.45, h * 0.7), L = rng.range(7, 12);
      const ex = x + Math.cos(a) * L, ez = z + Math.sin(a) * L;
      this.box(Math.min(x, ex) - 0.8, y, Math.min(z, ez) - 0.8, Math.max(x, ex) + 0.8, y + 1.4, Math.max(z, ez) + 0.8, 'rock', 0x7a5a40);
    }
  }
  windmill(x, z, rng) {
    this.cyl(x, z, 0, 20, 4.2, 0xcfc4ae, { taper: true });
    this.cone(x, z, 20, 6, 3.4, 0xb0603e);
    const g = new THREE.Group();
    g.position.set(x, 18, z + 3.4);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 13, 0.25), mat);
      b.position.y = 7; const p = new THREE.Group(); p.add(b); p.rotation.z = (i * Math.PI) / 2; g.add(p);
    }
    g.userData.spin = rng.range(0.4, 0.8);
    this.group.add(g);
    this.animated.push(g);
  }

  // ---------- spatial ----------
  buildGrid() {
    this.grid = new Map();
    this.stamp = new Int32Array(this.boxes.length);
    this.stampId = 1;
    this.boxes.forEach((b, i) => {
      const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
      const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const k = (cx + 1000) * 4000 + (cz + 1000);
        let a = this.grid.get(k);
        if (!a) { a = []; this.grid.set(k, a); }
        a.push(i);
      }
    });
  }
  addDynamicBox(b) {
    this.boxes.push(b);
    const s = new Int32Array(this.boxes.length); s.set(this.stamp); this.stamp = s;
    const i = this.boxes.length - 1;
    for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++)
      for (let cz = Math.floor(b.z0 / CELL); cz <= Math.floor(b.z1 / CELL); cz++) {
        const k = (cx + 1000) * 4000 + (cz + 1000);
        let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); } a.push(i);
      }
  }
  query(x0, z0, x1, z1, out) {
    out.length = 0;
    const id = ++this.stampId;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const a = this.grid.get((cx + 1000) * 4000 + (cz + 1000));
      if (!a) continue;
      for (const i of a) if (this.stamp[i] !== id) { this.stamp[i] = id; out.push(this.boxes[i]); }
    }
    return out;
  }
  // ray vs boxes (+ ground, optionally hook spheres). dir must be normalized.
  raycast(o, d, maxDist, spheres = true) {
    let best = maxDist, hit = null, nrm = null;
    // ground
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t > 0 && t < best) { best = t; hit = 'ground'; nrm = [0, 1, 0]; }
    }
    const stampId = ++this.stampId;
    let cx = Math.floor(o.x / CELL), cz = Math.floor(o.z / CELL);
    const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const tdx = Math.abs(d.x) > 1e-9 ? CELL / Math.abs(d.x) : Infinity;
    const tdz = Math.abs(d.z) > 1e-9 ? CELL / Math.abs(d.z) : Infinity;
    let tmx = Math.abs(d.x) > 1e-9 ? ((cx + (d.x > 0 ? 1 : 0)) * CELL - o.x) / d.x : Infinity;
    let tmz = Math.abs(d.z) > 1e-9 ? ((cz + (d.z > 0 ? 1 : 0)) * CELL - o.z) / d.z : Infinity;
    for (let iter = 0; iter < 200; iter++) {
      const a = this.grid.get((cx + 1000) * 4000 + (cz + 1000));
      if (a) for (const i of a) {
        if (this.stamp[i] === stampId) continue;
        this.stamp[i] = stampId;
        const b = this.boxes[i];
        const r = rayBox(o, d, b, best);
        if (r) { best = r.t; hit = b; nrm = r.n; }
      }
      const tExit = Math.min(tmx, tmz);
      if (tExit >= best || tExit > maxDist) break;
      if (tmx < tmz) { cx += sx; tmx += tdx; } else { cz += sz; tmz += tdz; }
    }
    if (spheres) {
      for (const s of this.hookSpheres) {
        const t = raySphere(o, d, s, s.r);
        if (t !== null && t < best) { best = t; hit = s; nrm = null; }
      }
    }
    if (!hit) return null;
    return { t: best, hit, n: nrm, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best) };
  }

  // ---------- meshes ----------
  buildMeshes() {
    const S = shared();
    const R = this.R;
    const dmy = new THREE.Object3D();
    const col = new THREE.Color();
    const mk = (geo, mat, list, set, cast = true) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        dmy.position.set(0, 0, 0); dmy.rotation.set(0, 0, 0); dmy.scale.set(1, 1, 1);
        set(it, dmy); dmy.updateMatrix();
        im.setMatrixAt(i, dmy.matrix);
        im.setColorAt(i, col.setHex(it.color));
      });
      im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceMatrix.needsUpdate = true;
      this.group.add(im);
    };
    const boxSet = (b, o) => { o.position.set((b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2); o.scale.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0); };
    mk(S.box, S.mats.bld, R.bld, boxSet);
    mk(S.box, S.mats.brick, R.brick, boxSet);
    mk(S.box, S.mats.stone, R.stone, boxSet);
    mk(S.box, S.mats.plain, R.plain, boxSet);
    mk(S.box, S.mats.rock, R.rock, boxSet);
    mk(S.roof, S.mats.roof, R.roof, (r, o) => {
      o.position.set(r.cx, r.y, r.cz);
      if (r.axis === 'x') o.scale.set(r.w, r.h, r.d);
      else { o.rotation.y = Math.PI / 2; o.scale.set(r.d, r.h, r.w); }
    });
    const cs = (c, o) => { o.position.set(c.x, c.y0, c.z); o.scale.set(c.r, c.h, c.r); };
    mk(S.cyl, S.mats.stone, R.cyl, cs);
    mk(S.cylT, S.mats.stone, R.cylT, cs);
    mk(S.cylT, S.mats.trunk, R.trunk, cs);
    mk(S.cone, S.mats.roof, R.cone, cs);
    mk(S.pyr, S.mats.roof, R.pyr, (c, o) => { o.position.set(c.x, c.y0, c.z); o.scale.set(c.r * 2, c.h, c.r * 2); });
    mk(new THREE.SphereGeometry(1, 32, 16), S.mats.stone, R.dome, (s, o) => { o.position.set(s.x, s.y, s.z); o.scale.setScalar(s.r); });
    mk(S.sph, S.mats.leaf, R.sph, (s, o) => { o.position.set(s.x, s.y, s.z); o.scale.set(s.r, s.r * 0.82, s.r); });
  }

  buildGround() {
    const { x0, x1, z0, z1 } = this.bounds;
    const W = x1 - x0, D = z1 - z0;
    const mkCanvas = (res) => { const cv = document.createElement('canvas'); const px = res / Math.max(W, D); cv.width = Math.ceil(W * px); cv.height = Math.ceil(D * px); return { cv, g: cv.getContext('2d'), px }; };
    // tint layer: regional colour variation
    const T = mkCanvas(1024);
    T.g.fillStyle = this.def.ground; T.g.fillRect(0, 0, T.cv.width, T.cv.height);
    // mask layer: R = paving, G = grass, B = dirt
    const M = mkCanvas(1024);
    const m = this.def.mask;
    const css = (v) => `rgb(${Math.round(v[0] * 255)},${Math.round(v[1] * 255)},${Math.round(v[2] * 255)})`;
    M.g.fillStyle = css(m); M.g.fillRect(0, 0, M.cv.width, M.cv.height);
    const rng = makeRng(this.def.seed + 1);
    for (let i = 0; i < 1400; i++) {
      const x = rng.range(0, M.cv.width), y = rng.range(0, M.cv.height), r = rng.range(4, 30);
      const k = rng.next();
      M.g.fillStyle = k < 0.5 ? 'rgba(0,255,0,0.12)' : 'rgba(0,0,255,0.12)';
      if (m[0] > 0.8) M.g.fillStyle = 'rgba(0,0,255,0.06)';
      M.g.beginPath(); M.g.arc(x, y, r, 0, 7); M.g.fill();
      T.g.fillStyle = `rgba(${k < 0.5 ? '0,0,0' : '255,250,230'},${rng.range(0.03, 0.08)})`;
      T.g.beginPath(); T.g.arc(x, y, r, 0, 7); T.g.fill();
    }
    for (const p of this.paint) {
      for (const [L, col] of [[T, p.color], [M, p.m ? css(p.m) : null]]) {
        if (!col) continue;
        const tx = (x) => (x - x0) * L.px, tz = (z) => (z - z0) * L.px;
        L.g.fillStyle = col;
        if (p.type === 'rect') L.g.fillRect(tx(p.x0), tz(p.z0), (p.x1 - p.x0) * L.px, (p.z1 - p.z0) * L.px);
        else { L.g.beginPath(); L.g.arc(tx(p.x), tz(p.z), p.r * L.px, 0, Math.PI * 2); L.g.fill(); }
        if (p.stripes && L === T) {
          L.g.fillStyle = p.stripes;
          for (let z = p.z0; z < p.z1; z += 3) L.g.fillRect(tx(p.x0), tz(z), (p.x1 - p.x0) * L.px, Math.max(1, 1.2 * L.px));
        }
      }
    }
    const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 1, 1), groundMat(mk(M.cv, false), mk(T.cv, true), this.bounds));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    ground.receiveShadow = true;
    this.group.add(ground);
    this.tintCanvas = T.cv;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ color: this.def.outside, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.08;
    this.group.add(outer);
    this.mapCanvas = this.renderMap();
  }

  renderMap() {
    const { x0, x1, z0, z1 } = this.bounds;
    const W = x1 - x0, D = z1 - z0;
    const s = 900 / Math.max(W, D);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(W * s); cv.height = Math.ceil(D * s);
    const g = cv.getContext('2d');
    g.fillStyle = '#2b2e2a'; g.fillRect(0, 0, cv.width, cv.height);
    for (const p of this.paint) {
      g.fillStyle = p.map || 'rgba(120,130,100,0.25)';
      if (p.type === 'rect') g.fillRect((p.x0 - x0) * s, (p.z0 - z0) * s, (p.x1 - p.x0) * s, (p.z1 - p.z0) * s);
      else { g.beginPath(); g.arc((p.x - x0) * s, (p.z - z0) * s, p.r * s, 0, Math.PI * 2); g.fill(); }
    }
    for (const b of this.R.bld.concat(this.R.stone, this.R.brick)) {
      const h = b.y1;
      const l = Math.min(80, 30 + h * 0.8);
      g.fillStyle = b.y1 >= WALL_H - 1 && b.y0 === 0 ? '#a49a88' : `hsl(30,8%,${l}%)`;
      g.fillRect((b.x0 - x0) * s, (b.z0 - z0) * s, Math.max(1, (b.x1 - b.x0) * s), Math.max(1, (b.z1 - b.z0) * s));
    }
    for (const c of this.R.cyl.concat(this.R.cylT, this.R.trunk)) {
      if (c.r < 1.5) continue;
      g.fillStyle = this.id === 'wilds' ? '#5b4a36' : '#b8ad99';
      g.beginPath(); g.arc((c.x - x0) * s, (c.z - z0) * s, Math.max(1, c.r * s), 0, Math.PI * 2); g.fill();
    }
    if (this.id === 'wilds') {
      for (const sp of this.hookSpheres) {
        g.fillStyle = 'rgba(70,110,60,0.55)';
        g.beginPath(); g.arc((sp.x - x0) * s, (sp.z - z0) * s, sp.r * s, 0, Math.PI * 2); g.fill();
      }
    }
    return { canvas: cv, scale: s };
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        if (o.material && o.material.map) o.material.map.dispose();
        if (o.isInstancedMesh) o.dispose();
      }
    });
  }
}

function rayBox(o, d, b, maxT) {
  let tmin = 0, tmax = maxT, n = null;
  const axes = [['x', 'x0', 'x1', 0], ['y', 'y0', 'y1', 1], ['z', 'z0', 'z1', 2]];
  let nAxis = -1, nSign = 0;
  for (const [k, lo, hi, ai] of axes) {
    const dk = d[k], ok = o[k];
    if (Math.abs(dk) < 1e-9) {
      if (ok < b[lo] || ok > b[hi]) return null;
    } else {
      let t1 = (b[lo] - ok) / dk, t2 = (b[hi] - ok) / dk;
      let s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = ai; nSign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (nAxis < 0) return null; // origin inside box
  n = [0, 0, 0]; n[nAxis] = nSign;
  return { t: tmin, n };
}
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : null;
}

// ======================================================================
// Section generators
// ======================================================================
function farScenery(w, rng, base = 0x8a9aa6) {
  // A ring of ridged mountains beyond the walls, coloured by height and pre-blended with haze.
  const segA = 220, segR = 18, r0 = 1900, r1 = 3600;
  const pos = [], col = [], idx = [];
  const haze = new THREE.Color(w.def.fog);
  const rock = new THREE.Color(base).multiplyScalar(1.2), grass = new THREE.Color(0x6a7c4c), snow = new THREE.Color(0xf6f8fb);
  const ph = [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)];
  const ridge = (a) => {
    let h = 0, amp = 1, f = 3;
    for (let o = 0; o < 5; o++) { h += (1 - Math.abs(Math.sin(a * f + ph[o % 3] * (o + 1)))) * amp; amp *= 0.5; f *= 2.1; }
    return h;
  };
  for (let j = 0; j <= segR; j++) {
    const t = j / segR, r = r0 + (r1 - r0) * t;
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const prof = Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 0.8;
      const h = Math.max(0, ridge(a + t * 0.3) * 330 * prof * (0.6 + 0.6 * Math.sin(a * 2 + ph[0]) ** 2) - 40);
      pos.push(Math.cos(a) * r, h - 5, Math.sin(a) * r);
      const c = h > 420 ? snow.clone() : h > 120 ? rock.clone() : grass.clone().lerp(rock, h / 120);
      c.lerp(haze, 0.55 + t * 0.3);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
    const a = j * (segA + 1) + i, b = a + segA + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, flatShading: true }));
  w.group.add(m);
}
function innerSilhouettes(w, distZ, label) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0x9e9a92, fog: false, transparent: true, opacity: 0.55 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2600, 60, 20), m);
  wall.position.set(0, 30, distZ);
  g.add(wall);
  w.group.add(g);
  if (label) w.lanternDist = distZ;
}
function lanternGlow(w, x, y, z, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.25, 'rgba(255,190,90,0.8)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  sp.position.set(x, y, z); sp.scale.setScalar(size);
  w.group.add(sp);
  w.lantern = sp;
}

const STYLE_HOUSE = {
  street: [9, 13], block: [44, 66], lot: [9, 15], h: [6, 11], roof: 0.85, tallChance: 0.02, tall: [16, 22],
  colors: [0xf2e6cf, 0xe8d5b5, 0xf5ecdc, 0xdcc6a4, 0xeedcbe, 0xe0ccb0],
  roofColors: [0xc0694a, 0xb05a3e, 0x9a7a66, 0xc7764e, 0x8a7060],
};
const STYLE_IRON = {
  street: [12, 17], block: [50, 78], lot: [12, 22], h: [12, 28], roof: 0.2, tall: [50, 150], tier: 0.6, spire: 0.15,
  mats: ['brick', 'brick', 'bld'],
  colors: [0xe8d4c2, 0xd8c0a8, 0xf0e2d0, 0xc8b8a8, 0xe2d2bc, 0xd4ccc2, 0xc8a898],
  roofColors: [0x6a7a86, 0x8a6a58, 0x9a5a48],
};
const STYLE_SOL = {
  street: [14, 20], block: [56, 84], lot: [14, 24], h: [22, 46], roof: 0.1, tall: [70, 180], tier: 0.75, spire: 0.65,
  mats: ['bld', 'bld', 'stone'],
  colors: [0xfaf2e4, 0xfff8ec, 0xf0e4cc, 0xf8ead0, 0xece2d2, 0xfff2da],
  roofColors: [0x5a8eaa, 0x4a7c96, 0xb08a4a, 0x5f9a88, 0xd0a850],
};
const M_PAVE = [1, 0, 0], M_GRASS = [0, 1, 0], M_DIRT = [0, 0.15, 0.85], M_FIELD = [0, 0.55, 0.45];

// A landmark tower: stacked tiers with a spire, solid and climbable.
function landmarkTower(w, x, z, base, h, color, roofColor, rng, mat = 'stone') {
  let s = base / 2, y = 0;
  const tiers = Math.max(2, Math.round(h / 45));
  for (let i = 0; i < tiers; i++) {
    const th = h / tiers;
    w.box(x - s, y, z - s, x + s, y + th, z + s, mat, color);
    // balcony ledge on each tier
    w.box(x - s - 1.2, y + th - 0.8, z - s - 1.2, x + s + 1.2, y + th, z + s + 1.2, 'stone', 0xd8d0c0);
    y += th; s *= 0.8;
  }
  w.tops.push({ x, z, y, w: s * 2, d: s * 2 });
  w.cone(x, z, y, s * rng.range(4, 6), s * 1.15, roofColor, 'pyr');
}

const GEN = {
  // -------------------------------------------------------------- LOWMARCH
  lowmarch(w, rng) {
    const { x0, x1, z0, z1 } = w.bounds;
    const N = z0 + WALL_T, S = z1 - WALL_T;
    const BX = 260;
    const southOpen = [{ x: -200, w: 22, h: 26, kind: 'gate' }];
    southOpen.push(w.flags.breachSealed ? { x: BX, w: 44, kind: 'patch' } : { x: BX, w: 44, kind: 'breach' });
    w.wallX(N, z0, x0, x1, [{ x: 0, w: 22, h: 26, kind: 'gate' }]);
    w.wallX(S, z1, x0, x1, southOpen);
    w.wallZ(x0 + WALL_T, x0, N, S);
    w.wallZ(x1 - WALL_T, x1, N, S);
    w.gate(0, N, 1, 'ironvale', 'Ironvale (Middle Bulwark)');
    w.gate(-200, S, -1, 'wilds', 'The Wilds (Outer Bulwark)');
    w.poi.breach = { x: BX, z: S - 6 };
    w.poi.breachOutside = { x: BX, z: z1 + 30 };
    w.paint.push({ type: 'rect', x0: -480, z0: N, x1: 480, z1: S, color: '#8a8270', m: [0.55, 0.1, 0.35] });
    w.paint.push({ type: 'rect', x0: -9, z0: z0, x1: 9, z1: z1, color: '#8c8270', map: '#5a5446', m: M_PAVE });
    w.paint.push({ type: 'rect', x0: -209, z0: 300, x1: -191, z1: z1, color: '#8c8270', map: '#5a5446', m: M_PAVE });
    w.addFree(-9, z0, 9, z1);
    // plaza + bell tower
    w.addFree(-42, -42, 42, 42);
    w.paint.push({ type: 'circle', x: 0, z: 0, r: 42, color: '#a39882', map: '#6b6556', m: M_PAVE });
    w.box(-5, 0, -5, 5, 34, 5, 'stone', 0xd8ccb4);
    for (const [px, pz] of [[-5, -5], [3.4, -5], [-5, 3.4], [3.4, 3.4]]) w.box(px, 34, pz, px + 1.6, 40, pz + 1.6, 'stone', 0xd8ccb4);
    w.box(-5.6, 40, -5.6, 5.6, 41, 5.6, 'plain', 0x9a7a5a);
    w.cone(0, 0, 41, 8, 7.4, 0xb0603e, 'pyr');
    w.cone(0, 0, 36.5, 3, 1.6, 0xb08a3a);
    w.poi.bell = { x: 0, y: 34, z: 0 };
    w.cyl(0, 24, 0, 1.2, 5, 0xcfc4ae);
    w.cyl(0, 24, 0, 4, 0.8, 0xcfc4ae);
    // training yard by the north wall
    const yz = N + 20;
    const yard = [-300, yz, -100, yz + 130];
    w.addFree(...yard);
    w.paint.push({ type: 'rect', x0: yard[0], z0: yard[1], x1: yard[2], z1: yard[3], color: '#9b8a68', map: '#6a5f48', m: M_DIRT });
    const dz = yz - (-420);
    const frames = [[-255, -400], [-215, -330], [-170, -395], [-125, -335], [-105, -400], [-200, -405]].map(([a, b]) => [a, b + dz]);
    for (const [fx, fz] of frames) {
      w.cyl(fx - 6, fz, 0, 26, 0.9, 0xa07a55);
      w.cyl(fx + 6, fz, 0, 26, 0.9, 0xa07a55);
      w.box(fx - 7, 24, fz - 0.8, fx + 7, 25.6, fz + 0.8, 'plain', 0xb08a60);
    }
    w.poi.yard = { x: -180, z: -355 + dz };
    w.poi.dummies = [[-235, -360 + dz], [-150, -365 + dz], [-190, -305 + dz]];
    w.rings.yard = [[-215, 15, -345 + dz], [-170, 18, -385 + dz], [-125, 16, -350 + dz], [-150, 22, -310 + dz], [-235, 20, -395 + dz]];
    // breach clearing
    w.addFree(BX - 70, S - 110, BX + 70, z1);
    w.paint.push({ type: 'rect', x0: BX - 60, z0: S - 100, x1: BX + 60, z1: S, color: '#7d7461', map: '#5a5446', m: M_DIRT });
    // stone keeps: tall towers rising over the rooftops
    const keeps = [[-330, -200], [320, -260], [-280, 330], [380, 180], [120, -330], [-60, 260], [200, 60], [-200, 20]];
    for (const [kx, kz] of keeps) {
      w.addFree(kx - 14, kz - 14, kx + 14, kz + 14);
      landmarkTower(w, kx, kz, rng.range(14, 20), rng.range(45, 75), 0xd6cab2, 0xb0603e, rng);
    }
    // fields with windmills
    const fW = [x0 + WALL_T + 4, N + 40, -485, S - 40], fE = [485, N + 40, x1 - WALL_T - 4, S - 40];
    for (const f of [fW, fE]) {
      w.addFree(...f);
      for (let z = f[1]; z < f[3]; z += rng.range(50, 80)) {
        const zz = Math.min(f[3], z + rng.range(40, 70));
        const c = rng.pick(['#b3a35a', '#8a9a48', '#c3b06a', '#6f8a40', '#a89a58']);
        w.paint.push({ type: 'rect', x0: f[0] + 4, z0: z, x1: f[2] - 4, z1: zz - 4, color: c, stripes: 'rgba(60,50,20,0.2)', map: 'rgba(130,140,70,0.35)', m: M_FIELD });
      }
    }
    for (const [mx, mz] of [[-590, -260], [-610, 200], [585, -150], [605, 320]]) w.windmill(mx, mz, rng);
    for (let i = 0; i < 22; i++) {
      const fx = rng.chance(0.5) ? rng.range(-670, -500) : rng.range(500, 670);
      const fz = rng.range(-560, 560);
      const s2 = rng.range(7, 11);
      w.building(fx - s2, fz - s2 * 0.6, fx + s2, fz + s2 * 0.6, rng.range(5, 8), STYLE_HOUSE, rng);
      for (let k = 0; k < 3; k++) w.cyl(fx + rng.range(-20, 20), fz + rng.range(-20, 20), 0, 2.2, 1.6, 0xd9b86a, { collide: false });
    }
    for (let i = 0; i < 140; i++) {
      const fx = rng.chance(0.5) ? rng.range(-680, -495) : rng.range(495, 680);
      w.tree(fx, rng.range(-620, 620), rng.range(8, 16), rng);
    }
    for (const [tx, tz] of [[-470, 560], [470, 560], [-470, -560], [470, -560]]) {
      w.box(tx - 4, 0, tz - 4, tx + 4, 30, tz + 4, 'stone', 0xd6cab2);
      w.roof(tx - 5, tz - 5, tx + 5, tz + 5, 30, 5, 0xb0603e);
    }
    w.depot(28, N + 33, 'North Gate Depot');
    w.depot(-172, S - 38, 'South Gate Depot');
    w.depot(58, 52, 'Market Depot');
    w.depot(BX - 30, S - 118, 'Breach Depot');
    w.depot(-380, 0, 'West Market Depot');
    w.depot(380, -40, 'East Market Depot');
    w.cityFill({ x0: -470, z0: N + 6, x1: 470, z1: S - 6 }, {
      ...STYLE_HOUSE,
      heightFn: (x, z) => 1 + Math.max(0, 1 - Math.hypot(x, z) / 380) * 0.9,
    }, rng);
    farScenery(w, rng);
    innerSilhouettes(w, -2000, true);
    lanternGlow(w, 0, 300, -3300, 320);
    w.respawn = { x: 28, z: N + 46 };
    w.npcSpots = { maren: [-185, -345 + dz], bry: [28, N + 42], ilsa: [BX - 5, S - 108], pell: [-30, 50] };
    w.newGame = [-185, 0.9, -330 + dz];
  },

  // -------------------------------------------------------------- IRONVALE
  ironvale(w, rng) {
    const { x0, x1, z0, z1 } = w.bounds;
    const N = z0 + WALL_T, S = z1 - WALL_T;
    w.wallX(N, z0, x0, x1, [{ x: 0, w: 22, h: 28, kind: 'gate' }]);
    w.wallX(S, z1, x0, x1, [{ x: 0, w: 22, h: 28, kind: 'gate' }]);
    w.wallZ(x0 + WALL_T, x0, N, S);
    w.wallZ(x1 - WALL_T, x1, N, S);
    w.gate(0, N, 1, 'solspire', 'Solspire (Crown Bulwark)');
    w.gate(0, S, -1, 'lowmarch', 'Lowmarch (Outer Ring)');
    // canal
    w.addFree(x0, 86, x1, 114);
    w.paint.push({ type: 'rect', x0, z0: 84, x1, z1: 116, color: '#6d665a', map: '#3c5a6e', m: M_PAVE });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 28), waterMat());
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.05, 100); water.receiveShadow = true;
    w.group.add(water);
    w.box(x0, 0, 84, x1, 0.6, 86, 'stone', 0xc8c0b0);
    w.box(x0, 0, 114, x1, 0.6, 116, 'stone', 0xc8c0b0);
    w.addFree(-12, z0, 12, z1);
    w.paint.push({ type: 'rect', x0: -12, z0, x1: 12, z1, color: '#8a8272', map: '#55514a', m: M_PAVE });
    // plaza and HQ
    w.addFree(-75, -140, 75, 25);
    w.paint.push({ type: 'rect', x0: -75, z0: -140, x1: 75, z1: 25, color: '#9a917f', map: '#625c50', m: M_PAVE });
    w.box(-32, 0, -112, 32, 38, -70, 'stone', 0xdcd0bc);
    w.box(-20, 38, -104, 20, 46, -78, 'stone', 0xd4c8b2);
    w.roof(-21, -105, 21, -77, 46, 8, 0x6a7a86);
    for (const [cx, cz] of [[-32, -112], [32, -112], [-32, -70], [32, -70]]) {
      w.cyl(cx, cz, 0, 52, 5, 0xe0d4c0);
      w.cone(cx, cz, 52, 12, 6, 0x6a7a86);
    }
    for (const bx of [-18, -6, 6, 18]) w.box(bx - 2, 14, -69.6, bx + 2, 32, -69.2, 'plain', 0x9a2f2a, false);
    w.poi.hq = { x: 0, z: -60 };
    w.box(-4, 0, -24, 4, 3, -16, 'stone', 0xcfc4ae);
    w.cyl(0, -20, 3, 9, 1.4, 0x8fa09a);
    // arena with training dummies
    w.addFree(220, -350, 420, -170);
    w.paint.push({ type: 'rect', x0: 225, z0: -345, x1: 415, z1: -175, color: '#9b8a68', map: '#6a5f48', m: M_DIRT });
    w.box(220, 0, -350, 420, 4, -346, 'stone', 0xcfc4ae);
    w.box(220, 0, -174, 420, 4, -170, 'stone', 0xcfc4ae);
    w.box(220, 0, -350, 224, 4, -170, 'stone', 0xcfc4ae);
    w.box(416, 0, -350, 420, 4, -170, 'stone', 0xcfc4ae);
    for (const [fx, fz] of [[260, -300], [320, -220], [380, -300], [300, -320], [360, -210]]) {
      w.cyl(fx, fz, 0, 30, 1, 0xa07a55);
      w.box(fx - 8, 28, fz - 0.8, fx + 8, 29.6, fz + 0.8, 'plain', 0xb08a60);
    }
    w.poi.arena = { x: 320, z: -260 };
    w.poi.dummies = [[260, -250], [300, -280], [340, -230], [380, -260], [320, -320]];
    // the Foundry Spires: a ring of huge chimney-towers
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, r = 520;
      const tx = Math.cos(a) * r * 1.1, tz = Math.sin(a) * r * 0.85;
      w.addFree(tx - 16, tz - 16, tx + 16, tz + 16);
      landmarkTower(w, tx, tz, 22, rng.range(120, 170), 0xc8a898, 0x6a7a86, rng, 'brick');
    }
    w.depot(30, N + 32, 'Crown Gate Depot');
    w.depot(30, S - 32, 'Lowmarch Gate Depot');
    w.depot(-300, 60, 'Foundry Depot');
    w.depot(300, 60, 'Canal Depot');
    w.depot(85, -40, 'HQ Depot');
    w.depot(-620, -420, 'Northwest Depot');
    w.depot(620, 420, 'Southeast Depot');
    w.cityFill({ x0: x0 + WALL_T + 6, z0: N + 6, x1: x1 - WALL_T - 6, z1: S - 6 }, {
      ...STYLE_IRON,
      heightFn: (x, z) => 0.85 + Math.max(0, 1 - Math.hypot(x, z + 60) / 600) * 0.9,
      tallChance: (x, z) => 0.05 + 0.3 * Math.max(0, 1 - Math.hypot(x, z + 60) / 520),
      zone: (x) => (x < -480 ? { h: [10, 22], lot: [18, 34], colors: [0xb08a7a, 0xa0806e, 0xb89a80, 0x989088], roof: 0.4, chimney: 0.25, mats: ['brick'] } : null),
    }, rng);
    for (const sx of w.streetsX.concat([0])) {
      w.box(sx - 6, 0, 84, sx + 6, 0.9, 116, 'stone', 0xc8c0b0);
      w.box(sx - 6, 0.9, 84, sx - 5.4, 2, 116, 'stone', 0xc8c0b0, false);
      w.box(sx + 5.4, 0.9, 84, sx + 6, 2, 116, 'stone', 0xc8c0b0, false);
    }
    w.rings.courier = buildRoute(w, rng, 10, { x: -40, z: 70 }, 16, 34);
    farScenery(w, rng, 0x8f98a0);
    innerSilhouettes(w, -1900, true);
    lanternGlow(w, 0, 280, -2400, 280);
    w.respawn = { x: 85, z: -28 };
    w.npcSpots = { voss: [0, -58], tamsin: [-50, -20], oren: [50, -20], clerk: [22, 4], pip: [-40, 60] };
  },

  // -------------------------------------------------------------- SOLSPIRE
  solspire(w, rng) {
    const { x0, x1, z0, z1 } = w.bounds;
    const N = z0 + WALL_T, S = z1 - WALL_T;
    w.wallX(N, z0, x0, x1, []);
    w.wallX(S, z1, x0, x1, [{ x: 0, w: 22, h: 28, kind: 'gate' }]);
    w.wallZ(x0 + WALL_T, x0, N, S);
    w.wallZ(x1 - WALL_T, x1, N, S);
    w.gate(0, S, -1, 'ironvale', 'Ironvale (Middle Ring)');
    w.addFree(-26, -140, 26, z1);
    w.paint.push({ type: 'rect', x0: -26, z0: -140, x1: 26, z1, color: '#c2b49a', map: '#7a705e', m: M_PAVE });
    for (let z = -120; z < S - 20; z += 24) { w.tree(-21, z, 11, rng, 0xb8d8a0); w.tree(21, z, 11, rng, 0xb8d8a0); }
    // palace precinct + gardens
    w.addFree(-130, -340, 130, -100);
    w.paint.push({ type: 'rect', x0: -130, z0: -150, x1: 130, z1: -100, color: '#5f7d45', map: '#4a6a3a', m: M_GRASS });
    w.paint.push({ type: 'rect', x0: -130, z0: -340, x1: 130, z1: -150, color: '#b3a68c', map: '#6f6656', m: M_PAVE });
    w.box(-80, 0, -300, 80, 46, -215, 'stone', 0xf4ead8);
    w.box(-120, 0, -280, -80, 32, -230, 'stone', 0xeee2cc);
    w.box(80, 0, -280, 120, 32, -230, 'stone', 0xeee2cc);
    w.roof(-121, -281, -79, -229, 32, 10, 0x4a7c96);
    w.roof(79, -281, 121, -229, 32, 10, 0x4a7c96);
    for (const [cx, cz] of [[-80, -300], [80, -300], [-80, -215], [80, -215]]) {
      w.cyl(cx, cz, 0, 84, 7, 0xf6eedc);
      w.cone(cx, cz, 84, 26, 8.5, 0x4a7c96);
    }
    w.box(-22, 46, -280, 22, 72, -236, 'stone', 0xf6ecda);
    w.cyl(0, -258, 72, 40, 9, 0xf6eedc);
    w.box(-11, 112, -269, 11, 114, -247, 'stone', 0xd0a850);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      w.cyl(Math.cos(a) * 9, -258 + Math.sin(a) * 9, 114, 8, 0.8, 0xd0a850, { collide: false });
    }
    const lm = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 1.0) }));
    lm.position.set(0, 128, -258);
    w.group.add(lm);
    w.lanternCore = lm;
    lanternGlow(w, 0, 128, -258, 90);
    const pl = new THREE.PointLight(0xffb060, 400, 320, 1.6); pl.position.set(0, 128, -258);
    w.group.add(pl);
    w.poi.lantern = { x: 0, y: 128, z: -258 };
    // cathedral
    w.box(185, 0, 80, 255, 42, 175, 'stone', 0xf0e4cc);
    w.roof(184, 79, 256, 176, 42, 18, 0x5a8eaa);
    w.cyl(220, 70, 0, 92, 8, 0xf4eada);
    w.cone(220, 70, 92, 40, 9.5, 0x5a8eaa);
    w.addFree(175, 55, 265, 185);
    // archive with dome
    w.box(-265, 0, 25, -175, 34, 95, 'stone', 0xe8dcc4);
    w.sphere(-220, 34, 60, 24, 0xd8b870, false, 'dome');
    w.poi.archive = { x: -220, z: 108 };
    w.addFree(-275, 15, -165, 175);
    w.paint.push({ type: 'rect', x0: -275, z0: 95, x1: -165, z1: 140, color: '#b8ab92', map: '#6f6656', m: M_PAVE });
    // the Seven Spires: the tallest towers in the city
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2, r = 500;
      const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
      w.addFree(tx - 20, tz - 20, tx + 20, tz + 20);
      landmarkTower(w, tx, tz, 30, rng.range(170, 230), 0xf4ead8, rng.pick([0x5a8eaa, 0xd0a850]), rng, 'bld');
    }
    w.depot(32, S - 40, 'Crown Gate Depot');
    w.depot(42, -112, 'Palace Depot');
    for (const [dx, dz2, n] of [[-300, -300, 'West Spire'], [300, -300, 'East Spire'], [-300, 300, 'Lamplighters'], [300, 300, 'Gilded'], [-620, 0, 'Sunset'], [620, 0, 'Sunrise']]) w.depot(dx, dz2, n + ' Depot');
    w.cityFill({ x0: x0 + WALL_T + 6, z0: N + 6, x1: x1 - WALL_T - 6, z1: S - 6 }, {
      ...STYLE_SOL,
      heightFn: (x, z) => 0.85 + Math.max(0, 1 - Math.hypot(x, z + 200) / 650) * 0.8,
      tallChance: (x, z) => 0.1 + 0.3 * Math.max(0, 1 - Math.hypot(x, z + 100) / 700),
    }, rng);
    w.rings.spire = buildRoute(w, rng, 12, { x: 0, z: 380 }, 40, 85);
    farScenery(w, rng, 0x9aa2ac);
    w.respawn = { x: 32, z: S - 54 };
    w.npcSpots = { oriel: [-220, 112], veyra: [36, 300], ambrose: [-36, 200] };
  },

  // -------------------------------------------------------------- WILDS
  wilds(w, rng) {
    const { x0, x1, z0, z1 } = w.bounds;
    const N = z0 + WALL_T;
    w.wallX(N, z0, -2200, 2200, [{ x: 0, w: 22, h: 26, kind: 'gate' }], 220);
    w.gate(0, N, 1, 'lowmarch', 'Lowmarch (Outer Bulwark)');
    w.addFree(-14, z0, 14, 160);
    w.paint.push({ type: 'rect', x0: -12, z0, x1: 12, z1: 170, color: '#7a6a4c', map: '#5a4e3a', m: M_DIRT });
    w.addFree(x0, z0, x1, N + 60);
    w.paint.push({ type: 'circle', x: 0, z: 200, r: 45, color: '#7a6a4c', map: '#5a4e3a', m: M_DIRT });
    w.addFree(-45, 155, 45, 245);
    w.box(-20, 0, 210, 20, 2.5, 212, 'plain', 0xa07a55);
    w.box(-20, 0, 188, -18, 2.5, 212, 'plain', 0xa07a55);
    w.box(18, 0, 188, 20, 2.5, 212, 'plain', 0xa07a55);
    w.cyl(-14, 194, 0, 18, 1.2, 0xa07a55);
    w.box(-18, 16, 190, -10, 17, 198, 'plain', 0xa07a55);
    // ruins of Hollowmere
    w.addFree(170, 210, 450, 470);
    w.paint.push({ type: 'rect', x0: 175, z0: 215, x1: 445, z1: 465, color: '#6e6a52', map: '#55554a', m: [0.4, 0.2, 0.4] });
    for (let gx = 0; gx < 6; gx++) for (let gz = 0; gz < 6; gz++) {
      if (rng.chance(0.25)) continue;
      const cx = 195 + gx * 42 + rng.range(-5, 5), cz = 235 + gz * 40 + rng.range(-5, 5);
      const ww = rng.range(8, 16), dd = rng.range(8, 14), h = rng.range(3, 13);
      if (Math.hypot(cx - 310, cz - 330) < 30) continue;
      if (rng.chance(0.5)) w.box(cx - ww / 2, 0, cz - dd / 2, cx + ww / 2, h, cz + dd / 2, 'stone', 0xbab2a4);
      else {
        w.box(cx - ww / 2, 0, cz - dd / 2, cx + ww / 2, h, cz - dd / 2 + 1, 'stone', 0xbab2a4);
        w.box(cx - ww / 2, 0, cz - dd / 2, cx - ww / 2 + 1, h * 0.7, cz + dd / 2, 'stone', 0xbab2a4);
      }
    }
    w.box(300, 0, 315, 320, 20, 345, 'stone', 0xc2b8a8);
    w.cyl(310, 312, 0, 34, 3.4, 0xc2b8a8);
    w.poi.chapel = { x: 310, y: 34, z: 312 };
    // Greyhorn tower
    w.addFree(-500, 400, -400, 500);
    w.paint.push({ type: 'circle', x: -450, z: 450, r: 40, color: '#6e6a52', map: '#55554a', m: M_DIRT });
    w.cyl(-450, 450, 0, 70, 9.5, 0xbab2a4);
    w.box(-462, 70, 438, -438, 72, 462, 'stone', 0xb0a898);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (i === 3 || i === 4) continue;
      w.box(-450 + Math.cos(a) * 11 - 1.2, 72, 450 + Math.sin(a) * 11 - 1.2, -450 + Math.cos(a) * 11 + 1.2, 74.5, 450 + Math.sin(a) * 11 + 1.2, 'stone', 0xb0a898);
    }
    w.poi.tower = { x: -450, y: 72, z: 450 };
    // Thornback lair meadow
    w.addFree(380, 450, 660, 720);
    w.paint.push({ type: 'circle', x: 520, z: 585, r: 120, color: '#6a7a40', map: '#4f5f35', m: M_GRASS });
    w.poi.lair = { x: 520, z: 585 };
    for (let i = 0; i < 10; i++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(70, 120), s2 = rng.range(4, 9);
      w.box(520 + Math.cos(a) * d - s2, 0, 585 + Math.sin(a) * d - s2, 520 + Math.cos(a) * d + s2, rng.range(8, 22), 585 + Math.sin(a) * d + s2, 'rock', 0xb0a898);
    }
    w.depot(0, 225, 'Forward Cache');
    w.depot(-410, 400, 'Greyhorn Cache');
    w.depot(440, 470, 'Meadow Cache');
    w.depot(-620, -420, 'Westwood Cache');
    w.depot(620, -420, 'Eastwood Cache');
    w.depot(0, 760, 'Deepwood Cache');
    for (let i = 0; i < 70; i++) {
      const rx = rng.range(x0 + 20, x1 - 20), rz = rng.range(z0 + 90, z1 - 20), s2 = rng.range(3, 9);
      if (!w.isFree(rx - s2, rz - s2, rx + s2, rz + s2)) continue;
      w.box(rx - s2, 0, rz - s2 * 0.8, rx + s2, rng.range(3, 12), rz + s2 * 0.8, 'rock', jitter(0xb0a898, rng));
    }
    const placed = [];
    let count = 0;
    for (let i = 0; i < 9000 && count < 680; i++) {
      const tx = rng.range(x0 + 15, x1 - 15), tz = rng.range(z0 + 70, z1 - 15);
      if (!w.isFree(tx - 6, tz - 6, tx + 6, tz + 6)) continue;
      let ok = true;
      for (const p2 of placed) { if ((p2[0] - tx) ** 2 + (p2[1] - tz) ** 2 < 30 * 30) { ok = false; break; } }
      if (!ok) continue;
      placed.push([tx, tz]);
      w.bigTree(tx, tz, rng);
      count++;
    }
    for (let i = 0; i < 50; i++) {
      const t = i / 50;
      const pts = [[x0 + t * (x1 - x0), z1], [x0, z0 + 100 + t * (z1 - z0 - 100)], [x1, z0 + 100 + t * (z1 - z0 - 100)]];
      for (const [px, pz] of pts) {
        const s2 = rng.range(20, 40);
        w.box(px - s2, 0, pz - s2, px + s2, rng.range(30, 90), pz + s2, 'rock', jitter(0xa8a090, rng));
      }
    }
    farScenery(w, rng, 0x7f9488);
    lanternGlow(w, 0, 300, -3600, 340);
    w.respawn = { x: 0, z: 212 };
    w.npcSpots = { fenn: [8, 200] };
  },
};

// Race route through street intersections, hopping between neighbours.
function buildRoute(w, rng, n, start, yMin, yMax) {
  const xs = w.streetsX.slice().sort((a, b) => a - b);
  const zs = w.streetsZ.slice().sort((a, b) => a - b);
  if (!xs.length || !zs.length) return [];
  let ix = 0, iz = 0, bd = Infinity;
  xs.forEach((x, i) => { if (Math.abs(x - start.x) < bd) { bd = Math.abs(x - start.x); ix = i; } });
  bd = Infinity;
  zs.forEach((z, i) => { if (Math.abs(z - start.z) < bd) { bd = Math.abs(z - start.z); iz = i; } });
  const pts = [];
  let dir = 0;
  for (let i = 0; i < n; i++) {
    const r = rng.next();
    if (r < 0.45) dir = (dir + 1) % 4; else if (r < 0.6) dir = (dir + 3) % 4;
    for (let tries = 0; tries < 4; tries++) {
      const nx = ix + (dir === 0 ? 1 : dir === 2 ? -1 : 0), nz = iz + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
      if (nx >= 0 && nx < xs.length && nz >= 0 && nz < zs.length) { ix = nx; iz = nz; break; }
      dir = (dir + 1) % 4;
    }
    pts.push([xs[ix], rng.range(yMin, yMax), zs[iz]]);
  }
  return pts;
}
