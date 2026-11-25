import * as THREE from 'three';
import { G } from './state.js';
import { Input } from './input.js';
import { World, SECTIONS, WALL_H } from './world.js';
import { Player } from './player.js';
import { Hollow, Spawner } from './hollows.js';
import { NPC, NPC_DEFS, Folk } from './npcs.js';
import { Quests, Rings, Insignias } from './quests.js';
import { DIALOGUE, folkDialogue } from './dialogue.js';
import { UI, controlsList } from './ui.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { CORPS, newSave, xpForLevel, TIPS } from './data.js';

const SAVE_KEY = 'tetherfall_save_v1';
const DEFAULT_SETTINGS = { sens: 1, fov: 75, vol: 0.7, scale: 1, invert: false, shadows: true };
const $ = (s) => document.querySelector(s);

// ------------------------------------------------------------------ renderer
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 6000);
const hemi = new THREE.HemisphereLight(0xcfdcff, 0x6b5a45, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b8, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 600;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
scene.add(sun); scene.add(sun.target);
const SUN_DIR = new THREE.Vector3(-0.45, 0.75, 0.4).normalize();

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: SUN_DIR } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; varying vec3 vP;
    void main(){ float h = clamp(vP.y * 1.6 + 0.12, 0.0, 1.0); vec3 c = mix(bot, top, pow(h, 0.8));
    float s = max(0.0, dot(normalize(vP), sunDir)); c += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.25);
    gl_FragColor = vec4(c, 1.0); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 24, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);

Object.assign(G, {
  scene, camera, renderer, input: Input, audio: Audio,
  fx: new FX(scene), ui: new UI(), quests: new Quests(), rings: new Rings(scene), insig: new Insignias(scene),
  folk: [], spawners: [], alarm: false, hitstopT: 0, autosave: 0,
});

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
  const b = { x0: 198, y0: 0, z0: 440, x1: 242, y1: WALL_H, z1: 448 };
  W.addDynamicBox(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1, b.z1 - b.z0), new THREE.MeshLambertMaterial({ color: 0x7c7366 }));
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
        for (let i = 0; i < 3; i++) G.addHollow(Object.assign(new Hollow(i === 2 ? 'sprinter' : 'drudge', 190 + i * 25, 370 - i * 15), { aggro: false }));
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
  skyMat.uniforms.top.value.setHex(d.skyTop);
  skyMat.uniforms.bot.value.setHex(d.skyBot);
  renderer.setClearColor(d.fog);
}

function buildSection(id) {
  clearSection();
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
  const count = { lowmarch: 34, ironvale: 46, solspire: 34 }[W.id] || 0;
  const B = W.bounds;
  for (let i = 0; i < count; i++) {
    const useX = Math.random() < 0.5 && W.streetsX.length;
    const lines = useX ? W.streetsX : W.streetsZ;
    if (!lines.length) break;
    const line = lines[Math.floor(Math.random() * lines.length)];
    const lo = useX ? B.z0 + 30 : B.x0 + 30, hi = useX ? B.z1 - 30 : B.x1 - 30;
    const c = lo + Math.random() * (hi - lo);
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
  Input.unlock();
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
      P.teleport(savedPos[0], Math.max(0.9, savedPos[1]), savedPos[2]);
    } else P.teleport(W.respawn.x, 0.9, W.respawn.z);
    P.modelYaw = P.yaw;
    G.save.section = id;
    G.insig.setup(W);
    G.quests.setupSection();
    G.setupSpawners();
    G.quests.update(0);
    G.ui.section(W);
    G.ui.show('#loading', false);
    G.ui.show('#hud');
    G.state = 'play';
    G.ui.notice('Click to take control', 1600);
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
  renderer.shadowMap.enabled = s.shadows; sun.castShadow = s.shadows;
};

// ------------------------------------------------------------------ menus
function openPause(tab) {
  G.state = 'menu'; Input.unlock();
  G.pauseAt = performance.now();
  G.ui.openPause(tab);
}
function closePause() { G.ui.show('#pause', false); G.resume(); }

