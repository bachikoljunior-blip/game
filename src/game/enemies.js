/**
 * Enemy simulation: AI, soft separation, knockback, contact damage, rendering.
 * Enemies are drawn as flat neon polygons — the screen-space bloom pass supplies
 * the glow, so we can batch hundreds of them into a handful of draw calls.
 */
import { TAU, clamp, dist2, mix } from '../core/util.js';
import { ENEMY_BY_ID } from '../data/enemies.js';

export const mkEnemy = () => ({
  alive: false, uid: 0, x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, kx: 0, ky: 0,
  hp: 1, maxHp: 1, def: null, r: 10, spd: 40, dmg: 5, xp: 1, hitT: 0, stun: 0,
  t: 0, seed: 0, lock: null, elite: 0, hpMul: 1, dmgMul: 1, face: 0, rot: 0, spin: 0,
  st: 0, stt: 0, w1: 0, aimx: 0, aimy: 0, boss: false, touch: 0, born: 0,
});

let UID = 1;

export function initEnemy(e, def, x, y, hpMul, dmgMul, elite) {
  e.def = def; e.uid = UID++;
  e.x = x; e.y = y; e.vx = e.vy = e.px = e.py = e.kx = e.ky = 0;
  e.hpMul = hpMul; e.dmgMul = dmgMul;
  const es = elite ? 7.5 : 1;
  e.maxHp = e.hp = def.hp * hpMul * es;
  e.r = def.r * (elite ? 1.55 : 1);
  e.spd = def.spd * (elite ? 0.82 : 1);
  e.dmg = def.dmg * dmgMul * (elite ? 1.5 : 1);
  e.xp = def.xp * (elite ? 14 : 1);
  e.elite = elite ? 1 : 0;
  e.hitT = 0; e.stun = 0; e.t = 0; e.born = 0.28;
  e.st = 0; e.stt = 0; e.w1 = 0; e.touch = 0;
  e.seed = Math.random();
  e.rot = e.seed * TAU;
  e.spin = (e.seed - 0.5) * 1.6;
  e.boss = false;
  if (!e.lock) e.lock = Object.create(null);
  else for (const k in e.lock) delete e.lock[k];
  return e;
}

export function updateEnemies(g, dt) {
  const L = g.enemies.live;
  const p = g.p;
  const cullR = g.cullR * 1.5;

  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    e.t += dt;
    if (e.born > 0) e.born -= dt;
    if (e.hitT > 0) e.hitT -= dt;

    if (e.stun > 0) {
      e.stun -= dt;
      e.vx *= 0.86; e.vy *= 0.86;
    } else if (e.boss) {
      g.boss.ai(g, e, dt);
    } else {
      e.def.ai(g, e, dt);
    }
    e.rot += e.spin * dt;
  }

  // --- soft separation so crowds spread out instead of stacking into one dot
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e.def.noSep || e.boss) continue;
    let n = 0;
    g.egrid.query(e.x, e.y, e.r + 22, (o) => {
      if (o === e || n > 5 || o.boss) return;
      const dx = e.x - o.x, dy = e.y - o.y;
      const rr = (e.r + o.r) * 0.86;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.0001) return;
      const d = Math.sqrt(d2);
      const push = (rr - d) / rr;
      e.px += (dx / d) * push * 44 * dt;
      e.py += (dy / d) * push * 44 * dt;
      n++;
    });
  }

  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    e.x += (e.vx + e.kx) * dt + e.px;
    e.y += (e.vy + e.ky) * dt + e.py;
    e.px = e.py = 0;
    const kd = Math.pow(0.00004, dt);
    e.kx *= kd; e.ky *= kd;

    // contact damage
    e.touch -= dt;
    const rr = e.r + p.r * 0.85;
    if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
      if (e.touch <= 0) {
        e.touch = 0.55;
        g.hitPlayer(e.dmg);
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        e.kx -= (dx / d) * 90; e.ky -= (dy / d) * 90;
      }
    }

    // recycle stragglers to keep the pressure up without wasting entities
    if (!e.boss && !e.elite) {
      const dx = e.x - p.x, dy = e.y - p.y;
      if (Math.abs(dx) > cullR || Math.abs(dy) > cullR) {
        const a = g.rng.angle(), rad = g.spawnR;
        e.x = p.x + Math.cos(a) * rad; e.y = p.y + Math.sin(a) * rad;
        e.kx = e.ky = 0; e.born = 0.2;
      }
    }
  }
  g.enemies.sweep();
}

