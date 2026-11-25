import * as THREE from 'three';
import { G } from './state.js';
import { Input } from './input.js';
import { World, SECTIONS, WALL_H, WALL_T } from './world.js';
import { Player } from './player.js';
import { Hollow, Spawner } from './hollows.js';
import { NPC, NPC_DEFS, Folk } from './npcs.js';
import { Quests, Rings, Insignias } from './quests.js';
import { DIALOGUE, folkDialogue } from './dialogue.js';
import { UI, controlsList } from './ui.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { CORPS, newSave, xpForLevel, TIPS } from './data.js';
import { A, loadAssets } from './assets.js';
import { U } from './materials.js';
import { Post } from './post.js';
import { ViewModel } from './viewmodel.js';
import { Gore } from './gore.js';
import { Touch, isTouch } from './touch.js';

const SAVE_KEY = 'tetherfall_save_v1';
const DEFAULT_SETTINGS = { sens: 1, padSens: 1, fov: 80, vol: 0.7, scale: 1, invert: false, quality: 'high', gore: 'high' };
const $ = (s) => document.querySelector(s);

// ------------------------------------------------------------------ renderer
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 7000);
const hemi = new THREE.HemisphereLight(0xcfdcff, 0x6b5a45, 0.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b8, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera; sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 10; sc.far = 900;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
scene.add(sun); scene.add(sun.target);
const SUN_DIR = new THREE.Vector3(-0.45, 0.75, 0.4).normalize();

// HDR gradient sky with a sun disk that blooms, plus a drifting cloud layer
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: SUN_DIR }, sunCol: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top, hor, sunCol, sunDir; varying vec3 vP;
    void main(){
      vec3 d = normalize(vP);
      float h = max(d.y, 0.0);
      vec3 c = mix(hor, top, pow(h, 0.45));
      float s = max(0.0, dot(d, normalize(sunDir)));
      c += sunCol * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6);
      c += sunCol * smoothstep(0.9993, 0.9997, s) * 30.0;
      c = mix(c, hor * 0.9, smoothstep(0.0, -0.2, d.y));
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), skyMat);
scene.add(sky);
const cloudMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false, side: THREE.BackSide,
  uniforms: { uT: U.time, uSun: { value: SUN_DIR }, uTint: { value: new THREE.Color(1, 0.92, 0.84) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uT; uniform vec3 uSun; uniform vec3 uTint; varying vec3 vP;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
    void main(){
      vec3 d = normalize(vP); if (d.y < 0.0) discard;
      vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(uT * 0.004, uT * 0.002);
      float c = smoothstep(0.53, 0.8, fbm(uv));
      float lit = 0.75 + 0.35 * max(0.0, dot(d, uSun));
      float fade = smoothstep(0.0, 0.25, d.y);
      gl_FragColor = vec4(uTint * lit * mix(0.8, 1.15, fbm(uv * 2.0 + 3.0)), c * fade * 0.85);
    }`,
});
const clouds = new THREE.Mesh(new THREE.SphereGeometry(4800, 32, 16), cloudMat);
scene.add(clouds);
const pmrem = new THREE.PMREMGenerator(renderer);
const envCache = {};

Object.assign(G, {
  scene, camera, renderer, input: Input, audio: Audio,
  fx: new FX(scene), ui: new UI(), quests: new Quests(), rings: new Rings(scene), insig: new Insignias(scene),
  folk: [], spawners: [], alarm: false, hitstopT: 0, autosave: 0,
});
G.vm = new ViewModel();
G.vm.resize(innerWidth / innerHeight);
G.post = new Post(renderer, scene, camera, G.vm);

// ------------------------------------------------------------------ save
function readSave() {
  try { const t = localStorage.getItem(SAVE_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
}
G.saveGame = () => {
  if (!G.save || !G.player) return;
  G.save.pos = [G.player.pos.x, G.player.pos.y, G.player.pos.z];
  G.save.section = G.world ? G.world.id : G.save.section;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* storage unavailable: play continues unsaved */ }
};

// ------------------------------------------------------------------ progression helpers
G.addXP = (n) => {
  const s = G.save;
  s.xp += Math.round(n);
  let up = false;
  while (s.xp >= xpForLevel(s.level)) { s.xp -= xpForLevel(s.level); s.level++; up = true; }
  if (up) {
    G.player.refreshStats(); G.player.hp = G.player.st.maxHp;
    G.ui.questBanner('Level up', `Level ${s.level}  ·  more health, sharper cuts`);
    G.audio.play('level');
  }
};
G.addMarks = (n) => { G.save.marks += Math.round(n); if (n > 0) G.audio.play('coin'); };
G.hitstop = (d) => { G.hitstopT = Math.max(G.hitstopT, d); };
G.addHollow = (h) => { G.hollows.push(h); scene.add(h.group); };

G.onKill = (h, dmg) => {
  const P = G.player;
  if (h.type === 'dummy') {
    const spot = [h.pos.x, h.pos.z], wid = G.world.id;
    setTimeout(() => { if (G.world && G.world.id === wid) G.addHollow(new Hollow('dummy', spot[0], spot[1])); }, 4000);
  } else G.save.kills++;
  const aerial = P.vel.length() > 30;
  const xp = Math.round(h.T.xp * (aerial ? 1.25 : 1));
  G.addXP(xp);
  if (h.T.marks) G.addMarks(h.T.marks);
  const head = h.T.boss ? `${h.T.name.toUpperCase()} FELLED` : h.type === 'dummy' ? 'CLEAN CUT' : 'SEAM SEVERED';
  G.ui.kill(head, `+${xp} XP${h.T.marks ? `  ·  +${h.T.marks} marks` : ''}${aerial ? '  ·  aerial bonus' : ''}  ·  ${Math.round(dmg)} dmg`);
  G.quests.event({ type: 'kill', kind: h.type });
};

G.onPlayerDeath = () => {
  setTimeout(() => {
    G.state = 'dead'; Input.unlock();
    const lost = Math.floor(G.save.marks * 0.1);
    G.save.marks -= lost;
    $('#deadTxt').textContent = `Your rig is recovered from the rubble. The depot charges ${lost} marks for repairs.`;
    G.ui.show('#dead');
  }, 1200);
};
function respawn() {
  const W = G.world, P = G.player;
  let best = W.depots[0], bd = Infinity;
  for (const d of W.depots) { const dd = Math.hypot(d.x - P.pos.x, d.z - P.pos.z); if (dd < bd) { bd = dd; best = d; } }
  P.teleport(best.x, 0.9, best.z + 8);
  P.refreshStats(true);
  for (let i = G.hollows.length - 1; i >= 0; i--) {
    const h = G.hollows[i];
    if (!h.T.static && !h.T.boss && h.pos.distanceTo(P.pos) < 90) { scene.remove(h.group); h.dispose(); G.hollows.splice(i, 1); }
  }
  G.setupSpawners();
  G.ui.show('#dead', false);
  G.resume();
  G.saveGame();
}

G.resupply = () => {
  G.player.resupply();
  G.audio.play('reload');
  G.ui.toast('Gas, blades and bandages restocked');
};

G.setAlarm = (on) => {
  const was = G.alarm;
  G.alarm = on;
  for (const f of G.folk) f.group.visible = !on;
  if (on && !was) { G.audio.play('bell'); G.ui.notice('The breach bell is ringing. Hollows are inside Lowmarch!', 3500); }
};
G.sealBreach = () => {
  G.save.flags.breachSealed = true;
  const W = G.world;
  if (!W || W.id !== 'lowmarch') return;
  const bx = W.poi.breach.x, z1 = W.bounds.z1;
  const b = { x0: bx - 22, y0: 0, z0: z1 - WALL_T + 2, x1: bx + 22, y1: WALL_H, z1: z1 - 2 };
  W.addDynamicBox(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1, b.z1 - b.z0), new THREE.MeshStandardMaterial({ color: 0x9a9080, map: A.tex.stone, roughness: 0.9 }));
  m.position.set((b.x0 + b.x1) / 2, b.y1 / 2, (b.z0 + b.z1) / 2); m.castShadow = m.receiveShadow = true;
  W.group.add(m);
};

G.setupSpawners = () => {
  const W = G.world, Q = G.quests;
  G.spawners = [];
  if (W.id === 'wilds') {
    G.spawners.push(new Spawner({ max: 10, types: { drudge: 0.55, sprinter: 0.28, brute: 0.17 }, minDist: 150, maxDist: 380, interval: 3.5, wallMargin: 130 }));
    if (Q.step('q_greyhorn') === 3 && !G.hollows.some((h) => h.type === 'thornback' && !h.dead)) {
      const boss = new Hollow('thornback', W.poi.lair.x, W.poi.lair.z);
      G.addHollow(boss);
    }
  }
  if (W.id === 'lowmarch' && Q.isActive('q_breach')) {
    const st = Q.step('q_breach');
    const o = W.poi.breachOutside, wp = W.poi.breach;
    if (st === 0) {
      G.spawners.push(new Spawner({ max: 4, types: { drudge: 0.75, sprinter: 0.25 }, interval: 6, origin: o, waypoint: { x: wp.x, z: wp.z - 40 } }));
      if (!G.hollows.some((h) => !h.dead && !h.T.static)) {
        for (let i = 0; i < 3; i++) G.addHollow(Object.assign(new Hollow(i === 2 ? 'sprinter' : 'drudge', wp.x - 30 + i * 25, wp.z - 70 - i * 15), { aggro: false }));
      }
    }
    if (st === 2) G.spawners.push(new Spawner({ max: 6, types: { drudge: 0.6, sprinter: 0.3, brute: 0.1 }, interval: 3.5, origin: o, waypoint: { x: wp.x, z: wp.z - 20 }, aggro: true }));
  }
  if (W.id === 'solspire' && Q.step('q_lantern') === 1) {
    const left = 4 - G.save.quests.q_lantern.prog;
    const alive = G.hollows.filter((h) => !h.dead && !h.T.static).length;
    for (let i = alive; i < left; i++) {
      const h = new Hollow(i === left - 1 ? 'brute' : (i % 2 ? 'sprinter' : 'drudge'), -150 + i * 30, 170 + (i % 2) * 30);
      h.aggro = true; h.state = 'chase';
      G.addHollow(h);
    }
    G.fx.dust(new THREE.Vector3(-140, 0, 180), 20, 40);
  }
};

// ------------------------------------------------------------------ sections
function clearSection() {
  if (G.world) { scene.remove(G.world.group); G.world.dispose(); }
  for (const h of G.hollows) { scene.remove(h.group); h.dispose(); }
  G.hollows = [];
  for (const n of G.npcs) scene.remove(n.group);
  G.npcs = [];
  for (const f of G.folk) scene.remove(f.group);
  G.folk = [];
  G.spawners = [];
  G.rings.stop();
  G.fx.clear();
  G.alarm = false;
}

function applyAtmosphere(W) {
  const d = W.def;
  scene.fog = new THREE.Fog(d.fog, d.fogNear, d.fogFar);
  renderer.setClearColor(d.fog);
  SUN_DIR.set(...d.sun).normalize();
  sun.color.setHex(d.sunCol);
  skyMat.uniforms.top.value.setHex(d.skyTop).multiplyScalar(0.55);
  skyMat.uniforms.hor.value.setHex(d.skyBot).multiplyScalar(1.05);
  skyMat.uniforms.sunCol.value.setHex(d.sunCol);
  if (!envCache[d.env]) envCache[d.env] = pmrem.fromEquirectangular(A.env[d.env]).texture;
  scene.environment = envCache[d.env];
  G.vm.scene.environment = envCache[d.env];
  G.vm.sun.color.setHex(d.sunCol);
}

function buildSection(id) {
  clearSection();
  if (G.gore) G.gore.reset();
  const W = new World(id, { breachSealed: !!(G.save && G.save.flags.breachSealed) });
  G.world = W;
  scene.add(W.group);
  applyAtmosphere(W);
  return W;
}

function populate(W) {
  for (const [nid, def] of Object.entries(NPC_DEFS)) {
    if (def.section !== W.id) continue;
    const spot = W.npcSpots[nid];
    if (!spot) continue;
    const n = new NPC(nid, def, spot[0], spot[1]);
    G.npcs.push(n); scene.add(n.group);
  }
  const count = { lowmarch: 30, ironvale: 36, solspire: 30 }[W.id] || 0;
  const B = W.bounds;
  for (let i = 0; i < count; i++) {
    const useX = Math.random() < 0.5 && W.streetsX.length;
    const lines = useX ? W.streetsX : W.streetsZ;
    if (!lines.length) break;
    // cluster residents around the busy middle of each district
    const line = lines[Math.floor(lines.length * (0.3 + Math.random() * 0.4))];
    const lo = useX ? B.z0 + 30 : B.x0 + 30, hi = useX ? B.z1 - 30 : B.x1 - 30;
    const c = (lo + hi) / 2 + (Math.random() - 0.5) * (hi - lo) * 0.5;
    const a = Math.max(lo, c - 40), b = Math.min(hi, c + 40);
    const f = useX ? new Folk(W.id, line, 0, 'z', a, b, Math.random) : new Folk(W.id, 0, line, 'x', a, b, Math.random);
    G.folk.push(f); scene.add(f.group);
  }
  for (const [x, z] of W.poi.dummies || []) G.addHollow(new Hollow('dummy', x, z));
}

function gateLock(from, to) {
  const Q = G.quests;
  if (from === 'lowmarch' && to === 'ironvale' && !Q.isDone('q_breach') && !Q.isActive('q_word')) return Q.isActive('q_breach') ? 'The Watch has barred the North Gate until the breach is dealt with.' : 'The gatekeeper wants to see your Warden papers. Finish your training with Maren first.';
  if (from === 'lowmarch' && to === 'wilds' && !Q.S.q_greyhorn) return 'The South Gate only opens for Wardens with orders from High Command.';
  if (from === 'ironvale' && to === 'solspire' && !Q.isDone('q_greyhorn')) return 'The Crown Lancers turn you away. Solspire does not admit Wardens without a summons.';
  return null;
}

G.loadSection = (id, fromId = null, savedPos = null) => {
  G.state = 'loading';
  $('#loadName').textContent = SECTIONS[id].name;
  $('#loadTip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  G.ui.show('#loading');
  G.ui.show('#hud', false);
  setTimeout(() => {
    const W = buildSection(id);
    populate(W);
    const P = G.player;
    if (fromId) {
      const g = W.gates.find((gt) => gt.dest === fromId);
      P.teleport(g.x, 0.9, g.z + g.inward * 18);
      P.yaw = g.inward > 0 ? Math.PI : 0; P.pitch = -0.05;
    } else if (savedPos) {
      const B = W.bounds;
      P.teleport(THREE.MathUtils.clamp(savedPos[0], B.x0 + 20, B.x1 - 20), Math.max(0.9, savedPos[1]), THREE.MathUtils.clamp(savedPos[2], B.z0 + 20, B.z1 - 20));
    } else P.teleport(W.respawn.x, 0.9, W.respawn.z);
    G.save.section = id;
    G.insig.setup(W);
    G.quests.setupSection();
    G.setupSpawners();
    G.quests.update(0);
    G.ui.section(W);
    G.ui.show('#loading', false);
    G.ui.show('#hud');
    G.state = 'play';
    G.ui.notice(Input.device === 'pad' ? 'Controller ready' : Input.device === 'touch' ? 'Left side: move · Right side: look' : 'Click to take control', 2200);
    G.saveGame();
  }, 60);
};

// ------------------------------------------------------------------ interaction
function findInteract() {
  const P = G.player, W = G.world;
  let best = null, bd = Infinity;
  const consider = (d, label, fn) => { if (d < bd) { bd = d; best = { label, fn }; } };
  for (const n of G.npcs) { const d = n.pos.distanceTo(P.pos); if (d < 4.5) consider(d, `Talk to ${n.def.name}`, () => openTalk(n.id)); }
  for (const f of G.folk) { if (!f.group.visible) continue; const d = f.pos.distanceTo(P.pos); if (d < 3.2) consider(d + 1, 'Chat with resident', () => openFolk(f)); }
  for (const dp of W.depots) {
    const d = Math.hypot(dp.x - P.pos.x, dp.z - P.pos.z);
    if (d < 9 && P.pos.y < 7) consider(d, `Resupply at ${dp.label}`, () => G.resupply());
  }
  for (const g of W.gates) {
    const dz = (P.pos.z - g.z) * g.inward;
    if (Math.abs(P.pos.x - g.x) < 13 && dz > -1 && dz < 16 && P.pos.y < 20) consider(dz, `Pass through to ${g.label}`, () => travel(g));
  }
  return best;
}
function travel(g) {
  const lock = gateLock(G.world.id, g.dest);
  if (lock) { G.ui.notice(lock, 3200); return; }
  G.audio.play('gate');
  G.saveGame();
  G.loadSection(g.dest, G.world.id);
}
function openTalk(id) {
  G.state = 'dialog'; Input.unlock();
  G.ui.openDialog(DIALOGUE[id](), id);
}
function openFolk(f) {
  G.state = 'dialog'; Input.unlock();
  G.ui.openDialog(folkDialogue(f), null);
}

G.resume = () => {
  if (G.state === 'title' || G.state === 'loading') return;
  if (G.player && G.player.dead) return;
  G.state = 'play';
  Input.lock();
};

G.applySettings = () => {
  const s = G.save.settings;
  Audio.setVolume(s.vol);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * s.scale);
  renderer.setSize(innerWidth, innerHeight);
  const shadows = s.quality !== 'low';
  renderer.shadowMap.enabled = shadows; sun.castShadow = shadows;
  const ms = s.quality === 'high' ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (G.post.q !== s.quality) G.post.build(s.quality);
  G.post.setSize(innerWidth, innerHeight);
};

// ------------------------------------------------------------------ menus
function openPause(tab) {
  G.state = 'menu'; Input.unlock();
  G.pauseAt = performance.now();
  G.ui.openPause(tab);
}
function closePause() { G.ui.show('#pause', false); G.resume(); }

Input.init(canvas);
Input.onDevice = () => G.ui.deviceChanged();
G.touch = new Touch();
if (isTouch() && !navigator.getGamepads?.()?.some((p) => p)) {
  Input.setDevice('touch');
  // lighter graphics from the very first frame on tablets and phones
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * 0.7);
  renderer.setSize(innerWidth, innerHeight);
  G.post.build('medium');
  G.post.setSize(innerWidth, innerHeight);
}
Input.onLockChange = (locked) => {
  // only a lock loss we did not cause ourselves (the player pressed Esc) pauses the game
  if (!locked && G.state === 'play' && Input.device !== 'pad' && !Input.lastUnlockWasOurs) openPause('quests');
};
Input.onKey = (e) => {
  const st = G.state;
  if (st === 'dialog') {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) G.ui.choose(n - 1);
    return;
  }
  if (st === 'play' && e.code === 'Escape' && Input.free) openPause('quests');
};

// gamepad / keyboard navigation for every menu and the actions that open them
function menuInput() {
  const st = G.state;
  if (st === 'play') {
    if (Input.hit('journal')) openPause('quests');
    else if (Input.hit('map')) openPause('map');
    return;
  }
  if (st === 'loading') return;
  const nav = G.ui.navigate();
  if (!nav) return;
  if (nav === 'back') {
    if (st === 'dialog') G.ui.closeDialog();
    else if (st === 'shop') G.ui.closeShop();
    else if (st === 'menu' && $('#chapter').classList.contains('hidden') && performance.now() - (G.pauseAt || 0) > 350) closePause();
    else if (st === 'create') { G.ui.show('#create', false); G.ui.show('#title'); G.state = 'title'; }
  }
  if (nav === 'journal' && st === 'menu' && $('#chapter').classList.contains('hidden') && performance.now() - (G.pauseAt || 0) > 350) closePause();
}

canvas.addEventListener('click', () => {
  Audio.init();
  if (G.state === 'play' && !Input.locked) { Input.setDevice('kbm'); Input.lock(); }
});

$('#bResume').onclick = closePause;
$('#bSave').onclick = () => { G.saveGame(); G.ui.toast('Game saved'); G.ui.notice('Game saved', 1200); };
$('#bQuit').onclick = () => { G.saveGame(); location.reload(); };
$('#bShopClose').onclick = () => G.ui.closeShop();
$('#bRespawn').onclick = respawn;
$('#bChapter').onclick = () => { G.ui.show('#chapter', false); G.resume(); };

function startGame(save) {
  G.save = save;
  // tablets and phones start on lighter graphics; the auto-adjuster can lower it further
  const base = isTouch() ? { ...DEFAULT_SETTINGS, quality: 'medium', scale: 0.7 } : DEFAULT_SETTINGS;
  save.settings = { ...base, ...(save.settings || {}) };
  delete save.settings.shadows;
  save.best = save.best || {}; save.flags = save.flags || {}; save.found = save.found || [];
  Audio.init();
  G.applySettings();
  if (!G.player) G.player = new Player(scene, camera);
  G.player.setCoat(save.coat);
  G.player.refreshStats(true);
  G.ui.show('#title', false); G.ui.show('#create', false);
  G.loadSection(save.section || 'lowmarch', null, save.pos);
}

const existing = readSave();
if (!existing) $('#bContinue').classList.add('hidden');
$('#bContinue').onclick = () => startGame(existing);
$('#bNew').onclick = () => {
  if (existing && !G.confirmNew) {
    G.confirmNew = true;
    $('#bNew').textContent = 'Overwrite your saved Warden?';
    return;
  }
  G.ui.show('#title', false); G.ui.show('#create');
  G.state = 'create';
  G.ui.setupCreate((name, origin, coat) => {
    const s = newSave(name, origin, coat);
    s.pos = G.world.newGame || [-185, 0.9, -530];
    startGame(s);
    setTimeout(() => G.ui.toast(`Find Instructor Maren Holt in the training yard. Walk up and press ${Input.glyph('interact')}.`), 1500);
  });
};
$('#bBack').onclick = () => { G.ui.show('#create', false); G.ui.show('#title'); G.state = 'title'; };
$('#bControls').onclick = () => {
  const ov = document.createElement('div'); ov.className = 'screen'; ov.style.zIndex = 30; ov.id = 'controlsOverlay';
  const p = document.createElement('div'); p.className = 'panel stack';
  const h = document.createElement('h2'); h.textContent = 'Controls';
  const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = 'Close';
  b.onclick = () => { ov.remove(); $('#bControls').focus(); };
  p.append(h, controlsList(), b); ov.append(p); document.body.append(ov);
  b.focus();
};

// ------------------------------------------------------------------ boot: load assets, then show the title over Lowmarch
let titleT = 0;
const titleBtns = ['#bContinue', '#bNew', '#bControls'];
titleBtns.forEach((b) => { $(b).disabled = true; });
loadAssets(renderer, (p) => { $('#loadBar').style.width = Math.round(p * 100) + '%'; })
  .then(() => {
    G.gore = new Gore(scene);
    buildSection('lowmarch');
    titleBtns.forEach((b) => { $(b).disabled = false; });
    $('#loadWrap').classList.add('hidden');
    requestAnimationFrame(frame);
  })
  .catch((e) => { $('#loadMsg').textContent = 'Could not load game assets: ' + e.message; });

// drop graphics quality automatically if the device can't keep up
let fpsAcc = 0, fpsN = 0, fpsT = 0, slowFor = 0;
function autoQuality(now) {
  if (G.state !== 'play' || !G.save) { fpsT = now; return; }
  fpsN++;
  if (now - fpsT < 1000) return;
  const fps = (fpsN * 1000) / (now - fpsT);
  fpsT = now; fpsN = 0;
  const s = G.save.settings;
  slowFor = fps < 24 ? slowFor + 1 : 0;
  if (slowFor >= 4) {
    slowFor = 0;
    if (s.quality === 'high') s.quality = 'medium';
    else if (s.quality === 'medium') s.quality = 'low';
    else if (s.scale > 0.55) s.scale = Math.round((s.scale - 0.15) * 100) / 100;
    else return;
    G.applySettings();
    G.ui.toast(`Graphics lowered to keep it smooth (${s.quality}, ${Math.round(s.scale * 100)}% resolution). Change it in Settings.`);
  }
}

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  Input.poll(dt);
  G.touch.update();
  autoQuality(now);
  if (G.hitstopT > 0) { G.hitstopT -= dt; dt *= 0.12; }
  G.time += dt;
  U.time.value = G.time;
  const W = G.world;
  menuInput();
  if (G.state === 'title' || G.state === 'create' || !G.player) {
    titleT += dt * 0.035;
    camera.position.set(Math.cos(titleT) * 260, 95 + Math.sin(titleT * 2) * 12, Math.sin(titleT) * 260);
    camera.rotation.set(0, 0, 0);
    camera.lookAt(0, 40, 0);
  } else if (G.state === 'play') {
    G.player.update(dt);
    for (const h of G.hollows) h.update(dt);
    for (let i = G.hollows.length - 1; i >= 0; i--) {
      const h = G.hollows[i];
      if (h.remove) { scene.remove(h.group); h.dispose(); G.hollows.splice(i, 1); }
    }
    for (const s of G.spawners) s.update(dt);
    for (const n of G.npcs) n.update(dt);
    const pp = G.player.pos;
    for (const f of G.folk) {
      const near = Math.abs(f.pos.x - pp.x) < 140 && Math.abs(f.pos.z - pp.z) < 140;
      if (near && !G.alarm) { f.group.visible = true; f.update(dt); } else f.group.visible = false;
    }
    G.quests.update(dt);
    G.rings.update(dt);
    G.insig.update(dt);
    const it = findInteract();
    G.ui.prompt(it ? it.label : null);
    if (it && Input.hit('interact') && !G.player.grabbedBy) it.fn();
    G.autosave += dt;
    if (G.autosave > 30) { G.autosave = 0; G.saveGame(); }
    if (G.alarm && Math.random() < dt / 9) G.audio.play('bell');
  } else if (G.state === 'dead') {
    for (const h of G.hollows) h.update(dt);
  }
  if (G.player && !['title', 'create'].includes(G.state)) G.ui.update(dt);
  if (W) {
    for (const a of W.animated) a.rotation.z += dt * a.userData.spin;
    if (W.lanternCore) W.lanternCore.scale.setScalar(1 + Math.sin(G.time * 2.2) * 0.05);
  }
  G.fx.update(dt);
  if (G.gore) G.gore.update(dt);
  // shadow camera follows the view, snapped to texels to avoid shimmering
  const focus = G.player && G.state !== 'title' ? G.player.pos : new THREE.Vector3(0, 0, 0);
  const snap = (300 / sun.shadow.mapSize.x);
  const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
  sun.position.set(fx, focus.y, fz).addScaledVector(SUN_DIR, 400);
  sun.target.position.set(fx, focus.y, fz);
  sky.position.copy(camera.position);
  clouds.position.copy(camera.position);
  G.vm.root.visible = G.player && G.state !== 'title' && G.state !== 'create' && !G.player.dead;
  G.post.update(dt, G.player && G.state === 'play' ? G.player.vel.length() : 0);
  G.post.render();
  Input.endFrame();
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  G.vm.resize(innerWidth / innerHeight);
  G.post.setSize(innerWidth, innerHeight);
});

// expose for debugging in the console
window.TETHERFALL = G;
G.debugSpawn = (type, x, z) => { const h = new Hollow(type, x, z); G.addHollow(h); return h; };
