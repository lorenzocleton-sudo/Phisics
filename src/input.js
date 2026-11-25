// Unified input: keyboard + mouse and standard-layout gamepads map onto the same named actions.
// Gamepad (Xbox names; PlayStation equivalents in brackets):
//   Left stick move · Right stick look · LT/RT left/right tether (L2/R2) · LB both tethers (L1)
//   RB slash (R1) · A jump / gas thrust (Cross) · B dash (Circle) · X interact (Square)
//   Y swap blades (Triangle) · Start journal · View map · L3 dash
const KB = {
  hookL: ['KeyQ'], hookR: ['KeyE'], jump: ['Space'], dash: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyF'], reload: ['KeyR'], journal: ['Tab', 'KeyJ'], map: ['KeyM'],
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  confirm: ['Enter'], back: ['Escape'],
};
const MOUSE = { both: [2], slash: [0] };
const PAD = {
  hookL: [6], hookR: [7], both: [4], slash: [5], jump: [0], dash: [1, 10], interact: [2], reload: [3],
  journal: [9], map: [8], up: [12], down: [13], left: [14], right: [15], confirm: [0], back: [1], tabL: [4], tabR: [5],
};
const DEAD = 0.16;

export const Input = {
  keys: new Set(), pressed: new Set(), released: new Set(),
  mb: new Set(), mPressed: new Set(),
  dx: 0, dy: 0, locked: false, free: false, fails: 0, canvas: null,
  onLockChange: null, onKey: null, onDevice: null,
  device: 'kbm',
  pad: null, padDown: new Set(), padPrev: new Set(), padHit: new Set(),
  axes: [0, 0, 0, 0], navRepeat: 0, navDir: null,

  init(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'text')) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.setDevice('kbm');
      if (this.onKey) this.onKey(e);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mb.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      this.setDevice('kbm');
      if (!this.locked && !this.free) return;
      this.mb.add(e.button); this.mPressed.add(e.button);
    });
    addEventListener('mouseup', (e) => { this.mb.delete(e.button); });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked && !this.free) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) + Math.abs(my) > 2) this.setDevice('kbm');
      this.dx += mx; this.dy += my;
    });
    document.addEventListener('pointerlockerror', () => { this.fails++; if (this.fails >= 2) this.free = true; });
    if (!canvas.requestPointerLock) this.free = true;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.fails = 0;
      // remember whether this unlock was requested by the game or by the player pressing Esc
      // (Chrome can fire several unlock events for one exit, so the flag holds until the lock is regained)
      this.lastUnlockWasOurs = !this.locked && !!this.selfUnlock;
      if (this.locked) this.selfUnlock = false;
      if (!this.locked) this.mb.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    addEventListener('gamepadconnected', () => this.setDevice('pad'));
  },
  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    if (this.onDevice) this.onDevice(d);
  },
  lock() {
    if (this.free || this.locked || this.device === 'pad') return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { this.fails++; }
  },
  unlock() { if (document.pointerLockElement) { this.selfUnlock = true; document.exitPointerLock(); } },

  // poll the first connected gamepad; call once per frame before reading actions
  poll(dt) {
    let pad = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.pad = pad;
    this.padPrev = this.padDown;
    this.padDown = new Set();
    this.padHit.clear();
    if (!pad) { this.axes = [0, 0, 0, 0]; return; }
    const b = pad.buttons;
    const isDown = (i) => !!b[i] && (b[i].pressed || b[i].value > 0.35);
    for (const [act, ids] of Object.entries(PAD)) if (ids.some(isDown)) this.padDown.add(act);
    const ax = pad.axes;
    const dz = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD));
    this.axes = [dz(ax[0] || 0), dz(ax[1] || 0), dz(ax[2] || 0), dz(ax[3] || 0)];
    // left stick doubles as a d-pad for menus, with key-repeat
    let dir = null;
    if (this.axes[1] < -0.6) dir = 'up'; else if (this.axes[1] > 0.6) dir = 'down';
    else if (this.axes[0] < -0.6) dir = 'left'; else if (this.axes[0] > 0.6) dir = 'right';
    if (dir) {
      if (dir !== this.navDir) { this.padHit.add('nav_' + dir); this.navRepeat = 0.4; }
      else { this.navRepeat -= dt; if (this.navRepeat <= 0) { this.padHit.add('nav_' + dir); this.navRepeat = 0.12; } }
    }
    this.navDir = dir;
    for (const a of this.padDown) if (!this.padPrev.has(a)) this.padHit.add(a);
    if (this.padDown.size || Math.abs(this.axes[0]) + Math.abs(this.axes[1]) + Math.abs(this.axes[2]) + Math.abs(this.axes[3]) > 0.3) this.setDevice('pad');
  },

  down(a) {
    if (KB[a] && KB[a].some((k) => this.keys.has(k))) return true;
    if (MOUSE[a] && MOUSE[a].some((m) => this.mb.has(m))) return true;
    return this.padDown.has(a);
  },
  hit(a) {
    if (KB[a] && KB[a].some((k) => this.pressed.has(k))) return true;
    if (MOUSE[a] && MOUSE[a].some((m) => this.mPressed.has(m))) return true;
    return this.padHit.has(a) || this.padHit.has('nav_' + a);
  },
  key(c) { return this.keys.has(c); },
  keyHit(c) { return this.pressed.has(c); },

  // movement vector in [-1, 1] (x = strafe right, y = forward)
  move() {
    let x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    let y = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    x += this.axes[0]; y -= this.axes[1];
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  },
  // look delta in radians for this frame
  look(dt, sensMouse, sensPad) {
    const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
    return {
      dx: this.dx * 0.0022 * sensMouse + curve(this.axes[2]) * 3.4 * sensPad * dt,
      dy: this.dy * 0.0022 * sensMouse + curve(this.axes[3]) * 2.6 * sensPad * dt,
    };
  },
  rumble(strong, weak, ms) {
    const a = this.pad && this.pad.vibrationActuator;
    if (!a || this.device !== 'pad') return;
    try { a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* unsupported */ }
  },
  endFrame() {
    this.pressed.clear(); this.released.clear(); this.mPressed.clear();
    this.dx = 0; this.dy = 0;
  },
  glyph(a) {
    const pad = { interact: 'X', reload: 'Y', jump: 'A', dash: 'B', slash: 'RB', hookL: 'LT', hookR: 'RT', both: 'LB', journal: 'Start', map: 'View', confirm: 'A', back: 'B' };
    const kb = { interact: 'F', reload: 'R', jump: 'Space', dash: 'Shift', slash: 'LMB', hookL: 'Q', hookR: 'E', both: 'RMB', journal: 'Tab', map: 'M', confirm: 'Enter', back: 'Esc' };
    return (this.device === 'pad' ? pad : kb)[a] || a;
  },
};
