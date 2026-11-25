import * as THREE from 'three';
import { G } from './state.js';
import { UPGRADES, CORPS, ORIGINS, COAT_COLORS, xpForLevel, stats } from './data.js';
import { QUESTS } from './quests.js';
import { NPC_DEFS } from './npcs.js';
import { SECTIONS } from './world.js';

const $ = (s) => document.querySelector(s);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class UI {
  constructor() {
    this.toastsEl = $('#toasts');
    this.popups = [];
    this.bannerT = 0; this.killT = 0; this.flashT = 0;
    this.mm = $('#minimap').getContext('2d');
    this.dialogNode = null;
  }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  // ---------------- HUD ----------------
  update(dt) {
    const P = G.player, st = P.st;
    $('#hpBar i').style.width = `calc(${(P.hp / st.maxHp) * 100}% - 2px)`;
    $('#hpBar span').textContent = `${Math.ceil(P.hp)} / ${st.maxHp}`;
    $('#gasBar i').style.width = `calc(${(P.gas / st.maxGas) * 100}% - 2px)`;
    $('#gasBar span').textContent = `${Math.ceil(P.gas)}`;
    $('#blades .edge i').style.width = `calc(${P.blade}% - 2px)`;
    $('#blades .edge i').style.background = P.blade > 30 ? '#dfe6ee' : P.blade > 0 ? '#e8a060' : '#6a2a2a';
    $('#spare').textContent = `${P.spare} spare pair${P.spare === 1 ? '' : 's'}`;
    const sp = P.vel.length();
    $('#spd').textContent = Math.round(sp);
    $('#speedlines').style.opacity = Math.max(0, Math.min(1, (sp - 24) / 30));
    $('#lowHp').style.opacity = P.hp < st.maxHp * 0.3 ? 0.6 + Math.sin(G.time * 6) * 0.3 : 0;
    const [hl, hr] = P.hooks;
    $('#hL').className = hl.state === 'attached' ? 'on' : hl.state === 'fly' ? 'fly' : '';
    $('#hR').className = hr.state === 'attached' ? 'on' : hr.state === 'fly' ? 'fly' : '';
    const cc = P.aim.hollow ? '#ff8a3a' : P.aim.ok ? '#ffd27a' : 'rgba(255,255,255,0.55)';
    $('#cross').style.setProperty('--cc', cc);
    $('#crossDist').textContent = P.aim.ok ? `${Math.round(P.aim.dist)} m` : '';
    const s = G.save;
    $('#lvlN').textContent = `Lv ${s.level}`;
    $('#xpbar i').style.width = `${(s.xp / xpForLevel(s.level)) * 100}%`;
    $('#marks').textContent = `${s.marks} marks`;
    // objective
    const tr = G.quests.tracked();
    $('#objective .qt').textContent = tr ? tr.title : '';
    $('#objective .qs').textContent = tr ? tr.text : (G.save.flags.ending ? 'Free roam: bounties, races and lost insignia await.' : '');
    this.updateWaypoint(tr && tr.pos);
    // timers
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('#banner').style.opacity = 0; }
    if (this.killT > 0) { this.killT -= dt; if (this.killT <= 0) $('#killfeed').style.opacity = 0; }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) $('#vignette').style.opacity = 0; }
    this.updatePopups(dt);
    this.drawMinimap();
  }

  project(p) {
    const v = p.clone().project(G.camera);
    const behind = v.z > 1;
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, behind };
  }

  updateWaypoint(pos) {
    const el = $('#waypoint');
    if (!pos) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const s = this.project(pos);
    let { x, y } = s;
    const m = 40;
    if (s.behind) { x = innerWidth - x; y = innerHeight * 0.75; }
    x = Math.max(70, Math.min(innerWidth - 70, x)); y = Math.max(110, Math.min(innerHeight - 170, y));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.querySelector('span').textContent = `${Math.round(pos.distanceTo(G.player.pos))} m`;
  }

  drawMinimap() {
    const c = this.mm, W = G.world, P = G.player;
    if (!W || !W.mapCanvas) return;
    const { canvas, scale } = W.mapCanvas;
    const size = 176, view = 260; // meters across
    c.save();
    c.clearRect(0, 0, size, size);
    c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#1b1d1b'; c.fillRect(0, 0, size, size);
    const sx = (P.pos.x - W.bounds.x0 - view / 2) * scale, sz = (P.pos.z - W.bounds.z0 - view / 2) * scale;
    c.drawImage(canvas, sx, sz, view * scale, view * scale, 0, 0, size, size);
    const k = size / view;
    const dot = (x, z, col, r = 3) => {
      const px = (x - P.pos.x) * k + size / 2, pz = (z - P.pos.z) * k + size / 2;
      c.fillStyle = col; c.beginPath(); c.arc(px, pz, r, 0, Math.PI * 2); c.fill();
    };
    for (const d of W.depots) dot(d.x, d.z, '#5fd38a', 3.5);
    for (const n of G.npcs) dot(n.pos.x, n.pos.z, '#8fc8ff', 3);
    for (const h of G.hollows) if (!h.dead) dot(h.pos.x, h.pos.z, h.T.static ? '#b08a5a' : '#ff5a3a', h.T.boss ? 6 : 4);
    const tr = G.quests.tracked();
    if (tr && tr.pos) {
      let px = (tr.pos.x - P.pos.x) * k, pz = (tr.pos.z - P.pos.z) * k;
      const L = Math.hypot(px, pz), R = size / 2 - 8;
      if (L > R) { px *= R / L; pz *= R / L; }
      c.fillStyle = '#ffd27a'; c.save(); c.translate(px + size / 2, pz + size / 2); c.rotate(Math.PI / 4); c.fillRect(-4, -4, 8, 8); c.restore();
    }
    // player arrow
    c.translate(size / 2, size / 2); c.rotate(-P.yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill();
    c.restore();
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = text;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = 0; setTimeout(() => el.remove(), 400); }, 3200);
  }
  questBanner(k, v) {
    $('#banner .k').textContent = k; $('#banner .v').textContent = v;
    $('#banner').style.opacity = 1; this.bannerT = 3.5;
  }
  kill(text, sub) {
    $('#killfeed').innerHTML = '';
    $('#killfeed').append(text);
    if (sub) { const s = document.createElement('small'); s.textContent = sub; $('#killfeed').append(s); }
    $('#killfeed').style.opacity = 1; this.killT = 1.6;
  }
  flash() { $('#vignette').style.opacity = 1; this.flashT = 0.25; }
  popup(pos, text, color = '#fff') {
    const el = document.createElement('div');
    el.className = 'popup'; el.textContent = text; el.style.color = color;
    $('#popups').appendChild(el);
    this.popups.push({ el, pos: pos.clone(), t: 0 });
  }
  updatePopups(dt) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt; p.pos.y += dt * 2.5;
      const s = this.project(p.pos);
      p.el.style.left = s.x + 'px'; p.el.style.top = s.y + 'px';
      p.el.style.opacity = s.behind ? 0 : Math.max(0, 1 - p.t / 1.1);
      if (p.t > 1.1) { p.el.remove(); this.popups.splice(i, 1); }
    }
  }
  grab(v) {
    if (v === null) { $('#grab').classList.add('hidden'); return; }
    $('#grab').classList.remove('hidden');
    $('#grab .bar i').style.width = `calc(${Math.min(1, v) * 100}% - 2px)`;
  }
  prompt(text) {
    const el = $('#prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (el.dataset.t !== text) { el.dataset.t = text; el.innerHTML = ''; const k = document.createElement('kbd'); k.textContent = 'F'; el.append(k, text); }
  }
  section(W) { $('#secName').textContent = W.def.name; $('#secSub').textContent = W.def.sub; }
  notice(text, ms = 2200) {
    const el = $('#notice'); el.textContent = text; el.classList.remove('hidden');
    clearTimeout(this.nt); this.nt = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ---------------- dialogue ----------------
  openDialog(node, npcId) {
    this.dialogNpc = npcId;
    this.show('#dialog');
    this.renderNode(node);
  }
  renderNode(node) {
    if (typeof node === 'function') node = node();
    this.dialogNode = node;
    const def = NPC_DEFS[this.dialogNpc];
    $('#dialog .who').textContent = node.speaker || (def ? def.name : 'Resident');
    $('#dialog .role').textContent = def ? def.title : G.world.def.name;
    $('#dialog .txt').textContent = node.text;
    const box = $('#dialog .choices'); box.innerHTML = '';
    const choices = node.choices && node.choices.length ? node.choices : [{ t: 'Farewell.' }];
    choices.forEach((ch, i) => {
      const b = document.createElement('button'); b.className = 'ch';
      const k = document.createElement('kbd'); k.textContent = i + 1;
      b.append(k, ch.t);
      b.onclick = () => this.choose(i);
      box.appendChild(b);
    });
    $('#dialog .box').scrollTop = 0;
  }
  choose(i) {
    const node = this.dialogNode;
    const choices = node.choices && node.choices.length ? node.choices : [{ t: 'Farewell.' }];
    const ch = choices[i];
    if (!ch) return;
    G.audio.play('ui');
    if (ch.next) { this.renderNode(ch.next); return; }
    this.show('#dialog', false); this.dialogNode = null;
    if (ch.act) ch.act();
    if (G.state === 'dialog') G.resume();
  }
  closeDialog() { this.show('#dialog', false); this.dialogNode = null; G.resume(); }

  // ---------------- shop ----------------
  openShop(npcId) {
    this.shopNpc = npcId;
    G.state = 'shop';
    G.input.unlock();
    this.show('#shop');
    this.renderShop();
  }
  renderShop() {
    const def = NPC_DEFS[this.shopNpc];
    $('#shopWho').textContent = `${def.name} · ${def.title}`;
    $('#shopMarks').textContent = `${G.save.marks} marks`;
    const list = $('#shopList'); list.innerHTML = '';
    for (const key of def.shop) {
      const U = UPGRADES[key], lvl = G.save.upg[key];
      const max = lvl >= U.cost.length;
      const row = document.createElement('div'); row.className = 'sitem';
      const info = document.createElement('div');
      const b = document.createElement('b'); b.textContent = U.name;
      const pips = document.createElement('span'); pips.className = 'pips';
      for (let i = 0; i < U.vals.length - 1; i++) { const p = document.createElement('i'); if (i < lvl) p.className = 'f'; pips.append(p); }
      b.append(pips);
      const p = document.createElement('p');
      p.textContent = `${U.desc} Now ${U.vals[lvl]}${U.unit}${max ? ' (max)' : `, next ${U.vals[lvl + 1]}${U.unit}`}.`;
      info.append(b, p);
      const btn = document.createElement('button'); btn.className = 'btn' + (max ? '' : ' primary');
      btn.textContent = max ? 'Mastered' : `${U.cost[lvl]} marks`;
      btn.disabled = max || G.save.marks < U.cost[lvl];
      btn.onclick = () => {
        if (G.save.marks < U.cost[lvl]) return;
        G.save.marks -= U.cost[lvl]; G.save.upg[key]++;
        G.player.refreshStats();
        if (key === 'tank') G.player.gas = G.player.st.maxGas;
        if (key === 'armor') G.player.hp = G.player.st.maxHp;
        if (key === 'stock') G.player.spare = G.player.st.spare;
        G.audio.play('coin');
        G.saveGame();
        this.renderShop();
      };
      row.append(info, btn);
      list.append(row);
    }
  }
  closeShop() { this.show('#shop', false); G.resume(); }

  // ---------------- pause / journal ----------------
  openPause(tab = 'quests') {
    this.show('#pause');
    $('#pName').textContent = G.save.name;
    const tabs = [['quests', 'Quests'], ['warden', 'Warden'], ['map', 'Map'], ['controls', 'Controls'], ['settings', 'Settings']];
    const el = $('#tabs'); el.innerHTML = '';
    for (const [id, label] of tabs) {
      const b = document.createElement('button'); b.className = 'tab' + (id === tab ? ' on' : ''); b.textContent = label;
      b.onclick = () => this.openPause(id);
      el.append(b);
    }
    const body = $('#tabbody'); body.innerHTML = '';
    this[`tab_${tab}`](body);
  }
  tab_quests(body) {
    const Q = G.quests;
    const ids = Object.keys(G.save.quests);
    if (!ids.length) { body.innerHTML = '<p style="font-family:var(--f-body);color:var(--muted);font-size:17px">No quests yet. Speak with Instructor Maren Holt at the Lowmarch training yard.</p>'; return; }
    const sorted = ids.sort((a, b) => (Q.isActive(b) - Q.isActive(a)) || ((QUESTS[b].main ? 1 : 0) - (QUESTS[a].main ? 1 : 0)));
    for (const id of sorted) {
      const d = QUESTS[id], q = G.save.quests[id];
      const it = document.createElement('div'); it.className = 'qitem' + (q.done ? ' done' : '');
      const b = document.createElement('b'); b.textContent = d.title + (d.main ? '' : '  ·  side');
      const s = document.createElement('div'); s.className = 's';
      s.textContent = q.done ? (d.repeat ? 'Complete. Can be repeated.' : 'Complete') : d.steps[q.step].t;
      const p = document.createElement('p'); p.textContent = d.desc;
      it.append(b, s, p);
      if (!q.done) {
        const t = document.createElement('button'); t.className = 'btn'; t.style.marginTop = '8px'; t.style.fontSize = '15px';
        t.textContent = G.save.tracked === id ? 'Tracking' : 'Track';
        t.onclick = () => { G.save.tracked = id; this.openPause('quests'); };
        it.append(t);
      }
      body.append(it);
    }
  }
  tab_warden(body) {
    const s = G.save, st = stats();
    const dl = document.createElement('dl'); dl.className = 'kv';
    const add = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); };
    add('Origin', ORIGINS[s.origin].name + ' (' + ORIGINS[s.origin].perk + ')');
    add('Corps', s.corps ? `${CORPS[s.corps].name} (${CORPS[s.corps].perk})` : 'Unsworn');
    add('Level', `${s.level}  (${s.xp} / ${xpForLevel(s.level)} XP)`);
    add('Marks', s.marks);
    add('Hollows slain', s.kills);
    add('Insignia found', `${s.found.length} / 24`);
    add('Max health', st.maxHp); add('Gas tank', st.maxGas); add('Reel strength', st.reel.toFixed(2) + 'x');
    add('Hook range', st.range + ' m'); add('Blade damage', st.dmg.toFixed(2) + 'x'); add('Spare blades', st.spare);
    if (s.best.courier) add('Courier Run best', s.best.courier.toFixed(1) + ' s');
    if (s.best.spire) add('Spire Run best', s.best.spire.toFixed(1) + ' s');
    body.append(dl);
  }
  tab_map(body) {
    const W = G.world;
    const cv = document.createElement('canvas'); cv.id = 'bigmap';
    cv.width = W.mapCanvas.canvas.width; cv.height = W.mapCanvas.canvas.height;
    const c = cv.getContext('2d'); c.drawImage(W.mapCanvas.canvas, 0, 0);
    const s = W.mapCanvas.scale;
    const P = (x, z) => [(x - W.bounds.x0) * s, (z - W.bounds.z0) * s];
    c.font = '600 15px "Barlow Condensed", sans-serif'; c.textAlign = 'center';
    for (const d of W.depots) { const [x, y] = P(d.x, d.z); c.fillStyle = '#5fd38a'; c.fillRect(x - 4, y - 4, 8, 8); }
    for (const n of G.npcs) { const [x, y] = P(n.pos.x, n.pos.z); c.fillStyle = '#8fc8ff'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); c.fillStyle = '#e8f2ff'; c.fillText(n.def.name, x, y - 8); }
    for (const g of W.gates) { const [x, y] = P(g.x, g.z); c.fillStyle = '#ffd27a'; c.fillText('Gate: ' + g.label, x, y + g.inward * 22); }
    const [px, py] = P(G.player.pos.x, G.player.pos.z);
    c.save(); c.translate(px, py); c.rotate(-G.player.yaw); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(-7, 8); c.fill(); c.restore();
    const h = document.createElement('h3'); h.textContent = `${W.def.name} · ${W.def.sub}`; h.style.marginBottom = '10px';
    const legend = document.createElement('div'); legend.style.cssText = 'margin-top:8px;color:var(--muted);font-size:15px';
    legend.textContent = 'Green: supply depots (gas + blades). Blue: people. The city is four sections: the Wilds beyond the Outer Bulwark, then Lowmarch, Ironvale and Solspire, each inside its own wall.';
    body.append(h, cv, legend);
  }
  tab_controls(body) { body.append(controlsList()); }
  tab_settings(body) {
    const s = G.save.settings;
    const mk = (label, key, min, max, step, fmt) => {
      const row = document.createElement('div'); row.className = 'set';
      const l = document.createElement('label'); l.textContent = label; l.htmlFor = 'set_' + key;
      const r = document.createElement('input'); r.type = 'range'; r.id = 'set_' + key; r.min = min; r.max = max; r.step = step; r.value = s[key];
      const v = document.createElement('span'); v.textContent = fmt(s[key]);
      r.oninput = () => { s[key] = parseFloat(r.value); v.textContent = fmt(s[key]); G.applySettings(); };
      row.append(l, r, v); body.append(row);
    };
    mk('Mouse sensitivity', 'sens', 0.2, 3, 0.05, (x) => x.toFixed(2));
    mk('Field of view', 'fov', 60, 95, 1, (x) => x + '°');
    mk('Volume', 'vol', 0, 1, 0.05, (x) => Math.round(x * 100) + '%');
    mk('Render scale', 'scale', 0.5, 1, 0.05, (x) => Math.round(x * 100) + '%');
    const tg = (label, key) => {
      const row = document.createElement('div'); row.className = 'set';
      const l = document.createElement('label'); l.textContent = label; l.htmlFor = 'set_' + key;
      const c = document.createElement('input'); c.type = 'checkbox'; c.id = 'set_' + key; c.checked = !!s[key];
      c.onchange = () => { s[key] = c.checked; G.applySettings(); };
      row.append(l, c); body.append(row);
    };
    tg('Invert mouse Y', 'invert');
    tg('Shadows', 'shadows');
  }

  // ---------------- creation ----------------
  setupCreate(onBegin) {
    let origin = 'farm', coat = COAT_COLORS[0];
    const oc = $('#originCards'); oc.innerHTML = '';
    for (const [id, o] of Object.entries(ORIGINS)) {
      const c = document.createElement('button'); c.className = 'card' + (id === origin ? ' sel' : '');
      const b = document.createElement('b'); b.textContent = o.name;
      const p = document.createElement('p'); p.textContent = o.desc;
      const e = document.createElement('em'); e.textContent = o.perk;
      c.append(b, p, e);
      c.onclick = () => { origin = id; oc.querySelectorAll('.card').forEach((x) => x.classList.remove('sel')); c.classList.add('sel'); };
      oc.append(c);
    }
    const sw = $('#coatSw'); sw.innerHTML = '';
    COAT_COLORS.forEach((col, i) => {
      const d = document.createElement('button'); d.className = 'sw' + (i === 0 ? ' sel' : ''); d.style.background = hex(col);
      d.setAttribute('aria-label', 'Coat color ' + (i + 1));
      d.onclick = () => { coat = col; sw.querySelectorAll('.sw').forEach((x) => x.classList.remove('sel')); d.classList.add('sel'); };
      sw.append(d);
    });
    $('#bBegin').onclick = () => onBegin($('#nameIn').value.trim() || 'Kestrel Vane', origin, coat);
  }

  chapterCard(ending) {
    const T = {
      douse: ['The Dark Lantern', 'The great flame above Solspire was put out at midnight. The winter that followed was hard, and the forges of Ironvale burned coal day and night. Out in the Wilds the Hollows still roam, but fewer come to the walls each season. Some nights, the people of Lowmarch sleep without hearing footsteps.'],
      keep: ['The Undying Flame', 'The Lantern still burns, and the Wardens still fly. You chose to stand between the flame and the Tide for as long as it takes. The bounty boards fill up faster each year, and the Wardens recruit younger. Somewhere in the forest, more Hollows are already walking toward the light.'],
      tell: ['The Open Ledger', 'The founders\' ledgers were posted in every square from Lowmarch to the palace steps. The Council fell within a month. The people argue about the Lantern in taverns, on rooftops and at the foot of the walls, and for the first time in three hundred years the argument belongs to them.'],
    }[ending];
    $('#chTitle').textContent = T[0];
    $('#chText').textContent = T[1] + '\n\nThe world stays open: hunt bounties in the Wilds, fly the races, and recover the lost insignia.';
    G.state = 'menu'; G.input.unlock();
    this.show('#chapter');
  }
}

