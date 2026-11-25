import * as THREE from 'three';
import { G } from './state.js';
import { SECTION_ORDER } from './world.js';
import { NPC_DEFS } from './npcs.js';

export const QUESTS = {
  q_tether: {
    title: 'First Tether', main: true, giver: 'maren',
    desc: 'Instructor Maren Holt wants to see if you can handle a tether rig before she lets you near a real Hollow.',
    steps: [
      { t: 'Fly through the 5 training rings over the yard', type: 'rings', set: 'yard', section: 'lowmarch' },
      { t: 'Sever the seam of 3 training dummies', type: 'kill', kind: 'dummy', n: 3, section: 'lowmarch', at: 'yard' },
      { t: 'Report back to Instructor Maren', type: 'talk', npc: 'maren' },
    ],
    reward: { xp: 120, marks: 60 },
  },
  q_breach: {
    title: 'The Breach', main: true, giver: 'ilsa',
    desc: 'The breach bell is ringing. Hollows have come through a crack in the Outer Bulwark.',
    steps: [
      { t: 'Hollows are inside Lowmarch! Cut down 5 of them', type: 'kill', n: 5, section: 'lowmarch', at: 'breach' },
      { t: 'Find Captain Ilsa Thorne at the breach', type: 'talk', npc: 'ilsa' },
      { t: 'Hold the breach while the engineers seal it', type: 'defend', dur: 75, section: 'lowmarch', at: 'breach' },
      { t: 'Report to Captain Thorne', type: 'talk', npc: 'ilsa' },
    ],
    reward: { xp: 300, marks: 150 },
  },
  q_word: {
    title: 'Word to Ironvale', main: true, giver: 'ilsa',
    desc: 'Captain Thorne wants High Command to hear about the breach from someone who fought in it.',
    steps: [
      { t: 'Take the North Gate of Lowmarch into Ironvale', type: 'reach', section: 'ironvale' },
      { t: 'Report to Commander Voss outside Warden HQ', type: 'talk', npc: 'voss' },
    ],
    reward: { xp: 150, marks: 100 },
  },
  q_greyhorn: {
    title: 'Beyond the Bulwark', main: true, giver: 'voss',
    desc: 'Eight years ago a Vanguard scout climbed Greyhorn Tower to watch the Hollows and never returned. Voss wants her journal.',
    steps: [
      { t: 'Leave through the South Gate of Lowmarch into the Wilds', type: 'reach', section: 'wilds' },
      { t: 'Find Scout Fenn at the Forward Cache', type: 'talk', npc: 'fenn' },
      { t: 'Climb Greyhorn Tower and recover the signal journal', type: 'reach', section: 'wilds', at: 'tower', r: 16, minY: 70 },
      { t: 'Slay the Thornback in the eastern meadow', type: 'kill', kind: 'thornback', n: 1, section: 'wilds', at: 'lair' },
      { t: 'Bring the journal to Commander Voss in Ironvale', type: 'talk', npc: 'voss' },
    ],
    reward: { xp: 600, marks: 400 },
  },
  q_lantern: {
    title: "The Lantern's Shadow", main: true, giver: 'voss',
    desc: 'The scout\'s journal says the Hollows all walk toward the same place. Archivist Oriel Sarn in Solspire may know why.',
    steps: [
      { t: 'Find Archivist Oriel outside the Archive in Solspire', type: 'talk', npc: 'oriel' },
      { t: 'Hollows have surfaced inside Solspire! Cut down 4 of them', type: 'kill', n: 4, section: 'solspire', at: 'archive' },
      { t: 'Return to Archivist Oriel', type: 'talk', npc: 'oriel' },
    ],
    reward: { xp: 900, marks: 600 },
  },
  s_satchel: {
    title: "Pell's Satchel", giver: 'pell',
    desc: 'Old Pell left his satchel at the top of the Lowmarch bell tower.',
    steps: [
      { t: "Find Pell's satchel on top of the bell tower", type: 'reach', section: 'lowmarch', at: 'bell', r: 8, minY: 33 },
      { t: 'Return the satchel to Old Pell', type: 'talk', npc: 'pell' },
    ],
    reward: { xp: 60, marks: 60 },
  },
  s_courier: {
    title: 'Courier Run', giver: 'pip', repeat: true,
    desc: 'Pip bets you cannot fly the rooftop courier route faster than Pip can.',
    steps: [
      { t: "Fly Pip's route through 10 rings before time runs out", type: 'rings', set: 'courier', section: 'ironvale', time: 90 },
      { t: 'Tell Pip how it went', type: 'talk', npc: 'pip' },
    ],
    reward: { xp: 120, marks: 120 },
  },
  s_spire: {
    title: 'The Spire Run', giver: 'veyra', repeat: true,
    desc: 'Lady Veyra pays any Warden who can thread the high rings between the spires of Solspire.',
    steps: [
      { t: 'Thread the 12 rings above Solspire before time runs out', type: 'rings', set: 'spire', section: 'solspire', time: 120 },
      { t: 'Return to Lady Veyra', type: 'talk', npc: 'veyra' },
    ],
    reward: { xp: 200, marks: 220 },
  },
  s_bounty: {
    title: 'Wilds Bounty', giver: 'clerk', repeat: true,
    desc: 'Ironvale pays for every Hollow culled beyond the wall.',
    steps: [
      { t: 'Cut down 5 Hollows in the Wilds', type: 'kill', n: 5, section: 'wilds' },
      { t: 'Collect your bounty from Wren Ashby in Ironvale', type: 'talk', npc: 'clerk' },
    ],
    reward: { xp: 220, marks: 200 },
  },
};

