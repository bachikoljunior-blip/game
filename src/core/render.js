/**
 * Canvas2D renderer.
 *
 * Everything is drawn once into the main buffer; the neon "bloom" is a
 * post-process (downscale -> blur -> additive composite). Because the art
 * direction keeps the background near-black, an un-thresholded additive blur
 * behaves like a real bloom: only bright shapes bleed.
 *
 * Two transforms are exposed:
 *   world()  — world units, camera applied (+ shake)
 *   screen() — CSS pixels, top-left origin (HUD-space canvas bits)
 */
import { clamp, damp, TAU, rgba } from './util.js';

/**
 * Quality tiers. `auto` walks between them based on measured frame time, so a
 * flagship gets the full glow and a budget phone still holds 60fps.
 * The dominant per-pixel cost is the bloom composite, hence the dpr cap steps.
 */
const QUALITY = {
  high: { dprCap: 2, bloomScale: 0.25, blur: 2.2, bloomAlpha: 0.72, wide: 0.3, starLayers: 3, maxParticles: 1500, grid: true, trails: true },
  mid: { dprCap: 1.5, bloomScale: 0.22, blur: 2, bloomAlpha: 0.7, wide: 0, starLayers: 2, maxParticles: 800, grid: true, trails: true },
  low: { dprCap: 1.1, bloomScale: 0.2, blur: 1.6, bloomAlpha: 0.62, wide: 0, starLayers: 1, maxParticles: 400, grid: false, trails: false },
};
const TIERS = ['low', 'mid', 'high'];

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.bl = document.createElement('canvas');
    this.blc = this.bl.getContext('2d', { alpha: false });
    this.bl2 = document.createElement('canvas');
    this.bl2c = this.bl2.getContext('2d', { alpha: false });
    this.q = { ...QUALITY.high };
    this.mode = 'high';
    this.canFilter = this._testFilter();
    this.w = 1; this.h = 1; this.dpr = 1; this.scale = 1;
    this.cam = { x: 0, y: 0, tx: 0, ty: 0 };
    this.shakeMag = 0; this.shakeX = 0; this.shakeY = 0; this.shakeSeed = 0;
    this.tint = 0;              // 0..1 threat colouring of the backdrop
    this.time = 0;
    this._frames = 0; this._acc = 0; this._slow = 0; this._fast = 0;
    this.fps = 60;
    this.autoQuality = true;
    this.resize();
  }

  _testFilter() {
    try {
      const c = document.createElement('canvas').getContext('2d');
      c.filter = 'blur(2px)';
      return c.filter !== 'none' && c.filter !== '';
    } catch (e) { return false; }
  }

  setQuality(mode) {
    this.autoQuality = mode === 'auto';
    const m = QUALITY[mode] ? mode : 'high';
    this._setTier(m);
  }
  _setTier(m) {
    if (this.mode === m) return;
    this.mode = m;
    this.q = { ...QUALITY[m] };
    this.onQuality && this.onQuality(m);
    this.resize();
  }
  _degrade() { this._setTier(TIERS[Math.max(0, TIERS.indexOf(this.mode) - 1)]); }
  _upgrade() { this._setTier(TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(this.mode) + 1)]); }

  resize() {
    const w = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
    const h = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
    const dpr = clamp(window.devicePixelRatio || 1, 1, this.q.dprCap);
    this.w = w; this.h = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    // Bloom buffers (blurring happens at this reduced size — that is what keeps it cheap)
    const bw = Math.max(2, Math.round(this.cv.width * this.q.bloomScale));
    const bh = Math.max(2, Math.round(this.cv.height * this.q.bloomScale));
    this.bl.width = bw; this.bl.height = bh;
    this.bl2.width = bw; this.bl2.height = bh;
    // World scale: consistent play area regardless of device, capped on the long axis.
    const mn = Math.min(w, h), mx = Math.max(w, h);
    let s = mn / 470;
    if (mx / s > 1080) s = mx / 1080;
    this.scale = s;
    this.viewW = w / s; this.viewH = h / s;
    this.ctx.imageSmoothingEnabled = true;
  }

  /** Half-extent of the visible world plus margin — used for spawn rings & culling. */
  viewRadius(margin = 60) { return Math.hypot(this.viewW, this.viewH) * 0.5 + margin; }

  snapCam(x, y) { this.cam.x = this.cam.tx = x; this.cam.y = this.cam.ty = y; }
  follow(x, y, vx = 0, vy = 0) {
    this.cam.tx = x + vx * 0.16;
    this.cam.ty = y + vy * 0.16;
  }
  shake(mag) { this.shakeMag = Math.min(28, this.shakeMag + mag); }

  update(dt) {
    this.time += dt;
    this.cam.x = damp(this.cam.x, this.cam.tx, 7.5, dt);
    this.cam.y = damp(this.cam.y, this.cam.ty, 7.5, dt);
    if (this.shakeMag > 0.05) {
      this.shakeSeed += dt * 42;
      const m = this.shakeMag;
      this.shakeX = Math.sin(this.shakeSeed * 1.7) * m + Math.sin(this.shakeSeed * 4.3) * m * 0.4;
      this.shakeY = Math.cos(this.shakeSeed * 2.1) * m + Math.cos(this.shakeSeed * 5.1) * m * 0.35;
      this.shakeMag *= Math.pow(0.0016, dt);
    } else { this.shakeMag = 0; this.shakeX = this.shakeY = 0; }
  }

  /** Frame-time watchdog for `auto` quality. */
  sample(ms) {
    this._acc += ms; this._frames++;
    if (this._frames >= 30) {
      const avg = this._acc / this._frames;
      this.fps = 1000 / Math.max(1, avg);
      this._acc = 0; this._frames = 0;
      if (!this.autoQuality) return;
      if (avg > 20) { this._slow++; this._fast = 0; } else if (avg < 11) { this._fast++; this._slow = 0; }
      if (this._slow >= 2) { this._degrade(); this._slow = 0; }
      if (this._fast >= 20) { this._upgrade(); this._fast = 0; }
    }
  }

  world() {
    const s = this.scale * this.dpr;
    this.ctx.setTransform(s, 0, 0, s,
      this.dpr * (this.w * 0.5 + this.shakeX) - this.cam.x * s,
      this.dpr * (this.h * 0.5 + this.shakeY) - this.cam.y * s);
  }
  screen() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  // ---------------------------------------------------------------- background
  begin() {
    const ctx = this.ctx;
    this.screen();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const g = this._bg || (this._bg = null);
    // gradient cached per size+tint bucket
    const key = `${this.w}x${this.h}x${(this.tint * 8) | 0}`;
    if (this._bgKey !== key) {
      const grad = ctx.createLinearGradient(0, 0, this.w * 0.35, this.h);
      const t = this.tint;
      grad.addColorStop(0, `rgb(${5 + t * 16},${7 + t * 3},${16 + t * 6})`);
      grad.addColorStop(0.55, `rgb(${4 + t * 12},${6 + t * 2},${13 + t * 8})`);
      grad.addColorStop(1, `rgb(${2 + t * 10},${3 + t * 2},${9 + t * 5})`);
      this._bgGrad = grad; this._bgKey = key;
    }
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(0, 0, this.w, this.h);
    this._stars();
  }

  _stars() {
    const ctx = this.ctx;
    const layers = this.q.starLayers;
    this.world();
    const cx = this.cam.x, cy = this.cam.y;
    const hw = this.viewW * 0.5 + 40, hh = this.viewH * 0.5 + 40;

    if (this.q.grid) {
      // faint drifting lattice
      const step = 128;
      const ox = -((cx * 0.5) % step), oy = -((cy * 0.5) % step);
      ctx.lineWidth = 1 / this.scale;
      ctx.strokeStyle = `rgba(90,150,230,${0.045 + this.tint * 0.03})`;
      ctx.beginPath();
      for (let x = cx - hw + ox - step; x < cx + hw + step; x += step) {
        ctx.moveTo(x, cy - hh); ctx.lineTo(x, cy + hh);
      }
      for (let y = cy - hh + oy - step; y < cy + hh + step; y += step) {
        ctx.moveTo(cx - hw, y); ctx.lineTo(cx + hw, y);
      }
      ctx.stroke();
    }

    for (let L = 0; L < layers; L++) {
      const par = 0.22 + L * 0.3;         // parallax factor
      const cell = 150 - L * 34;
      const px = cx * par, py = cy * par;
      const x0 = Math.floor((px - hw) / cell), x1 = Math.ceil((px + hw) / cell);
      const y0 = Math.floor((py - hh) / cell), y1 = Math.ceil((py + hh) / cell);
      const size = (0.9 + L * 0.75) / 1;
      ctx.fillStyle = L === 2 ? `rgba(190,225,255,0.5)` : L === 1 ? `rgba(150,200,255,0.32)` : `rgba(120,170,230,0.2)`;
      ctx.beginPath();
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          let hsh = (gx * 374761393 + gy * 668265263 + L * 1013904223) | 0;
          hsh = (hsh ^ (hsh >> 13)) * 1274126177;
          hsh = hsh ^ (hsh >> 16);
          const a = (hsh & 1023) / 1023, b = ((hsh >> 10) & 1023) / 1023, c = ((hsh >> 20) & 255) / 255;
          if (c < 0.42) continue;
          const wx = (gx + a) * cell, wy = (gy + b) * cell;
          const sx = wx + cx * (1 - par), sy = wy + cy * (1 - par);
          const tw = 0.65 + 0.35 * Math.sin(this.time * 1.4 + a * 40);
          const r = size * tw;
          ctx.moveTo(sx + r, sy);
          ctx.arc(sx, sy, r, 0, TAU);
        }
      }
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ bloom
   * Two-pass neon glow.
   *
   * The scene is drawn a second time into a quarter-resolution buffer, blurred
   * *at that size* (2px there ≈ 8px here) and added back on top. Rendering the
   * glow layer separately is much cheaper than reading the main framebuffer
   * back — and it means the backdrop never blooms, so only the neon glows.
   *
   *   glowBegin() -> world() -> draw scene -> glowEnd() -> [main pass] -> bloom()
   */
  glowBegin() {
    if (this.q.bloomAlpha <= 0) return false;
    this._mainCtx = this.ctx;
    this._mainDpr = this.dpr;
    this.ctx = this.blc;
    this.dpr = this._mainDpr * this.q.bloomScale;
    const c = this.blc;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.bl.width, this.bl.height);
    return true;
  }
  glowEnd() {
    if (!this._mainCtx) return;
    this.ctx = this._mainCtx;
    this.dpr = this._mainDpr;
    this._mainCtx = null;
    if (this.canFilter && this.q.blur > 0) {
      const b2 = this.bl2c;
      b2.setTransform(1, 0, 0, 1, 0, 0);
      b2.globalCompositeOperation = 'copy';
      b2.globalAlpha = 1;
      b2.filter = `blur(${this.q.blur}px)`;
      b2.drawImage(this.bl, 0, 0);
      b2.filter = 'none';
      b2.globalCompositeOperation = 'source-over';
      this._bloomSrc = this.bl2;
    } else {
      this._bloomSrc = this.bl;
    }
  }
  /** Additively composite the blurred glow layer over the finished frame. */
  bloom() {
    const q = this.q;
    if (q.bloomAlpha <= 0 || !this._bloomSrc) return;
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = q.bloomAlpha;
    ctx.drawImage(this._bloomSrc, 0, 0, W, H);
    if (q.wide > 0) {                      // wider, dimmer halo
      const ox = W * 0.05, oy = H * 0.05;
      ctx.globalAlpha = q.bloomAlpha * q.wide;
      ctx.drawImage(this._bloomSrc, -ox, -oy, W + ox * 2, H + oy * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- primitives
  /** Soft radial light. Cached gradients per (color,bucket) to avoid churn. */
  glow(x, y, r, color, alpha = 1) {
    const ctx = this.ctx;
    const key = color + '|' + ((r * 4) | 0);
    let g = (this._glowCache || (this._glowCache = new Map())).get(key);
    if (!g) {
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, rgba(color, 0.9));
      g.addColorStop(0.42, rgba(color, 0.32));
      g.addColorStop(1, rgba(color, 0));
      this._glowCache.set(key, g);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  ring(x, y, r, color, width = 2, alpha = 1) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Regular polygon / star. sides>=3; spike<1 makes a star. */
  poly(x, y, r, sides, rot, fill, stroke, spike = 1, lw = 1.6) {
    const ctx = this.ctx;
    ctx.beginPath();
    const n = spike < 1 ? sides * 2 : sides;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const rr = spike < 1 && i & 1 ? r * spike : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  text(str, x, y, size, color, align = 'center', weight = 800, alpha = 1) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.font = `${weight} ${size}px ui-sans-serif,system-ui,sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }
}
