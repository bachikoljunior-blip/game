/**
 * Particles & floating text.
 * One pool, one pass, colour-batched paths — a few thousand sparks stay cheap.
 */
import { Pool } from '../core/pool.js';
import { TAU, clamp } from '../core/util.js';

const SPARK = 0, DEBRIS = 1, RING = 2, BLAST = 3, TEXT = 4, TRAIL = 5;

const make = () => ({
  alive: false, t: SPARK, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1,
  r: 1, r2: 0, color: '#fff', rot: 0, spin: 0, drag: 0.9, txt: '', size: 12, crit: false, sides: 3,
});

export class Fx {
  constructor(rng) {
    this.rng = rng;
    this.pool = new Pool(make, 512);
    this.cap = 1400;
    this.textCount = 0;
    this._buckets = new Map();
  }
  get count() { return this.pool.count; }
  clear() { this.pool.clear(); this.textCount = 0; }
  setCap(n) { this.cap = n; }

  _p(type) {
    const p = this.pool.spawn();
    p.t = type; p.rot = 0; p.spin = 0; p.drag = 0.9; p.r2 = 0; p.crit = false;
    return p;
  }

  spark(x, y, n, color, speed = 160, life = 0.4) {
    if (this.pool.count > this.cap) n = Math.max(1, n >> 2);
    for (let i = 0; i < n; i++) {
      const a = this.rng.angle(), s = speed * (0.35 + this.rng.f() * 0.9);
      const p = this._p(SPARK);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.max = life * (0.6 + this.rng.f() * 0.8);
      p.r = 1.4 + this.rng.f() * 1.9; p.color = color; p.drag = 0.86;
    }
  }
  cone(x, y, dirX, dirY, n, color, speed = 220, spread = 0.9) {
    if (this.pool.count > this.cap) n = Math.max(1, n >> 1);
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = base + (this.rng.f() - 0.5) * spread;
      const s = speed * (0.4 + this.rng.f());
      const p = this._p(SPARK);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.max = 0.28 + this.rng.f() * 0.3;
      p.r = 1.2 + this.rng.f() * 1.8; p.color = color; p.drag = 0.9;
    }
  }
  debris(x, y, n, color, size = 5, sides = 3, speed = 150) {
    if (this.pool.count > this.cap) n = Math.max(1, n >> 1);
    for (let i = 0; i < n; i++) {
      const a = this.rng.angle(), s = speed * (0.4 + this.rng.f());
      const p = this._p(DEBRIS);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.max = 0.5 + this.rng.f() * 0.5;
      p.r = size * (0.5 + this.rng.f() * 0.7); p.color = color;
      p.rot = this.rng.angle(); p.spin = (this.rng.f() - 0.5) * 16; p.sides = sides; p.drag = 0.9;
    }
  }
  ring(x, y, r, color, life = 0.35, width = 2.5) {
    const p = this._p(RING);
    p.x = x; p.y = y; p.r = r * 0.25; p.r2 = r; p.color = color;
    p.life = p.max = life; p.size = width;
  }
  blast(x, y, r, color, life = 0.28) {
    const p = this._p(BLAST);
    p.x = x; p.y = y; p.r = r; p.color = color; p.life = p.max = life;
  }
  trail(x, y, color, size = 3, life = 0.3) {
    if (this.pool.count > this.cap) return;
    const p = this._p(TRAIL);
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.r = size; p.color = color; p.life = p.max = life;
  }
  dmg(x, y, value, crit) {
    if (this.textCount > 30 && !crit) return;
    const p = this._p(TEXT);
    p.x = x + (this.rng.f() - 0.5) * 10; p.y = y - 6;
    p.vx = (this.rng.f() - 0.5) * 30; p.vy = -58 - this.rng.f() * 22;
    p.life = p.max = crit ? 0.85 : 0.6;
    p.txt = value < 10 ? value.toFixed(0) : Math.round(value).toString();
    p.crit = crit; p.size = crit ? 19 : 13; p.color = crit ? '#ffd85c' : '#ffffff';
    this.textCount++;
  }
  heal(x, y, txt) {
    const p = this._p(TEXT);
    p.x = x; p.y = y - 14; p.vx = 0; p.vy = -40;
    p.life = p.max = 0.9; p.txt = txt; p.size = 15; p.color = '#7dffb0';
    this.textCount++;
  }

  update(dt) {
    const L = this.pool.live;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; if (p.t === TEXT) this.textCount--; continue; }
      if (p.t === RING) { p.r += (p.r2 - p.r) * Math.min(1, dt * 12); continue; }
      if (p.t === BLAST || p.t === TRAIL) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.drag) { const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; }
      if (p.t === DEBRIS) p.rot += p.spin * dt;
    }
    this.pool.trim(this.cap + 400);
    this.pool.sweep();
  }

  draw(ctx, r) {
    const L = this.pool.live;
    if (!L.length) return;
    const B = this._buckets;
    B.clear();
    ctx.globalCompositeOperation = 'lighter';

    // pass 1: additive shapes
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      const k = p.life / p.max;
      switch (p.t) {
        case SPARK:
        case TRAIL: {
          let b = B.get(p.color);
          if (!b) { b = []; B.set(p.color, b); }
          b.push(p.x, p.y, p.r * (p.t === TRAIL ? k : 0.35 + k * 0.75), k);
          break;
        }
        case DEBRIS:
          ctx.globalAlpha = clamp(k * 1.2, 0, 1);
          r.poly(p.x, p.y, p.r * (0.4 + k * 0.6), p.sides, p.rot, p.color, null, 1);
          break;
        case RING:
          ctx.globalAlpha = clamp(k * 1.1, 0, 1);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * (0.35 + k * 0.9);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
          break;
        case BLAST: {
          const rr = p.r * (1.25 - k * 0.35);
          r.glow(p.x, p.y, rr, p.color, clamp(k * 1.3, 0, 1));
          break;
        }
      }
    }
    // batched dots
    ctx.globalAlpha = 1;
    for (const [color, arr] of B) {
      // draw in two alpha bands so fading still reads without per-dot state changes
      for (let band = 0; band < 2; band++) {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < arr.length; i += 4) {
          const a = arr[i + 3];
          if (band === 0 ? a < 0.5 : a >= 0.5) continue;
          const rr = arr[i + 2];
          ctx.moveTo(arr[i] + rr, arr[i + 1]);
          ctx.arc(arr[i], arr[i + 1], rr, 0, TAU);
          any = true;
        }
        if (any) {
          ctx.globalAlpha = band === 0 ? 0.85 : 0.35;
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Damage numbers draw on top, in screen-ish scale so they stay readable. */
  drawText(ctx, r) {
    const L = this.pool.live;
    const inv = 1 / r.scale;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (p.t !== TEXT) continue;
      const k = p.life / p.max;
      const a = k > 0.7 ? 1 : k / 0.7;
      const size = p.size * inv * (p.crit ? 1 + (1 - k) * 0.25 : 1);
      ctx.globalAlpha = a;
      ctx.font = `800 ${size}px ui-sans-serif,system-ui,sans-serif`;
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = 'rgba(3,6,14,.85)';
      ctx.strokeText(p.txt, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.txt, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