const CHAIN = { q_breach: 'q_word', q_word: 'q_greyhorn', q_greyhorn: 'q_lantern' };

export class Quests {
  constructor() { this.defendT = 0; }
  get S() { return G.save.quests; }
  q(id) { return this.S[id] || { step: -1, prog: 0, done: false }; }
  isActive(id) { const q = this.S[id]; return !!q && !q.done && q.step >= 0; }
  isDone(id) { const q = this.S[id]; return !!q && !!q.everDone; }
  step(id) { const q = this.S[id]; return q && !q.done ? q.step : -1; }
  stepDef(id) { const q = this.S[id]; return q && !q.done ? QUESTS[id].steps[q.step] : null; }

  start(id) {
    const prev = this.S[id];
    this.S[id] = { step: 0, prog: 0, done: false, everDone: prev ? prev.everDone : false, t0: G.time };
    G.ui.questBanner('New quest', QUESTS[id].title);
    G.audio.play('quest');
    G.save.tracked = id;
    this.enterStep(id);
    G.saveGame();
  }
  advance(id) {
    const q = this.S[id];
    if (!q || q.done) return;
    q.step++; q.prog = 0;
    if (q.step >= QUESTS[id].steps.length) { this.complete(id); return; }
    G.audio.play('ring');
    G.ui.toast('Objective: ' + QUESTS[id].steps[q.step].t);
    this.enterStep(id);
    G.saveGame();
  }
  complete(id) {
    const q = this.S[id], d = QUESTS[id];
    q.done = true; q.everDone = true;
    G.addMarks(d.reward.marks); G.addXP(d.reward.xp);
    G.ui.questBanner('Quest complete', `${d.title}  ·  +${d.reward.xp} XP  ·  +${d.reward.marks} marks`);
    G.audio.play('quest');
    if (G.save.tracked === id) G.save.tracked = null;
    // story chain
    const next = CHAIN[id];
    if (next && !this.S[next]) setTimeout(() => { if (!this.S[next]) this.start(next); }, 2500);
    if (id === 'q_breach') { G.save.flags.breachSealed = true; G.setAlarm(false); }
    G.saveGame();
  }

  enterStep(id) {
    const s = this.stepDef(id);
    if (!s || (s.section && s.section !== G.world.id)) return;
    if (s.type === 'rings') G.rings.start(s.set, s.time || 0, id);
    if (id === 'q_breach') {
      const st = this.step(id);
      if (st === 0) G.setAlarm(true);
      if (st === 2) this.defendT = s.dur;
      G.setupSpawners();
    }
    if (id === 'q_greyhorn' && this.step(id) === 3) G.setupSpawners();
    if (id === 'q_lantern' && this.step(id) === 1) G.setupSpawners();
  }

  // called when a section is loaded
  setupSection() {
    // never leave the story stranded between chapters (e.g. saved during the hand-off delay)
    for (const [a, b] of Object.entries(CHAIN)) if (this.isDone(a) && !this.S[b]) this.start(b);
    for (const id of Object.keys(this.S)) if (this.isActive(id)) {
      const s = this.stepDef(id);
      if (s.type === 'rings' && s.section === G.world.id && (!s.time)) G.rings.start(s.set, 0, id);
    }
    G.setAlarm(this.isActive('q_breach') && this.step('q_breach') <= 2 && G.world.id === 'lowmarch');
  }

  event(e) {
    for (const id of Object.keys(this.S)) {
      if (!this.isActive(id)) continue;
      const s = this.stepDef(id), q = this.S[id];
      if (e.type === 'kill' && s.type === 'kill') {
        if (s.section && s.section !== G.world.id) continue;
        if (s.kind ? s.kind !== e.kind : e.kind === 'dummy') continue;
        q.prog++;
        if (q.prog >= s.n) this.advance(id);
        else G.ui.toast(`${s.t.replace(/ \d+ of them| \d+ Hollows| \d+ training dummies/, '')}: ${q.prog}/${s.n}`);
      }
      if (e.type === 'talk' && s.type === 'talk' && s.npc === e.npc) this.advance(id);
    }
  }