export function controlsList() {
  const keys = [
    ['W A S D', 'Run / steer while airborne'], ['Mouse', 'Look and aim tethers'],
    ['Q / E', 'Fire left / right tether (hold to reel in, release to let go)'], ['Right mouse', 'Fire both tethers together'],
    ['Left mouse', 'Slash. Faster flight means deeper cuts'], ['Space', 'Jump; in the air, gas thrust toward where you look'],
    ['Shift', 'Gas dash'], ['R', 'Swap to a fresh blade pair'], ['F', 'Talk, resupply at depots, pass gates'],
    ['1-4', 'Pick dialogue choices'], ['Tab / J', 'Journal: quests, map, settings'], ['M', 'Map'], ['Esc', 'Pause'],
  ];
  const d = document.createElement('div'); d.className = 'keys';
  for (const [k, v] of keys) { const a = document.createElement('kbd'); a.textContent = k; const b = document.createElement('span'); b.textContent = v; d.append(a, b); }
  const p = document.createElement('p');
  p.style.cssText = 'grid-column:1/-1;font-family:var(--f-body);color:var(--muted);font-size:16px;margin-top:10px';
  p.textContent = 'Every Hollow has one weak point: the glowing ember seam on the back of its neck. Cut an ankle to drop it to its knees. Green-roofed depots restock gas and blades.';
  d.append(p);
  return d;
}

export { SECTIONS, hex, THREE };
