import * as THREE from 'three';
import { G } from './state.js';

export const NPC_DEFS = {
  maren:   { name: 'Maren Holt', title: 'Training Instructor', section: 'lowmarch', color: 0x6b3a2a, hair: 0x9a9a9a },
  bry:     { name: 'Bry Callow', title: 'Quartermaster', section: 'lowmarch', color: 0x4a5a3a, hair: 0x5a3a20, shop: ['tank', 'stock', 'armor'] },
  ilsa:    { name: 'Captain Ilsa Thorne', title: 'Bulwark Watch', section: 'lowmarch', color: 0x8a3a2a, hair: 0x2a1a10 },
  pell:    { name: 'Old Pell', title: 'Farmer', section: 'lowmarch', color: 0x7a6a4a, hair: 0xd0d0d0 },
  voss:    { name: 'Commander Dace Voss', title: 'Warden High Command', section: 'ironvale', color: 0x2f3f5f, hair: 0x3a3a3a },
  tamsin:  { name: 'Tamsin Quill', title: 'Rig Engineer', section: 'ironvale', color: 0x6a5a3a, hair: 0xa0522d, shop: ['reel', 'range', 'tank'] },
  oren:    { name: 'Oren Kade', title: 'Bladesmith', section: 'ironvale', color: 0x3a3a3a, hair: 0x1a1a1a, shop: ['edge', 'stock', 'armor'] },
  clerk:   { name: 'Wren Ashby', title: 'Bounty Clerk', section: 'ironvale', color: 0x5a4a6a, hair: 0x2a2a3a },
  pip:     { name: 'Pip', title: 'Courier', section: 'ironvale', color: 0xa0522d, hair: 0xd8a040, small: true },
  fenn:    { name: 'Scout Fenn', title: 'Skyward Vanguard', section: 'wilds', color: 0x2f6f8a, hair: 0x6a4a2a },
  oriel:   { name: 'Archivist Oriel Sarn', title: 'Keeper of the Archive', section: 'solspire', color: 0x4a2f5f, hair: 0xe0e0e0 },
  veyra:   { name: 'Lady Veyra Castell', title: 'Patron of the Spire Run', section: 'solspire', color: 0x8a2f4a, hair: 0xc8a050 },
  ambrose: { name: 'Ambrose Lark', title: 'Collector of Lost Insignia', section: 'solspire', color: 0x5f5a2f, hair: 0x7a7a7a },
};

const FOLK_LINES = {
  lowmarch: [
    'My cousin says the wall hums at night. I told her that is just the wind.',
    'Wardens! Mind the laundry lines when you fly over.',
    'Bread went up again. Everything comes through Ironvale now and they take their cut.',
    'The bell tower is the best view in Lowmarch. Old Pell used to climb it.',
    'They say the Lantern can be seen from the Wilds. Imagine being out there.',
  ],
  ironvale: [
    'Forge smoke and canal fog. You get used to it.',
    'A good rig costs a year of wages. Do not wrap yours round a chimney.',
    'Commander Voss never smiles. My sister swears she saw it once.',
    'Pip is always racing someone across the rooftops. Kid is fast.',
    'Wren posts the Wilds bounties at noon. Easy coin, if you come back.',
  ],
  solspire: [
    'One does not dash across the boulevard, Warden. One promenades.',
    'The Lantern has burned for three hundred years. It is the heart of us.',
    'Lady Veyra pays well for anyone who can fly her Spire Run.',
    'They say the Archive has rooms no one has opened since the founding.',
    'Hollows? Here? Do not be absurd. The Crown Bulwark has never fallen.',
  ],
};

function makeLabel(text, sub, color = '#f2e6cf') {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  c.font = '600 44px "Barlow Condensed", "Arial Narrow", sans-serif';
  c.textAlign = 'center'; c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,0.75)';
  c.strokeText(text, 256, 56); c.fillStyle = color; c.fillText(text, 256, 56);
  if (sub) {
    c.font = '400 30px "Barlow Condensed", "Arial Narrow", sans-serif';
    c.strokeText(sub, 256, 100); c.fillStyle = '#c9b48a'; c.fillText(sub, 256, 100);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false, transparent: true }));
  sp.scale.set(4, 1, 1);
  return sp;
}
function makeMarker() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false, transparent: true }));
  sp.scale.set(1.4, 1.4, 1);
  sp.userData.cv = cv; sp.userData.sym = '';
  return sp;
}
function drawMarker(sp, sym) {
  if (sp.userData.sym === sym) return;
  sp.userData.sym = sym;
  const c = sp.userData.cv.getContext('2d');
  c.clearRect(0, 0, 128, 128);
  if (sym) {
    c.font = '900 110px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 10; c.strokeStyle = '#1a1208'; c.strokeText(sym, 64, 70);
    c.fillStyle = sym === '!' ? '#ffcf4a' : sym === '$' ? '#7fd38a' : '#9fd0ff'; c.fillText(sym, 64, 70);
  }
  sp.material.map.needsUpdate = true;
}

