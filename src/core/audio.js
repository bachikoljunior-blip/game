/**
 * All sound is synthesised at runtime — zero audio assets, instant load, offline-safe.
 *
 * Layout:  [voices] -> sfxBus -\
 *                               >-- master(lowpass) -> comp -> out
 *          [music]  -> musBus -/
 *
 * The music is generative: a 4-chord loop in A-minor pentatonic whose layers
 * (pad / bass / arp / kick / hat) fade in with the run's intensity, so the
 * soundtrack escalates with the danger on screen.
 */
const A2 = 110;
const semi = (n) => A2 * Math.pow(2, n / 12);
// Am7 - Fmaj7 - Cmaj - G  (degrees from A2)
const PROG = [
  { root: 0, scale: [0, 3, 7, 10, 12, 15] },
  { root: -4, scale: [-4, 0, 3, 8, 12, 15] },
  { root: 3, scale: [3, 7, 10, 14, 15, 19] },
  { root: -2, scale: [-2, 2, 5, 10, 12, 14] },
];
const ARP = [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 5, 3, 4, 2];

export class Sound {
  constructor() {
    this.ready = false;
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musVol = 0.5;
    this.intensity = 0;      // 0..1 drives arrangement
    this.step = 0;           // 16th-note counter
    this.nextTime = 0;
    this.playing = false;
    this._budget = 0;
    this._lastBudgetT = 0;
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 8;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    comp.connect(ctx.destination);

    const master = ctx.createBiquadFilter();
    master.type = 'lowpass'; master.frequency.value = 20000; master.Q.value = 0.0001;
    master.connect(comp);
    this.master = master;

    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(master);
    this.musBus = ctx.createGain(); this.musBus.gain.value = 0; this.musBus.connect(master);

    // shared noise buffer
    const n = ctx.sampleRate * 1.2;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  get t() { return this.ctx.currentTime; }

  setVolumes(sfx, mus) {
    this.sfxVol = sfx; this.musVol = mus;
    if (!this.ready) return;
    this.sfxBus.gain.value = sfx;
    if (this.playing) this.musBus.gain.setTargetAtTime(mus, this.t, 0.2);
  }

  /** Muffle everything (pause / modal). */
  muffle(on) {
    if (!this.ready) return;
    this.master.frequency.setTargetAtTime(on ? 520 : 20000, this.t, 0.08);
  }
  duck(amount = 0.35, time = 0.5) {
    if (!this.ready || !this.playing) return;
    const g = this.musBus.gain, now = this.t;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.musVol * amount, now, 0.05);
    g.setTargetAtTime(this.musVol, now + time, 0.3);
  }

  /** Rough polyphony cap so 300 simultaneous hits don't melt the audio thread. */
  _grab(cost = 1) {
    if (!this.ready) return false;
    const now = this.t;
    if (now - this._lastBudgetT > 0.05) { this._budget = 0; this._lastBudgetT = now; }
    if (this._budget > 9) return false;
    this._budget += cost;
    return true;
  }

