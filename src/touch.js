import { G } from './state.js';
import { Input } from './input.js';

// On-screen controls for tablets and phones.
//   Left thumb: floating move stick (anywhere on the left half) + L-HOOK.
//   Right thumb: drag anywhere on the right half to look; SLASH, R-HOOK, GAS, DASH buttons.
//   Hooks are toggles on touch (tap to fire and hold on, tap again to let go), so one thumb can look while swinging.
export const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const BTNS = [
  { id: 'hookL', label: 'L-HOOK', cls: 'tb-hookL', toggle: true },
  { id: 'hookR', label: 'R-HOOK', cls: 'tb-hookR', toggle: true },
  { id: 'slash', label: 'SLASH', cls: 'tb-slash' },
  { id: 'jump', label: 'GAS', cls: 'tb-jump', hold: true },
  { id: 'dash', label: 'DASH', cls: 'tb-dash' },
  { id: 'reload', label: 'BLADES', cls: 'tb-reload' },
  { id: 'journal', label: 'MENU', cls: 'tb-menu' },
];

export class Touch {
  constructor() {
    this.root = document.getElementById('touch');
    this.stickT = null; this.lookT = null;
    this.latch = { hookL: false, hookR: false };
    this.latchAt = { hookL: 0, hookR: 0 };
    this.base = document.createElement('div'); this.base.className = 'tstick';
    this.knob = document.createElement('div'); this.knob.className = 'tknob';
    this.base.append(this.knob);
    this.root.append(this.base);
    this.btns = {};
    for (const b of BTNS) {
      const el = document.createElement('button');
      el.className = 'tbtn ' + b.cls; el.textContent = b.label; el.dataset.act = b.id;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.press(b, el); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.release(b, el); }, { passive: false });
      el.addEventListener('touchcancel', () => this.release(b, el));
      this.root.append(el);
      this.btns[b.id] = el;
    }
    // stick + look on the background layer
    this.root.addEventListener('touchstart', (e) => this.start(e), { passive: false });
    this.root.addEventListener('touchmove', (e) => this.move(e), { passive: false });
    this.root.addEventListener('touchend', (e) => this.end(e), { passive: false });
    this.root.addEventListener('touchcancel', (e) => this.end(e), { passive: false });
    // the interaction prompt is tappable
    const pr = document.getElementById('prompt');
    pr.addEventListener('touchstart', (e) => { e.preventDefault(); Input.touchHit.add('interact'); }, { passive: false });
    // any touch switches the game into touch mode
    addEventListener('touchstart', () => { if (Input.device !== 'touch') Input.setDevice('touch'); G.audio && G.audio.init(); }, { passive: true, capture: true });
  }

  press(b, el) {
    Input.setDevice('touch');
    if (b.toggle) {
      this.latch[b.id] = !this.latch[b.id];
      if (this.latch[b.id]) { Input.touchDown.add(b.id); Input.touchHit.add(b.id); this.latchAt[b.id] = performance.now(); }
      else Input.touchDown.delete(b.id);
      el.classList.toggle('on', this.latch[b.id]);
      return;
    }
    Input.touchHit.add(b.id);
    if (b.hold) Input.touchDown.add(b.id);
    el.classList.add('on');
  }
  release(b, el) {
    if (b.toggle) return;
    Input.touchDown.delete(b.id);
    el.classList.remove('on');
  }

  start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && this.stickT === null) {
        this.stickT = t.identifier; this.sx = t.clientX; this.sy = t.clientY;
        this.base.style.left = t.clientX + 'px'; this.base.style.top = t.clientY + 'px';
        this.base.classList.add('show');
      } else if (this.lookT === null) {
        this.lookT = t.identifier; this.lx = t.clientX; this.ly = t.clientY;
      }
    }
  }
  move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.stickT) {
        let dx = t.clientX - this.sx, dy = t.clientY - this.sy;
        const R = 60, l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        Input.stick.x = dx / R; Input.stick.y = dy / R;
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (t.identifier === this.lookT) {
        Input.tdx += t.clientX - this.lx; Input.tdy += t.clientY - this.ly;
        this.lx = t.clientX; this.ly = t.clientY;
      }
    }
  }
  end(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.stickT) {
        this.stickT = null; Input.stick.x = Input.stick.y = 0;
        this.knob.style.transform = ''; this.base.classList.remove('show');
      } else if (t.identifier === this.lookT) this.lookT = null;
    }
  }

  // called each frame
  update() {
    const show = G.state === 'play' && Input.device === 'touch';
    this.root.classList.toggle('hidden', !show);
    document.body.classList.toggle('touch', Input.device === 'touch');
    if (!show) { this.stickT = this.lookT = null; Input.stick.x = Input.stick.y = 0; return; }
    // a hook that missed or was cut loose un-latches its button
    const P = G.player;
    if (!P) return;
    ['hookL', 'hookR'].forEach((id, i) => {
      if (this.latch[id] && performance.now() - this.latchAt[id] > 400 && (P.hooks[i].state === 'idle' || P.hooks[i].state === 'retract')) {
        this.latch[id] = false; Input.touchDown.delete(id); this.btns[id].classList.remove('on');
      }
    });
  }
}
