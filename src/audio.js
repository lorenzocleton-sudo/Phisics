// All sounds are synthesized with WebAudio, so the game ships without asset files.
export const Audio = {
  ctx: null, master: null, vol: 0.7,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
    } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.vol; this.master.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // looping beds: gas hiss + wind
    const loop = (type, freq, q) => {
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return { g, f };
    };
    this.gasBed = loop('bandpass', 2600, 0.8);
    this.windBed = loop('lowpass', 600, 0.5);
    // soft ambient drone
    this.drone = c.createGain(); this.drone.gain.value = 0.025; this.drone.connect(this.master);
    for (const f of [55, 82.4, 110.3]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lg = c.createGain(); lg.gain.value = 0.6; lfo.connect(lg);
      const og = c.createGain(); og.gain.value = 0.5; lg.connect(og.gain);
      o.connect(og); og.connect(this.drone); o.start(); lfo.start();
    }
  },
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; },
  env(node, t0, a, peak, dec) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
    node.connect(g); g.connect(this.master);
    return g;
  },
  noiseHit(t0, type, f0, f1, dur, peak, q = 1) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    s.connect(f); this.env(f, t0, 0.005, peak, dur);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  },
  tone(t0, type, f0, f1, dur, peak, a = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    this.env(o, t0, a, peak, dur);
    o.start(t0); o.stop(t0 + a + dur + 0.05);
  },
  play(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'hook': this.noiseHit(t, 'highpass', 3000, 1500, 0.09, 0.25); this.tone(t, 'square', 900, 200, 0.05, 0.05); break;
      case 'latch': this.tone(t, 'triangle', 420, 260, 0.08, 0.18); this.noiseHit(t, 'bandpass', 5000, 3000, 0.03, 0.15, 3); break;
      case 'slash': this.noiseHit(t, 'bandpass', 2500, 9000, 0.17, 0.35, 2); break;
      case 'cut': this.noiseHit(t, 'lowpass', 2500, 300, 0.18, 0.4); this.tone(t, 'sawtooth', 140, 60, 0.12, 0.12); break;
      case 'kill':
        this.tone(t, 'sine', 90, 30, 0.8, 0.6); this.noiseHit(t, 'lowpass', 1800, 120, 0.6, 0.5);
        this.tone(t + 0.02, 'triangle', 660, 520, 0.4, 0.08); break;
      case 'clang': this.tone(t, 'sine', 1250, 1200, 0.5, 0.2); this.tone(t, 'sine', 1870, 1820, 0.4, 0.12); this.noiseHit(t, 'highpass', 4000, 4000, 0.05, 0.2); break;
      case 'dash': this.noiseHit(t, 'bandpass', 900, 2200, 0.25, 0.35, 1.2); break;
      case 'jump': this.noiseHit(t, 'lowpass', 600, 300, 0.06, 0.08); break;
      case 'hurt': this.tone(t, 'sawtooth', 220, 70, 0.25, 0.25); this.noiseHit(t, 'lowpass', 900, 200, 0.2, 0.3); break;
      case 'grab': this.tone(t, 'sawtooth', 70, 50, 0.9, 0.3, 0.05); break;
      case 'reload': this.tone(t, 'square', 1200, 800, 0.03, 0.08); this.tone(t + 0.09, 'square', 900, 600, 0.04, 0.1); break;
      case 'thud': this.noiseHit(t, 'lowpass', 400, 80, 0.15, 0.4); break;
      case 'swoosh': this.noiseHit(t, 'lowpass', 300, 1400, 0.4, 0.35); break;
      case 'roarShort': this.roar(30, 9); break;
      case 'ui': this.tone(t, 'triangle', 880, 700, 0.05, 0.06); break;
      case 'coin': this.tone(t, 'triangle', 1320, 1300, 0.08, 0.1); this.tone(t + 0.07, 'triangle', 1760, 1750, 0.12, 0.1); break;
      case 'ring': this.tone(t, 'sine', 880, 880, 0.2, 0.15); this.tone(t + 0.06, 'sine', 1320, 1320, 0.25, 0.12); break;
      case 'quest': [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, 'triangle', f, f, 0.35, 0.12)); break;
      case 'level': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.07, 'square', f, f, 0.25, 0.06)); break;
      case 'bell': for (let i = 0; i < 4; i++) for (const m of [1, 2.41, 3.02]) this.tone(t + i * 0.9, 'sine', 330 * m, 330 * m, 2.2, 0.1 / m, 0.01); break;
      case 'gate': this.tone(t, 'sawtooth', 50, 40, 1.4, 0.15, 0.1); this.noiseHit(t, 'lowpass', 300, 100, 1.4, 0.2); break;
    }
  },
  roar(dist, H) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, c = this.ctx;
    const v = Math.min(0.5, (H / 12) * 0.45 / (1 + dist / 60));
    if (v < 0.01) return;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const base = 120 - H * 2.5;
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.7, t + 1.3);
    const lfo = c.createOscillator(); lfo.frequency.value = 9; const lg = c.createGain(); lg.gain.value = 8; lfo.connect(lg); lg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    o.connect(f); this.env(f, t, 0.15, v, 1.3);
    o.start(t); lfo.start(t); o.stop(t + 1.6); lfo.stop(t + 1.6);
  },
  step(dist, H) {
    if (!this.ctx) return;
    const v = Math.min(0.5, (H / 14) * 0.5 / (1 + dist / 35));
    if (v < 0.01) return;
    this.tone(this.ctx.currentTime, 'sine', 70 - H, 28, 0.35, v);
  },
  gas(level) { if (this.gasBed) this.gasBed.g.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.05); },
  wind(level) {
    if (!this.windBed) return;
    this.windBed.g.gain.setTargetAtTime(level * 0.25, this.ctx.currentTime, 0.1);
    this.windBed.f.frequency.setTargetAtTime(400 + level * 1400, this.ctx.currentTime, 0.1);
  },
};