  update(dt) {
    const P = G.player;
    for (const id of Object.keys(this.S)) {
      if (!this.isActive(id)) continue;
      const s = this.stepDef(id);
      if (s.type === 'reach' && s.section === G.world.id) {
        if (!s.at) { this.advance(id); continue; }
        const p = G.world.poi[s.at];
        if (Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < s.r && P.pos.y >= (s.minY || 0)) {
          if (id === 's_satchel') G.ui.toast("Found Pell's satchel");
          if (id === 'q_greyhorn') G.ui.toast('Recovered the signal journal');
          this.advance(id);
        }
      }
      if (s.type === 'defend' && s.section === G.world.id) {
        this.defendT -= dt;
        if (this.defendT <= 0) {
          G.ui.toast('The engineers have sealed the breach!');
          G.audio.play('gate');
          G.sealBreach();
          this.advance(id);
        }
      }
    }
  }

  // objective text + world marker for the tracked quest
  tracked() {
    let id = G.save.tracked;
    if (!id || !this.isActive(id)) {
      id = Object.keys(QUESTS).find((k) => QUESTS[k].main && this.isActive(k)) || Object.keys(this.S).find((k) => this.isActive(k));
    }
    if (!id) {
      if (!this.S.q_tether && G.world.id === 'lowmarch') {
        const sp = G.world.npcSpots.maren;
        return { id: null, title: 'Recruit', text: G.input.device === 'touch' ? 'Find Instructor Maren Holt in the training yard and tap the Talk prompt' : `Find Instructor Maren Holt in the training yard and press ${G.input.glyph('interact')} to talk`, pos: new THREE.Vector3(sp[0], 2.5, sp[1]) };
      }
      return null;
    }
    const s = this.stepDef(id);
    let text = s.t;
    if (s.type === 'kill' && s.n > 1) text += ` (${this.S[id].prog}/${s.n})`;
    if (s.type === 'defend' && s.section === G.world.id) text += ` (${Math.max(0, Math.ceil(this.defendT))}s)`;
    if (s.type === 'rings' && G.rings.active && G.rings.quest === id) {
      text += ` (${G.rings.idx}/${G.rings.pts.length}${G.rings.time ? ', ' + Math.max(0, G.rings.left).toFixed(1) + 's' : ''})`;
    }
    return { id, title: QUESTS[id].title, text, pos: this.markerPos(s) };
  }

  markerPos(s) {
    const W = G.world;
    let section = s.section;
    let npcSpot = null;
    if (s.type === 'talk') {
      const d = NPC_DEFS[s.npc];
      section = d.section;
      npcSpot = W.npcSpots[s.npc];
    }
    if (section && section !== W.id) {
      const here = SECTION_ORDER.indexOf(W.id), there = SECTION_ORDER.indexOf(section);
      const g = W.gates.find((gt) => SECTION_ORDER.indexOf(gt.dest) === here + (there > here ? 1 : -1));
      return g ? new THREE.Vector3(g.x, 4, g.z + g.inward * 4) : null;
    }
    if (npcSpot) return new THREE.Vector3(npcSpot[0], 2.5, npcSpot[1]);
    if (s.type === 'rings' && G.rings.active) return G.rings.nextPos();
    if (s.type === 'kill') {
      // point at the nearest living target
      let best = null, bd = Infinity;
      for (const h of G.hollows) {
        if (h.dead) continue;
        if (s.kind ? h.type !== s.kind : h.type === 'dummy') continue;
        const d = h.pos.distanceTo(G.player.pos);
        if (d < bd) { bd = d; best = h; }
      }
      if (best) return new THREE.Vector3(best.pos.x, best.H * 0.9, best.pos.z);
    }
    if (s.at && W.poi[s.at]) { const p = W.poi[s.at]; return new THREE.Vector3(p.x, p.y || 3, p.z); }
    return null;
  }

  markerFor(npc) {
    for (const id of Object.keys(this.S)) {
      if (!this.isActive(id)) continue;
      const s = this.stepDef(id);
      if (s.type === 'talk' && s.npc === npc) return '?';
    }
    const offers = {
      maren: !this.S.q_tether,
      pell: !this.S.s_satchel,
      pip: this.isDone('q_word') && !this.isActive('s_courier') && !this.S.s_courier,
      veyra: !this.isActive('s_spire') && !this.S.s_spire,
      clerk: this.isActive('q_greyhorn') || this.isDone('q_greyhorn') ? !this.isActive('s_bounty') && !this.S.s_bounty : false,
      ambrose: (G.save.found.length - (G.save.flags.turned || 0)) > 0,
    };
    if (offers[npc]) return npc === 'ambrose' ? '$' : '!';
    if (NPC_DEFS[npc].shop) return '$';
    return '';
  }
}