  _env(node, t, a, d, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g);
    return g;
  }

  _tone({ type = 'square', f0, f1, a = 0.004, d = 0.09, peak = 0.25, dest, when = 0, detune = 0 }) {
    const ctx = this.ctx, t = this.t + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
    if (detune) o.detune.value = detune;
    const g = this._env(o, t, a, d, peak);
    g.connect(dest || this.sfxBus);
    o.start(t); o.stop(t + a + d + 0.02);
    return o;
  }

  _noise({ f = 2000, q = 1, type = 'bandpass', a = 0.002, d = 0.08, peak = 0.3, f1, dest, when = 0 }) {
    const ctx = this.ctx, t = this.t + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = type; bp.frequency.setValueAtTime(f, t); bp.Q.value = q;
    if (f1) bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + a + d);
    s.connect(bp);
    const g = this._env(bp, t, a, d, peak);
    g.connect(dest || this.sfxBus);
    s.start(t, Math.random() * 0.4); s.stop(t + a + d + 0.02);
  }

  // ---------------- SFX ----------------
  shoot(pitch = 1, soft = false) {
    if (!this._grab()) return;
    this._tone({ type: soft ? 'triangle' : 'square', f0: 620 * pitch, f1: 190 * pitch, a: 0.002, d: soft ? 0.05 : 0.07, peak: soft ? 0.05 : 0.075 });
  }
  laser(pitch = 1) {
    if (!this._grab()) return;
    this._tone({ type: 'sawtooth', f0: 1400 * pitch, f1: 260 * pitch, a: 0.002, d: 0.13, peak: 0.075 });
    this._noise({ f: 3200, f1: 700, q: 2, a: 0.002, d: 0.1, peak: 0.05 });
  }
  hit(hard = false) {
    if (!this._grab()) return;
    this._noise({ f: hard ? 1500 : 2600, f1: hard ? 380 : 900, q: 1.1, a: 0.001, d: hard ? 0.075 : 0.04, peak: hard ? 0.14 : 0.06 });
  }
  crit() {
    if (!this._grab()) return;
    this._tone({ type: 'triangle', f0: 1900, f1: 3100, a: 0.002, d: 0.07, peak: 0.1 });
    this._noise({ f: 4200, f1: 1400, q: 1.4, a: 0.001, d: 0.06, peak: 0.09 });
  }
  kill() {
    if (!this._grab()) return;
    this._noise({ f: 1100, f1: 220, q: 0.8, a: 0.001, d: 0.11, peak: 0.1 });
    this._tone({ type: 'triangle', f0: 320, f1: 90, a: 0.002, d: 0.1, peak: 0.05 });
  }
  boom(size = 1) {
    if (!this._grab(2)) return;
    this._noise({ type: 'lowpass', f: 900 * size, f1: 90, q: 0.9, a: 0.003, d: 0.34 * size, peak: 0.3 });
    this._tone({ type: 'sine', f0: 160 * size, f1: 34, a: 0.004, d: 0.4 * size, peak: 0.28 });
  }
  pickup(step = 0) {
    if (!this._grab(0.5)) return;
    const f = semi(12 + (step % 8) * 2);
    this._tone({ type: 'triangle', f0: f * 2, f1: f * 3, a: 0.002, d: 0.055, peak: 0.055 });
  }
  coin() {
    if (!this._grab()) return;
    this._tone({ type: 'square', f0: 1180, a: 0.002, d: 0.05, peak: 0.05 });
    this._tone({ type: 'square', f0: 1760, a: 0.002, d: 0.09, peak: 0.045, when: 0.05 });
  }
  hurt() {
    if (!this._grab(3)) return;
    this._noise({ type: 'lowpass', f: 700, f1: 120, q: 1, a: 0.002, d: 0.26, peak: 0.34 });
    this._tone({ type: 'sawtooth', f0: 260, f1: 60, a: 0.003, d: 0.24, peak: 0.16 });
  }
  heal() {
    if (!this._grab()) return;
    [0, 4, 7, 12].forEach((s, i) => this._tone({ type: 'triangle', f0: semi(24 + s), a: 0.01, d: 0.3, peak: 0.06, when: i * 0.05 }));
  }
  levelUp() {
    if (!this.ready) return;
    this.duck(0.3, 0.7);
    [0, 7, 12, 19, 24].forEach((s, i) =>
      this._tone({ type: 'triangle', f0: semi(24 + s), a: 0.006, d: 0.5, peak: 0.11, when: i * 0.065 }));
    this._noise({ f: 5200, f1: 2400, q: 1.2, a: 0.01, d: 0.4, peak: 0.05 });
  }
  chest() {
    if (!this.ready) return;
    [0, 5, 9, 12, 17].forEach((s, i) =>
      this._tone({ type: 'square', f0: semi(24 + s), a: 0.004, d: 0.34, peak: 0.06, when: i * 0.07 }));
  }
  burst() {
    if (!this.ready) return;
    this._noise({ type: 'bandpass', f: 260, f1: 5200, q: 0.8, a: 0.09, d: 0.2, peak: 0.22 });
    this._tone({ type: 'sine', f0: 90, f1: 700, a: 0.06, d: 0.28, peak: 0.16 });
    this.boom(1.3);
  }
  ui(kind = 0) {
    if (!this.ready || !this._grab(0.5)) return;
    const f = kind === 1 ? 520 : kind === 2 ? 300 : 880;
    this._tone({ type: 'square', f0: f, f1: f * (kind === 2 ? 0.7 : 1.3), a: 0.002, d: 0.045, peak: 0.05 });
  }
  bossWarn() {
    if (!this.ready) return;
    for (let i = 0; i < 3; i++)
      this._tone({ type: 'sawtooth', f0: semi(-12), f1: semi(-13), a: 0.05, d: 0.5, peak: 0.16, when: i * 0.42 });
    this._noise({ type: 'lowpass', f: 400, f1: 100, q: 1, a: 0.3, d: 1.1, peak: 0.16 });
  }
  win() {
    if (!this.ready) return;
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) =>
      this._tone({ type: 'triangle', f0: semi(12 + s), a: 0.01, d: 0.8, peak: 0.1, when: i * 0.11 }));
  }
  lose() {
    if (!this.ready) return;
    [0, -2, -5, -12].forEach((s, i) =>
      this._tone({ type: 'sawtooth', f0: semi(12 + s), f1: semi(4 + s), a: 0.02, d: 0.9, peak: 0.12, when: i * 0.19 }));
  }

  // ---------------- generative music ----------------
  startMusic() {
    if (!this.ready || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.t + 0.08;
    this.musBus.gain.setTargetAtTime(this.musVol, this.t, 0.6);
  }
  stopMusic(fade = 0.5) {
    if (!this.ready || !this.playing) return;
    this.playing = false;
    this.musBus.gain.setTargetAtTime(0, this.t, fade * 0.4);
  }

  /** Schedule ahead; call every frame. */
  update(intensity) {
    if (!this.ready || !this.playing) return;
    this.intensity += (intensity - this.intensity) * 0.02;
    const bpm = 92 + this.intensity * 34;
    const spb = 60 / bpm / 4;           // 16th note
    const look = this.t + 0.22;
    let guard = 0;
    while (this.nextTime < look && guard++ < 32) {
      this._note(this.nextTime, this.step);
      this.nextTime += spb;
      this.step++;
    }
  }

  _note(t, step) {
    const ctx = this.ctx, I = this.intensity;
    const bar = (step >> 4) % 4;
    const s16 = step & 15;
    const ch = PROG[bar];
    const dest = this.musBus;

    // pad: retrigger at the top of each bar
    if (s16 === 0) {
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = semi(ch.root + 12 + i * 7);
        o.detune.value = i ? 8 : -8;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 520 + I * 900; f.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        o.connect(f); f.connect(g); g.connect(dest);
        o.start(t); o.stop(t + 2.3);
      }
    }
    // bass: root pulse
    if (s16 % 4 === 0 || (I > 0.35 && s16 % 8 === 6)) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(semi(ch.root - 12), t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.28);
    }
    // arp
    if (I > 0.16 && (s16 % 2 === 0 || I > 0.62)) {
      const n = ch.scale[ARP[step % ARP.length] % ch.scale.length];
      const o = ctx.createOscillator();
      o.type = I > 0.7 ? 'square' : 'triangle';
      o.frequency.value = semi(n + 24);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1800 + I * 3200;
      const g = ctx.createGain();
      const peak = 0.028 + I * 0.03;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(f); f.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.16);
    }
    // kick
    if (I > 0.3 && (s16 === 0 || s16 === 8 || (I > 0.6 && s16 === 11))) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.2);
    }
    // hat
    if (I > 0.45 && s16 % 4 === 2) {
      const s = ctx.createBufferSource();
      s.buffer = this.noise; s.playbackRate.value = 1.8;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05 * (0.6 + I * 0.6), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(t, Math.random() * 0.3); s.stop(t + 0.06);
    }
  }
}

export const sound = new Sound();