Input.init(canvas);
Input.onLockChange = (locked) => {
  if (!locked && G.state === 'play') openPause('quests');
};
Input.onKey = (e) => {
  const st = G.state;
  if (st === 'dialog') {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) G.ui.choose(n - 1);
    if (e.code === 'Escape') G.ui.closeDialog();
    return;
  }
  if (st === 'play') {
    if (e.code === 'Tab' || e.code === 'KeyJ') openPause('quests');
    if (e.code === 'KeyM') openPause('map');
    if (e.code === 'Escape' && Input.free) openPause('quests');
    return;
  }
  if (st === 'menu' && $('#chapter').classList.contains('hidden')) {
    if ((e.code === 'Escape' || e.code === 'Tab') && performance.now() - (G.pauseAt || 0) > 350) closePause();
    return;
  }
  if (st === 'shop' && e.code === 'Escape') G.ui.closeShop();
};
canvas.addEventListener('click', () => {
  Audio.init();
  if (G.state === 'play' && !Input.locked) Input.lock();
});

$('#bResume').onclick = closePause;
$('#bSave').onclick = () => { G.saveGame(); G.ui.toast('Game saved'); G.ui.notice('Game saved', 1200); };
$('#bQuit').onclick = () => { G.saveGame(); location.reload(); };
$('#bShopClose').onclick = () => G.ui.closeShop();
$('#bRespawn').onclick = respawn;
$('#bChapter').onclick = () => { G.ui.show('#chapter', false); G.resume(); };

function startGame(save) {
  G.save = save;
  save.settings = { ...DEFAULT_SETTINGS, ...(save.settings || {}) };
  save.best = save.best || {}; save.flags = save.flags || {}; save.found = save.found || [];
  Audio.init();
  G.applySettings();
  if (!G.player) G.player = new Player(scene, camera);
  G.player.setCoat(save.coat);
  if (save.corps) G.player.setCape(CORPS[save.corps].color);
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
  G.ui.setupCreate((name, origin, coat) => {
    const s = newSave(name, origin, coat);
    s.pos = [-185, 0.9, -330];
    startGame(s);
    setTimeout(() => G.ui.toast('Find Instructor Maren Holt in the training yard. Walk up and press F.'), 1500);
  });
};
$('#bBack').onclick = () => { G.ui.show('#create', false); G.ui.show('#title'); };
$('#bControls').onclick = () => {
  const ov = document.createElement('div'); ov.className = 'screen'; ov.style.zIndex = 30;
  const p = document.createElement('div'); p.className = 'panel stack';
  const h = document.createElement('h2'); h.textContent = 'Controls';
  const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = 'Close';
  b.onclick = () => ov.remove();
  p.append(h, controlsList(), b); ov.append(p); document.body.append(ov);
};

// ------------------------------------------------------------------ title backdrop
let titleT = 0;
buildSection('lowmarch');

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.hitstopT > 0) { G.hitstopT -= dt; dt *= 0.12; }
  G.time += dt;
  const W = G.world;
  if (G.state === 'title' || !G.player) {
    titleT += dt * 0.04;
    camera.position.set(Math.cos(titleT) * 150, 60 + Math.sin(titleT * 2) * 8, Math.sin(titleT) * 150);
    camera.lookAt(0, 30, 0);
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
      const near = Math.abs(f.pos.x - pp.x) < 160 && Math.abs(f.pos.z - pp.z) < 160;
      if (near && !G.alarm) { f.group.visible = true; f.update(dt); } else f.group.visible = false;
    }
    G.quests.update(dt);
    G.rings.update(dt);
    G.insig.update(dt);
    const it = findInteract();
    G.ui.prompt(it ? it.label : null);
    if (it && Input.hit('KeyF') && !G.player.grabbedBy) it.fn();
    G.autosave += dt;
    if (G.autosave > 30) { G.autosave = 0; G.saveGame(); }
    if (G.alarm && Math.random() < dt / 9) G.audio.play('bell');
  } else if (G.state === 'dead') {
    for (const h of G.hollows) h.update(dt);
  }
  if (G.player && G.state !== 'title') G.ui.update(dt);
  if (W) {
    for (const a of W.animated) a.rotation.z += dt * a.userData.spin;
    if (W.lanternCore) W.lanternCore.scale.setScalar(1 + Math.sin(G.time * 2.2) * 0.05);
  }
  G.fx.update(dt);
  const focus = G.player && G.state !== 'title' ? G.player.pos : new THREE.Vector3(0, 0, 0);
  sun.position.copy(focus).addScaledVector(SUN_DIR, 300);
  sun.target.position.copy(focus);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  Input.endFrame();
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// expose for debugging in the console
window.TETHERFALL = G;
G.debugSpawn = (type, x, z) => { const h = new Hollow(type, x, z); G.addHollow(h); return h; };