/* ------------------------------------------------------------------ drawing */
export function drawEnemies(g, ctx, r, glow) {
  const L = g.enemies.live;
  if (!L.length) return;
  const groups = g._egroups || (g._egroups = new Map());
  for (const arr of groups.values()) arr.length = 0;

  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e.boss) continue;
    let a = groups.get(e.def.id);
    if (!a) { a = []; groups.set(e.def.id, a); }
    a.push(e);
  }

  // One path per archetype: dark body + bright neon rim (the rim is what blooms).
  for (const [id, arr] of groups) {
    if (!arr.length) continue;
    const def = ENEMY_BY_ID[id];
    if (!def._dark) def._dark = mix(def.color, '#05070f', 0.68);
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.hitT > 0 || e.elite) continue;
      addPoly(ctx, e.x, e.y, e.r * scaleOf(e), def.sides, e.rot, def.spike);
      any = true;
    }
    if (!any) continue;
    ctx.fillStyle = glow ? def.color : def._dark;
    ctx.globalAlpha = glow ? 0.42 : 1;
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = glow ? 2.6 : 2;
    ctx.stroke();
  }

  // pass 2 — flashing + elite (rare, so per-entity state is fine)
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e.boss) continue;
    const flash = e.hitT > 0;
    if (!flash && !e.elite) continue;
    const def = e.def, s = e.r * scaleOf(e);
    if (e.elite) {
      r.glow(e.x, e.y, s * 3, '#ffcf5c', 0.5);
      ctx.beginPath(); addPoly(ctx, e.x, e.y, s * 1.3, def.sides, -e.rot * 0.6, def.spike);
      ctx.strokeStyle = '#ffcf5c'; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.9; ctx.stroke();
    }
    ctx.beginPath(); addPoly(ctx, e.x, e.y, s, def.sides, e.rot, def.spike);
    ctx.globalAlpha = 1;
    if (!def._hot) def._hot = mix(def.color, '#ffffff', 0.55);
    ctx.fillStyle = flash ? def._hot : (glow ? def.color : def._dark || def.color);
    ctx.fill();
    ctx.strokeStyle = flash ? '#ffffff' : def.color;
    ctx.lineWidth = flash ? 3 : 2.2;
    ctx.stroke();
    if (e.elite && e.hp < e.maxHp) hpBar(ctx, e.x, e.y - s - 9, s * 1.6, e.hp / e.maxHp, '#ffcf5c');
  }

  // shield arcs for wardens
  ctx.lineCap = 'round';
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (!e.def.shield || e.boss) continue;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 1.5, e.face - 1.0, e.face + 1.0);
    ctx.strokeStyle = '#8fe8ff';
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 3.4;
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

function scaleOf(e) {
  if (e.born > 0) {
    const k = 1 - e.born / 0.28;
    return 0.25 + k * 0.75 + Math.sin(k * Math.PI) * 0.18;
  }
  return 1 + (e.hitT > 0 ? 0.16 : 0);
}

export function addPoly(ctx, x, y, r, sides, rot, spike) {
  const n = spike < 1 ? sides * 2 : sides;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const rr = spike < 1 && i & 1 ? r * spike : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function hpBar(ctx, x, y, w, k, color) {
  const h = 3.2;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * clamp(k, 0, 1), h);
  ctx.globalAlpha = 1;
}
