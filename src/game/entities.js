/**
 * Non-enemy world entities: player bullets, enemy bullets, shockwaves,
 * ground zones, beam flashes, XP gems and item drops.
 * Every function is a plain (g, dt) system operating on pools owned by Game.
 */
import { TAU, clamp, dist2 } from '../core/util.js';

/* -------------------------------------------------------------- factories */
export const mkBullet = () => ({
  alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 6, dmg: 1, life: 1, max: 1,
  kind: 'bolt', color: '#fff', beh: 'straight', pierce: 0, wid: '', knock: 0,
  turn: 0, tgt: null, ret: 0, hits: new Set(), rot: 0, len: 0, spin: 0,
  range: 0, dist: 0, back: false, burst: 0, hitCd: 0, seed: 0,
});
export const mkEBullet = () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 6, dmg: 5, life: 4, color: '#f8f', rot: 0, spin: 0 });
export const mkWave = () => ({ alive: false, x: 0, y: 0, r: 0, maxR: 100, speed: 200, dmg: 1, knock: 0, color: '#fff', wid: '', hits: new Set(), width: 8, delay: 0 });
export const mkZone = () => ({ alive: false, x: 0, y: 0, r: 30, dps: 1, life: 3, max: 3, color: '#f80', wid: '', pull: 0, t: 0 });
export const mkBeam = () => ({ alive: false, pts: [], life: 0.2, max: 0.2, color: '#fff', glow: '#fff', width: 8 });
export const mkGem = () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, v: 1, tier: 0, t: 0, pull: false });
export const mkDrop = () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, kind: 'heart', t: 0, life: 30 });

/* ---------------------------------------------------------- player bullets */
export function updateBullets(g, dt) {
  const L = g.bullets.live;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    b.life -= dt;
    if (b.life <= 0) { killBullet(g, b, false); continue; }

    switch (b.beh) {
      case 'home': {
        b.ret -= dt;
        if (b.ret <= 0 || !b.tgt || !b.tgt.alive) {
          b.ret = 0.1;
          b.tgt = g.nearest(b.x, b.y, 420);
        }
        if (b.tgt) {
          const want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          let d = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
          const step = clamp(d, -b.turn * dt, b.turn * dt);
          const sp = Math.hypot(b.vx, b.vy);
          const na = cur + step;
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
        break;
      }
      case 'rang': {
        b.dist += Math.hypot(b.vx, b.vy) * dt;
        if (!b.back && b.dist > b.range) b.back = true;
        if (b.back) {
          const dx = g.p.x - b.x, dy = g.p.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = Math.hypot(b.vx, b.vy);
          b.vx += (dx / d) * sp * 5.5 * dt;
          b.vy += (dy / d) * sp * 5.5 * dt;
          const s2 = Math.hypot(b.vx, b.vy);
          if (s2 > sp * 1.35) { b.vx *= (sp * 1.35) / s2; b.vy *= (sp * 1.35) / s2; }
          if (d < 18 && b.life < b.max - 0.35) { killBullet(g, b, false); continue; }
        }
        b.rot += b.spin * dt;
        break;
      }
      default:
        b.rot = Math.atan2(b.vy, b.vx);
    }

    b.x += b.vx * dt; b.y += b.vy * dt;

    if (b.kind === 'bolt' && g.r.q.trails && (i & 1) === (g.frame & 1)) g.fx.trail(b.x, b.y, b.color, b.r * 0.5, 0.22);

    // ---- collision
    let dead = false;
    g.egrid.query(b.x, b.y, b.r + 26, (e) => {
      if (dead || !e.alive) return;
      const rr = b.r + e.r;
      if (dist2(b.x, b.y, e.x, e.y) > rr * rr) return;
      if (b.hitCd > 0) {
        if (!g.lock(e, b.wid, b.hitCd)) return;
      } else {
        if (b.hits.has(e.uid)) return;
        b.hits.add(e.uid);
      }
      const sp = Math.hypot(b.vx, b.vy) || 1;
      g.hurt(e, b.dmg, { knock: b.knock, kx: b.vx / sp, ky: b.vy / sp, wid: b.wid });
      g.fx.cone(b.x, b.y, -b.vx, -b.vy, 3, b.color, 130, 1.4);
      if (b.burst > 0) {
        g.aoe(b.x, b.y, b.burst, b.dmg * 0.55, { knock: 60, wid: b.wid + 'b' });
        g.fx.blast(b.x, b.y, b.burst, b.color, 0.22);
      }
      if (b.hitCd <= 0) {
        if (b.pierce <= 0) { dead = true; }
        else b.pierce--;
      }
    });
    if (dead) { killBullet(g, b, true); continue; }

    // cull once well outside the play area (player-relative, not camera-relative)
    if (Math.abs(b.x - g.p.x) > g.cullR || Math.abs(b.y - g.p.y) > g.cullR) killBullet(g, b, false);
  }
  g.bullets.sweep();
}

