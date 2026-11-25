export const Input = {
  keys: new Set(), pressed: new Set(), released: new Set(),
  mb: new Set(), mPressed: new Set(), mReleased: new Set(),
  dx: 0, dy: 0, locked: false, canvas: null, onLockChange: null, onKey: null,
  init(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mb.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.free) return;
      this.mb.add(e.button); this.mPressed.add(e.button);
    });
    addEventListener('mouseup', (e) => { this.mb.delete(e.button); this.mReleased.add(e.button); });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked && !this.free) return;
      this.dx += e.movementX || 0; this.dy += e.movementY || 0;
    });
    document.addEventListener('pointerlockerror', () => {
      this.fails++;
      if (this.fails >= 2) this.free = true; // embedded views that refuse pointer lock get free mouse-look
    });
    if (!canvas.requestPointerLock) this.free = true;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.fails = 0;
      if (!this.locked) this.mb.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  },
  free: false, fails: 0,
  lock() {
    if (this.free || this.locked) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { this.fails++; }
  },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  down(c) { return this.keys.has(c); },
  hit(c) { return this.pressed.has(c); },
  mdown(b) { return this.mb.has(b); },
  mhit(b) { return this.mPressed.has(b); },
  endFrame() {
    this.pressed.clear(); this.released.clear(); this.mPressed.clear(); this.mReleased.clear();
    this.dx = 0; this.dy = 0;
  },
};