export function makePerson(color, hair, small = false) {
  const g = new THREE.Group();
  const m = (c) => new THREE.MeshLambertMaterial({ color: c });
  const s = small ? 0.78 : 1;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), m(color)); body.position.y = 1.15; body.castShadow = true;
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.3, 0.32), m(new THREE.Color(color).multiplyScalar(0.7).getHex())); skirt.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), m(0xdcb08e)); head.position.y = 1.62;
  const hr = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.12, 0.31), m(hair)); hr.position.set(0, 1.72, 0.03);
  g.add(body, skirt, head, hr);
  const legs = [];
  for (const x of [-0.12, 0.12]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.62, 0);
    const lm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.17), m(0x3a3530)); lm.position.y = -0.31;
    leg.add(lm); g.add(leg); legs.push(leg);
  }
  const arms = [];
  for (const x of [-0.32, 0.32]) {
    const arm = new THREE.Group(); arm.position.set(x, 1.42, 0);
    const am = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.13), m(color)); am.position.y = -0.3;
    arm.add(am); g.add(arm); arms.push(arm);
  }
  g.scale.setScalar(s);
  g.userData = { legs, arms };
  return g;
}

export class NPC {
  constructor(id, def, x, z) {
    this.id = id; this.def = def;
    this.pos = new THREE.Vector3(x, 0, z);
    this.group = makePerson(def.color, def.hair, def.small);
    this.group.position.copy(this.pos);
    this.label = makeLabel(def.name, def.title);
    this.label.position.y = 2.6;
    this.group.add(this.label);
    this.marker = makeMarker(); this.marker.position.y = 3.4;
    this.group.add(this.marker);
    this.t = Math.random() * 10;
  }
  update(dt) {
    this.t += dt;
    const P = G.player;
    const d = this.pos.distanceTo(P.pos);
    this.label.visible = d < 40;
    if (d < 12) {
      const yaw = Math.atan2(-(P.pos.x - this.pos.x), -(P.pos.z - this.pos.z));
      this.group.rotation.y += (yaw - this.group.rotation.y) * Math.min(1, dt * 3);
    }
    const ud = this.group.userData;
    ud.arms[0].rotation.x = Math.sin(this.t * 1.3) * 0.08;
    this.marker.position.y = 3.4 + Math.sin(this.t * 3) * 0.12;
    drawMarker(this.marker, G.quests.markerFor(this.id));
  }
}

export class Folk {
  constructor(section, x, z, axis, a, b, rng) {
    this.section = section;
    const cols = [0x7a5a3a, 0x5a6a7a, 0x8a7a5a, 0x6a4a5a, 0x4a6a4a, 0x9a8a6a, 0x5a4a3a];
    this.group = makePerson(cols[Math.floor(rng() * cols.length)], [0x2a1a10, 0x5a3a20, 0x8a6a40, 0xb0b0b0][Math.floor(rng() * 4)], rng() < 0.15);
    this.axis = axis; this.a = a; this.b = b; this.line = axis === 'x' ? z : x;
    this.p = a + rng() * (b - a); this.dir = rng() < 0.5 ? 1 : -1;
    this.speed = 1.1 + rng() * 0.8; this.t = rng() * 10;
    this.side = (rng() < 0.5 ? -1 : 1) * (3 + rng() * 2);
    this.idle = 0;
    this.lineText = FOLK_LINES[section][Math.floor(rng() * FOLK_LINES[section].length)];
    this.place();
  }
  get pos() { return this.group.position; }
  place() {
    if (this.axis === 'x') this.group.position.set(this.p, 0, this.line + this.side);
    else this.group.position.set(this.line + this.side, 0, this.p);
    this.group.rotation.y = this.axis === 'x' ? (this.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (this.dir > 0 ? Math.PI : 0);
  }
  update(dt) {
    this.t += dt;
    const ud = this.group.userData;
    if (this.idle > 0) { this.idle -= dt; ud.legs[0].rotation.x = ud.legs[1].rotation.x = 0; return; }
    this.p += this.dir * this.speed * dt;
    if (this.p > this.b || this.p < this.a) { this.dir *= -1; this.p = Math.max(this.a, Math.min(this.b, this.p)); this.idle = 1 + Math.random() * 3; }
    this.place();
    const s = Math.sin(this.t * this.speed * 5) * 0.5;
    ud.legs[0].rotation.x = s; ud.legs[1].rotation.x = -s;
    ud.arms[0].rotation.x = -s * 0.6; ud.arms[1].rotation.x = s * 0.6;
  }
}