function killBullet(g, b, impact) {
  b.alive = false;
  b.hits.clear();
  b.tgt = null;
  if (impact) g.fx.spark(b.x, b.y, 4, b.color, 120, 0.28);
}

export function drawBullets(g, ctx, r) {
  const L = g.bullets.live;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    switch (b.kind) {
      case 'bolt':
        r.glow(b.x, b.y, b.r * 3.4, b.color, 0.9);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU); ctx.fill();
        break;
      case 'lance': {
        const c = Math.cos(b.rot), s = Math.sin(b.rot);
        const L2 = b.len, w = b.r * 0.5;
        r.glow(b.x, b.y, b.r * 3, b.color, 0.7);
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.moveTo(b.x + c * L2, b.y + s * L2);
        ctx.lineTo(b.x - s * w, b.y + c * w);
        ctx.lineTo(b.x - c * L2 * 0.5, b.y - s * L2 * 0.5);
        ctx.lineTo(b.x + s * w, b.y - c * w);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'dot':
        r.glow(b.x, b.y, b.r * 3, b.color, 0.8);
        ctx.fillStyle = '#f4ffe6';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, TAU); ctx.fill();
        break;
      case 'rang': {
        r.glow(b.x, b.y, b.r * 2.2, b.color, 0.55);
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.strokeStyle = b.color; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let k = 0; k < 2; k++) {
          const a = k * Math.PI;
          ctx.moveTo(Math.cos(a) * b.r * 0.25, Math.sin(a) * b.r * 0.25);
          ctx.arc(0, 0, b.r, a, a + 1.15);
        }
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ----------------------------------------------------------- enemy bullets */
export function updateEBullets(g, dt) {
  const L = g.ebullets.live;
  const p = g.p;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.rot += b.spin * dt;
    if (b.life <= 0) { b.alive = false; continue; }
    const rr = b.r + p.r * 0.8;
    if (dist2(b.x, b.y, p.x, p.y) < rr * rr) {
      g.hitPlayer(b.dmg);
      g.fx.spark(b.x, b.y, 6, b.color, 150);
      b.alive = false; continue;
    }
    if (Math.abs(b.x - g.p.x) > g.cullR || Math.abs(b.y - g.p.y) > g.cullR) b.alive = false;
  }
  g.ebullets.sweep();
}
export function drawEBullets(g, ctx, r) {
  const L = g.ebullets.live;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    r.glow(b.x, b.y, b.r * 3.2, b.color, 0.85);
    r.poly(b.x, b.y, b.r, 4, b.rot, '#ffffff', b.color, 0.62, 1.2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* --------------------------------------------------------------- shockwaves */
export function updateWaves(g, dt) {
  const L = g.waves.live;
  for (let i = 0; i < L.length; i++) {
    const w = L[i];
    if (w.delay > 0) { w.delay -= dt; continue; }
    w.r += w.speed * dt;
    if (w.r >= w.maxR) { w.alive = false; w.hits.clear(); continue; }
    const inner = Math.max(0, w.r - w.width * 2.2);
    g.egrid.query(w.x, w.y, w.r + 20, (e) => {
      if (!e.alive || w.hits.has(e.uid)) return;
      const d = Math.hypot(e.x - w.x, e.y - w.y);
      if (d > w.r + e.r || d < inner - e.r) return;
      w.hits.add(e.uid);
      const dx = (e.x - w.x) / (d || 1), dy = (e.y - w.y) / (d || 1);
      g.hurt(e, w.dmg, { knock: w.knock, kx: dx, ky: dy, wid: w.wid });
    });
  }
  g.waves.sweep();
}
export function drawWaves(g, ctx, r) {
  const L = g.waves.live;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < L.length; i++) {
    const w = L[i];
    if (w.delay > 0) continue;
    const k = 1 - w.r / w.maxR;
    ctx.globalAlpha = clamp(k * 1.15, 0, 1);
    ctx.strokeStyle = w.color;
    ctx.lineWidth = w.width * (0.35 + k);
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = clamp(k * 0.4, 0, 1);
    ctx.lineWidth = w.width * 2.6 * k;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* -------------------------------------------------------------- ground zones */
export function updateZones(g, dt) {
  const L = g.zones.live;
  for (let i = 0; i < L.length; i++) {
    const z = L[i];
    z.life -= dt; z.t += dt;
    if (z.life <= 0) { z.alive = false; continue; }
    const tick = 0.22;
    g.egrid.query(z.x, z.y, z.r + 24, (e) => {
      if (!e.alive) return;
      const rr = z.r + e.r * 0.6;
      if (dist2(z.x, z.y, e.x, e.y) > rr * rr) return;
      if (z.pull) {
        const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy) || 1;
        e.px += (dx / d) * z.pull * dt; e.py += (dy / d) * z.pull * dt;
      }
      if (g.lock(e, z.wid, tick)) g.hurt(e, z.dps * tick, { wid: z.wid, quiet: true });
    });
    if (g.rng.f() < dt * 22 * (z.r / 60)) {
      const a = g.rng.angle(), rr = Math.sqrt(g.rng.f()) * z.r;
      g.fx.trail(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, z.color, 2.4 + g.rng.f() * 2, 0.45);
    }
  }
  g.zones.sweep();
}
export function drawZones(g, ctx, r) {
  const L = g.zones.live;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < L.length; i++) {
    const z = L[i];
    const k = clamp(z.life / z.max, 0, 1);
    const pulse = 0.86 + Math.sin(z.t * 7) * 0.08;
    ctx.globalAlpha = 0.22 * k;
    ctx.fillStyle = z.color;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * pulse, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.55 * k;
    ctx.strokeStyle = z.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * pulse, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* --------------------------------------------------------------- beam flashes */
export function updateBeams(g, dt) {
  const L = g.beams.live;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    b.life -= dt;
    if (b.life <= 0) b.alive = false;
  }
  g.beams.sweep();
}
export function drawBeams(g, ctx, r) {
  const L = g.beams.live;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    const k = b.life / b.max;
    const p = b.pts;
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = pass ? k : k * 0.35;
      ctx.strokeStyle = pass ? b.color : b.glow;
      ctx.lineWidth = pass ? b.width * k * 0.35 : b.width * (0.6 + k * 0.8);
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let j = 2; j < p.length; j += 2) ctx.lineTo(p[j], p[j + 1]);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------------------------------------------------------------- XP gems */
const GEM_COLORS = ['#7dffb0', '#63f4ff', '#c7a2ff'];
export function updateGems(g, dt) {
  const L = g.gems.live;
  const p = g.p;
  const mr = g.st.magnet;
  const mr2 = mr * mr;
  for (let i = 0; i < L.length; i++) {
    const gm = L[i];
    gm.t += dt;
    const dx = p.x - gm.x, dy = p.y - gm.y;
    const d2 = dx * dx + dy * dy;
    if (gm.pull || d2 < mr2) {
      gm.pull = true;
      const d = Math.sqrt(d2) || 1;
      const sp = 260 + 900 / Math.max(28, d);
      gm.vx += (dx / d) * sp * dt * 6;
      gm.vy += (dy / d) * sp * dt * 6;
      const s = Math.hypot(gm.vx, gm.vy);
      if (s > 760) { gm.vx *= 760 / s; gm.vy *= 760 / s; }
    } else {
      gm.vx *= Math.pow(0.02, dt); gm.vy *= Math.pow(0.02, dt);
      // Stragglers home in after a few seconds: XP you earned is XP you get,
      // without forcing the player back into a swarm for it. It also keeps the
      // gem population bounded no matter how fast you are killing things.
      if (gm.t > 7) gm.pull = true;
      else if (gm.t > 4) {
        const d = Math.sqrt(d2) || 1;
        const creep = Math.min(150, 26 + (gm.t - 4) * 22);
        gm.vx += (dx / d) * creep * dt;
        gm.vy += (dy / d) * creep * dt;
      }
    }
    gm.x += gm.vx * dt; gm.y += gm.vy * dt;
    if (d2 < 20 * 20) { g.collectGem(gm); gm.alive = false; }
  }
  g.gems.sweep();
}
export function drawGems(g, ctx, r) {
  const L = g.gems.live;
  if (!L.length) return;
  ctx.globalCompositeOperation = 'lighter';
  // batch by tier
  for (let tier = 0; tier < 3; tier++) {
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < L.length; i++) {
      const gm = L[i];
      if (gm.tier !== tier) continue;
      const s = (2.6 + tier * 1.7) * (1 + Math.sin(gm.t * 6 + gm.x) * 0.12);
      const a = gm.t * 3 + gm.x * 0.1;
      ctx.moveTo(gm.x + Math.cos(a) * s, gm.y + Math.sin(a) * s);
      for (let k = 1; k < 4; k++) {
        const aa = a + (k / 4) * TAU;
        ctx.lineTo(gm.x + Math.cos(aa) * s, gm.y + Math.sin(aa) * s);
      }
      ctx.closePath();
      any = true;
    }
    if (any) {
      ctx.fillStyle = GEM_COLORS[tier];
      ctx.globalAlpha = 0.95;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ------------------------------------------------------------------- drops */
export function updateDrops(g, dt) {
  const L = g.drops.live;
  const p = g.p;
  for (let i = 0; i < L.length; i++) {
    const d = L[i];
    d.t += dt; d.life -= dt;
    d.x += d.vx * dt; d.y += d.vy * dt;
    d.vx *= Math.pow(0.02, dt); d.vy *= Math.pow(0.02, dt);
    const pr = d.kind === 'shard' ? g.st.magnet * 0.8 : 34;
    const dx = p.x - d.x, dy = p.y - d.y;
    const dd = Math.hypot(dx, dy);
    if (dd < pr && d.kind === 'shard') {
      d.vx += (dx / (dd || 1)) * 900 * dt;
      d.vy += (dy / (dd || 1)) * 900 * dt;
    }
    if (dd < 26) { g.collectDrop(d); d.alive = false; continue; }
    if (d.life <= 0) d.alive = false;
  }
  g.drops.sweep();
}
export function drawDrops(g, ctx, r) {
  const L = g.drops.live;
  for (let i = 0; i < L.length; i++) {
    const d = L[i];
    const bob = Math.sin(d.t * 4) * 2.5;
    const y = d.y + bob;
    const fade = d.life < 4 ? (Math.sin(d.t * 14) > 0 ? 0.35 : 1) : 1;
    ctx.globalAlpha = fade;
    switch (d.kind) {
      case 'heart':
        r.glow(d.x, y, 26, '#ff6b8a', 0.8);
        drawHeart(ctx, d.x, y, 9, '#ff8aa3');
        break;
      case 'magnet':
        r.glow(d.x, y, 26, '#63f4ff', 0.8);
        ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(d.x, y + 1, 7, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(d.x - 6.5, y + 2.2); ctx.lineTo(d.x - 6.5, y + 7);
        ctx.moveTo(d.x + 6.5, y + 2.2); ctx.lineTo(d.x + 6.5, y + 7);
        ctx.stroke(); ctx.lineCap = 'butt';
        break;
      case 'bomb':
        r.glow(d.x, y, 28, '#ffb45c', 0.85);
        r.poly(d.x, y, 9, 6, d.t * 1.4, '#ffd08a', '#ff8a3c', 1, 2);
        break;
      case 'chest':
        r.glow(d.x, y, 40, '#ffd45c', 0.9);
        ctx.fillStyle = '#ffcf5c'; ctx.strokeStyle = '#fff2c8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(d.x - 13, y - 9, 26, 18, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#7a5a10';
        ctx.fillRect(d.x - 2.5, y - 9, 5, 18);
        break;
      case 'shard':
        r.glow(d.x, y, 16, '#63f4ff', 0.9);
        r.poly(d.x, y, 5.5, 3, d.t * 3, '#ffffff', '#63f4ff', 1, 1.2);
        break;
    }
  }
  ctx.globalAlpha = 1;
}
function drawHeart(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.85);
  ctx.bezierCurveTo(x - s * 1.5, y - s * 0.3, x - s * 0.55, y - s * 1.15, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.55, y - s * 1.15, x + s * 1.5, y - s * 0.3, x, y + s * 0.85);
  ctx.fill();
}