// ---------------------------------------------------------------- ring courses
export class Rings {
  constructor(scene) {
    this.scene = scene; this.meshes = []; this.active = false;
    this.geo = new THREE.TorusGeometry(3.4, 0.28, 8, 32);
    this.matOn = new THREE.MeshBasicMaterial({ color: 0xffc95a });
    this.matOff = new THREE.MeshBasicMaterial({ color: 0x6f8aa0, transparent: true, opacity: 0.45 });
  }
  start(set, time, quest) {
    this.stop();
    const pts = G.world.rings[set];
    if (!pts || !pts.length) return;
    this.pts = pts.map((p) => new THREE.Vector3(...p));
    this.idx = 0; this.time = time; this.left = time; this.quest = quest; this.set = set; this.active = true; this.t0 = G.time;
    this.pts.forEach((p, i) => {
      const m = new THREE.Mesh(this.geo, this.matOff);
      m.position.copy(p);
      const nxt = this.pts[i + 1] || this.pts[i - 1];
      if (nxt) m.lookAt(nxt.x, p.y, nxt.z);
      this.scene.add(m); this.meshes.push(m);
    });
    this.refresh();
    if (time) G.ui.toast(`Go! ${time} seconds on the clock.`);
  }
  refresh() { this.meshes.forEach((m, i) => { m.material = i === this.idx ? this.matOn : this.matOff; m.visible = i >= this.idx; }); }
  nextPos() { return this.active ? this.pts[this.idx] : null; }
  stop() { for (const m of this.meshes) this.scene.remove(m); this.meshes = []; this.active = false; }
  update(dt) {
    if (!this.active) return;
    for (const [i, m] of this.meshes.entries()) if (i === this.idx) m.rotation.z += dt * 1.5;
    if (this.time) {
      this.left -= dt;
      if (this.left <= 0) {
        this.stop();
        G.ui.toast(`Out of time! Talk to ${this.set === 'courier' ? 'Pip' : 'Lady Veyra'} to try again.`, 'warn');
        return;
      }
    }
    const p = this.pts[this.idx];
    if (G.player.pos.distanceTo(p) < 4.2) {
      this.idx++; G.audio.play('ring');
      G.fx.sparks(p, 10);
      if (this.idx >= this.pts.length) {
        const t = G.time - this.t0;
        const best = G.save.best[this.set];
        if (this.time && (!best || t < best)) G.save.best[this.set] = t;
        G.ui.toast(this.time ? `Course complete in ${t.toFixed(1)}s${best && t < best ? ' (new best!)' : ''}` : 'Course complete!');
        this.stop();
        G.quests.advance(this.quest);
      } else this.refresh();
    }
  }
}

// ---------------------------------------------------------------- lost insignias
export class Insignias {
  constructor(scene) { this.scene = scene; this.items = []; this.geo = new THREE.OctahedronGeometry(0.7); this.mat = new THREE.MeshBasicMaterial({ color: 0xffd36a }); }
  setup(W) {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
    let pts = [];
    if (W.id === 'wilds') {
      pts = [[W.poi.tower.x + 6, 73.5, W.poi.tower.z], [W.poi.chapel.x, 35, W.poi.chapel.z], [-600, 51.5, -794], [-280, 51.5, -794], [300, 51.5, -794], [620, 51.5, -794]];
    } else {
      const tops = W.tops.slice().sort((a, b) => b.y - a.y);
      for (const t of tops) {
        if (pts.length >= 6) break;
        if (pts.some((p) => Math.hypot(p[0] - t.x, p[2] - t.z) < 160)) continue;
        pts.push([t.x, t.y + 1.4, t.z]);
      }
    }
    pts.forEach((p, i) => {
      const id = `${W.id}_${i}`;
      if (G.save.found.includes(id)) return;
      const m = new THREE.Mesh(this.geo, this.mat);
      m.position.set(p[0], p[1], p[2]);
      this.scene.add(m);
      this.items.push({ id, mesh: m });
    });
  }
  update(dt) {
    const P = G.player.pos;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.mesh.rotation.y += dt * 2;
      it.mesh.position.y += Math.sin(G.time * 3 + i) * 0.004;
      if (it.mesh.position.distanceTo(P) < 2.6) {
        G.save.found.push(it.id);
        this.scene.remove(it.mesh);
        this.items.splice(i, 1);
        G.audio.play('coin');
        G.addXP(30);
        G.ui.questBanner('Lost insignia found', `${G.save.found.length} of 24 recovered. Ambrose Lark in Solspire buys them.`);
        G.saveGame();
      }
    }
  }
}
