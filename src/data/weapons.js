/**
 * Weapons.
 *
 * A weapon definition owns its own behaviour and its own persistent visuals.
 * The game object `g` provides the spawn/damage API (see game.js):
 *   g.bullet(o) g.wave(o) g.zone(o) g.beam(o) g.aoe(x,y,r,dmg,o)
 *   g.hurt(e,dmg,o) g.nearest(x,y,r) g.enemiesIn(x,y,r,fn)
 *   g.fx.* g.snd.* g.shake(n) g.st (stats) g.p (player) g.aim {x,y}
 *
 * Stat arrays are indexed by level (1-based); `wv()` clamps and reads them.
 * Evolutions are separate single-level definitions flagged with `evoOf`.
 */
import { TAU } from '../core/util.js';

export const wv = (w, key) => {
  const s = w.def.stats[key];
  if (s === undefined) return 0;
  return Array.isArray(s) ? s[Math.min(s.length - 1, Math.max(0, w.lv - 1))] : s;
};
/** Effective cooldown after haste. */
export const wcd = (g, w) => wv(w, 'cd') / (1 + g.st.haste);
/** Effective damage after global multiplier. */
export const wdmg = (g, w) => wv(w, 'dmg') * g.st.dmgMul;
/** Effective area multiplier. */
export const warea = (g, w) => 1 + (g.st.areaMul || 0);
const wcount = (g, w) => wv(w, 'count') + (w.def.countStat ? g.st.projAdd : 0);

/* ------------------------------------------------------------------ helpers */
function fanAngles(base, n, spread) {
  const out = [];
  if (n <= 1) return [base];
  for (let i = 0; i < n; i++) out.push(base - spread / 2 + (spread * i) / (n - 1));
  return out;
}

/* ================================================================== 1. BOLT */
const BOLT = {
  id: 'bolt', icon: 'bolt', kind: 'weapon', max: 8, countStat: true,
  name: { ja: 'プリズムボルト', en: 'Prism Bolt' },
  desc: { ja: '最も近い敵を追尾する光弾を放つ。', en: 'Fires homing bolts at the nearest enemy.' },
  stats: {
    dmg: [16, 20, 24, 30, 36, 43, 51, 62],
    cd: [0.95, 0.9, 0.88, 0.84, 0.8, 0.76, 0.7, 0.64],
    count: [1, 1, 2, 2, 3, 3, 4, 4],
    pierce: [0, 0, 0, 1, 1, 1, 2, 2],
    speed: 340,
  },
  evo: { id: 'bolt_x', need: 'power' },
  fire(g, w) {
    const n = wcount(g, w), dmg = wdmg(g, w), a = warea(g, w);
    const tgt = g.nearest(g.p.x, g.p.y, 620);
    let base = tgt ? Math.atan2(tgt.y - g.p.y, tgt.x - g.p.x) : Math.atan2(g.aim.y, g.aim.x);
    const angs = fanAngles(base, n, Math.min(1.0, 0.16 * (n - 1)));
    for (let i = 0; i < angs.length; i++) {
      const sp = wv(w, 'speed');
      g.bullet({
        x: g.p.x, y: g.p.y, vx: Math.cos(angs[i]) * sp, vy: Math.sin(angs[i]) * sp,
        r: 7 * a, dmg, life: 2.2, kind: 'bolt', color: '#7fe8ff', beh: 'home',
        turn: 5.2, pierce: wv(w, 'pierce'), wid: w.id, knock: 26,
      });
    }
    g.snd.shoot(1.1, true);
  },
};
const BOLT_X = {
  id: 'bolt_x', icon: 'bolt', kind: 'weapon', max: 1, evoOf: 'bolt', countStat: true,
  name: { ja: 'プリズムストーム', en: 'Prism Storm' },
  desc: { ja: '【進化】追尾弾の嵐。貫通し、着弾で小爆発。', en: 'EVOLVED: a storm of piercing bolts that burst on impact.' },
  stats: { dmg: 57, cd: 0.5, count: 5, pierce: 3, speed: 420 },
  fire(g, w) {
    const n = wcount(g, w), dmg = wdmg(g, w), a = warea(g, w);
    const tgt = g.nearest(g.p.x, g.p.y, 700);
    const base = tgt ? Math.atan2(tgt.y - g.p.y, tgt.x - g.p.x) : Math.atan2(g.aim.y, g.aim.x);
    for (const ang of fanAngles(base, n, 0.9)) {
      const sp = wv(w, 'speed') * (0.85 + g.rng.f() * 0.3);
      g.bullet({
        x: g.p.x, y: g.p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: 8.5 * a, dmg, life: 2.4, kind: 'bolt', color: '#b6f2ff', beh: 'home',
        turn: 7, pierce: wv(w, 'pierce'), wid: w.id, knock: 30, burst: 38 * a,
      });
    }
    g.snd.shoot(1.35, true);
  },
};

/* ================================================================= 2. ORBIT */
const ORBIT = {
  id: 'orbit', icon: 'orbit', kind: 'weapon', max: 8,
  name: { ja: 'オービットシャード', en: 'Orbit Shards' },
  desc: { ja: '自機の周りを回る結晶が触れた敵を切り裂く。', en: 'Crystals orbit you, shredding anything they touch.' },
  stats: {
    dmg: [12, 15, 18, 22, 26, 31, 38, 46],
    nodes: [2, 2, 3, 3, 4, 4, 5, 6],
    radius: [58, 64, 70, 76, 82, 88, 95, 104],
    spin: 2.1, hitCd: 0.34, cd: 0,
  },
  evo: { id: 'orbit_x', need: 'area' },
  init(g, w) { w.phase = 0; },
  tick(g, w, dt) {
    w.phase = (w.phase + wv(w, 'spin') * dt * (1 + g.st.haste * 0.5)) % TAU;
    const n = wv(w, 'nodes'), R = wv(w, 'radius') * warea(g, w), dmg = wdmg(g, w);
    const nodeR = 15 * warea(g, w);
    for (let i = 0; i < n; i++) {
      const a = w.phase + (i / n) * TAU;
      const x = g.p.x + Math.cos(a) * R, y = g.p.y + Math.sin(a) * R;
      g.enemiesIn(x, y, nodeR, (e) => {
        if (g.lock(e, w.id, wv(w, 'hitCd'))) {
          g.hurt(e, dmg, { knock: 60, kx: Math.cos(a), ky: Math.sin(a), wid: w.id });
          g.fx.spark(x, y, 2, '#9df', 90);
        }
      });
    }
  },
  draw(g, w, ctx, r) {
    const n = wv(w, 'nodes'), R = wv(w, 'radius') * warea(g, w), a0 = w.phase;
    const sz = 7.5 * warea(g, w);
    ctx.globalAlpha = 0.22;
    r.ring(g.p.x, g.p.y, R, '#5cd8ff', 1.2, 0.22);
    ctx.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      const x = g.p.x + Math.cos(a) * R, y = g.p.y + Math.sin(a) * R;
      r.glow(x, y, sz * 2.6, '#63f4ff', 0.75);
      r.poly(x, y, sz, 3, a * 3, '#eafcff', '#63f4ff', 1, 1.4);
    }
  },
};
const ORBIT_X = {
  id: 'orbit_x', icon: 'orbit', kind: 'weapon', max: 1, evoOf: 'orbit',
  name: { ja: 'ヘイロー', en: 'Halo' },
  desc: { ja: '【進化】二重の逆回転リング。触れた敵を粉砕する。', en: 'EVOLVED: twin counter-rotating rings that pulverise contact.' },
  stats: { dmg: 40, nodes: 5, radius: 104, spin: 2.6, hitCd: 0.2, cd: 0 },
  init(g, w) { w.phase = 0; },
  tick(g, w, dt) {
    w.phase = (w.phase + wv(w, 'spin') * dt * (1 + g.st.haste * 0.5)) % TAU;
    const n = wv(w, 'nodes'), dmg = wdmg(g, w), A = warea(g, w);
    for (let ring = 0; ring < 2; ring++) {
      const R = wv(w, 'radius') * A * (ring ? 0.58 : 1);
      const dir = ring ? -1.45 : 1;
      const nodeR = (ring ? 14 : 18) * A;
      for (let i = 0; i < n; i++) {
        const a = w.phase * dir + (i / n) * TAU + ring * 0.4;
        const x = g.p.x + Math.cos(a) * R, y = g.p.y + Math.sin(a) * R;
        g.enemiesIn(x, y, nodeR, (e) => {
          if (g.lock(e, w.id + ring, wv(w, 'hitCd'))) {
            g.hurt(e, dmg, { knock: 90, kx: Math.cos(a), ky: Math.sin(a), wid: w.id });
            g.fx.spark(x, y, 3, '#cfe9ff', 120);
          }
        });
      }
    }
  },
  draw(g, w, ctx, r) {
    const n = wv(w, 'nodes'), A = warea(g, w);
    for (let ring = 0; ring < 2; ring++) {
      const R = wv(w, 'radius') * A * (ring ? 0.58 : 1);
      const dir = ring ? -1.45 : 1;
      r.ring(g.p.x, g.p.y, R, ring ? '#ffd97a' : '#7ff0ff', 1.3, 0.24);
      for (let i = 0; i < n; i++) {
        const a = w.phase * dir + (i / n) * TAU + ring * 0.4;
        const x = g.p.x + Math.cos(a) * R, y = g.p.y + Math.sin(a) * R;
        const sz = (ring ? 7 : 9) * A;
        r.glow(x, y, sz * 3, ring ? '#ffcf5c' : '#63f4ff', 0.8);
        r.poly(x, y, sz, 4, a * 2.5, '#ffffff', ring ? '#ffcf5c' : '#63f4ff', 0.55, 1.5);
      }
    }
  },
};

/* ================================================================== 3. NOVA */
const NOVA = {
  id: 'nova', icon: 'nova', kind: 'weapon', max: 8,
  name: { ja: 'ノヴァパルス', en: 'Nova Pulse' },
  desc: { ja: '自機から衝撃波を放ち、敵を吹き飛ばす。', en: 'Releases a shockwave that damages and knocks back.' },
  stats: {
    dmg: [24, 30, 36, 45, 54, 65, 78, 94],
    radius: [95, 105, 116, 128, 141, 155, 171, 190],
    cd: [3.2, 3.05, 2.9, 2.75, 2.6, 2.4, 2.2, 2.0],
  },
  evo: { id: 'nova_x', need: 'haste' },
  fire(g, w) {
    const R = wv(w, 'radius') * warea(g, w);
    g.wave({ x: g.p.x, y: g.p.y, maxR: R, speed: R / 0.42, dmg: wdmg(g, w), knock: 190, color: '#8affe0', wid: w.id, width: 9 });
    g.snd.boom(0.7);
    g.shake(2.5);
  },
};
const NOVA_X = {
  id: 'nova_x', icon: 'nova', kind: 'weapon', max: 1, evoOf: 'nova',
  name: { ja: 'スーパーノヴァ', en: 'Supernova' },
  desc: { ja: '【進化】二重の衝撃波と、後に残る灼熱の field。', en: 'EVOLVED: a double shockwave that leaves scorched ground.' },
  stats: { dmg: 119, radius: 235, cd: 1.9 },
  fire(g, w) {
    const R = wv(w, 'radius') * warea(g, w), d = wdmg(g, w);
    g.wave({ x: g.p.x, y: g.p.y, maxR: R, speed: R / 0.38, dmg: d, knock: 240, color: '#ffe28a', wid: w.id, width: 13 });
    g.wave({ x: g.p.x, y: g.p.y, maxR: R * 0.62, speed: R / 0.5, dmg: d * 0.6, knock: 120, color: '#ff9f6b', wid: w.id + '2', width: 8, delay: 0.14 });
    g.zone({ x: g.p.x, y: g.p.y, r: R * 0.5, dps: d * 0.5, life: 2.4, color: '#ff8a5c', wid: w.id });
    g.snd.boom(1.15);
    g.shake(6);
  },
};

/* ================================================================= 4. LANCE */
const LANCE = {
  id: 'lance', icon: 'lance', kind: 'weapon', max: 8, countStat: true,
  name: { ja: 'ランス', en: 'Lance' },
  desc: { ja: '進行方向へ貫通する高速の槍を放つ。', en: 'Hurls a piercing spear the way you are heading.' },
  stats: {
    dmg: [22, 27, 34, 40, 50, 59, 72, 86],
    cd: [1.5, 1.42, 1.34, 1.26, 1.18, 1.1, 1.0, 0.9],
    count: [1, 1, 1, 2, 2, 2, 3, 3],
    pierce: [2, 2, 3, 3, 4, 5, 6, 8],
    speed: 560,
  },
  evo: { id: 'lance_x', need: 'swift' },
  fire(g, w) {
    const n = wcount(g, w), dmg = wdmg(g, w), a = warea(g, w);
    const base = Math.atan2(g.aim.y, g.aim.x);
    const angs = n > 1 ? fanAngles(base, n, 0.3 * (n - 1)) : [base];
    for (const ang of angs) {
      const sp = wv(w, 'speed');
      g.bullet({
        x: g.p.x, y: g.p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: 9 * a, dmg, life: 1.5, kind: 'lance', color: '#ffe98a', beh: 'straight',
        pierce: wv(w, 'pierce'), wid: w.id, knock: 70, rot: ang, len: 30 * a,
      });
    }
    g.snd.shoot(0.75);
  },
};
const LANCE_X = {
  id: 'lance_x', icon: 'lance', kind: 'weapon', max: 1, evoOf: 'lance',
  name: { ja: 'レールガン', en: 'Railgun' },
  desc: { ja: '【進化】画面を貫く即着弾ビーム。すべてを貫通。', en: 'EVOLVED: an instant beam that pierces the entire screen.' },
  stats: { dmg: 176, cd: 1.25, count: 1, speed: 0 },
  fire(g, w) {
    const A = warea(g, w);
    const base = Math.atan2(g.aim.y, g.aim.x);
    const len = 1400, wdt = 26 * A;
    const dmg = wdmg(g, w);
    const ex = g.p.x + Math.cos(base) * len, ey = g.p.y + Math.sin(base) * len;
    g.lineHit(g.p.x, g.p.y, ex, ey, wdt, dmg, { knock: 150, wid: w.id });
    g.beam({ pts: [g.p.x, g.p.y, ex, ey], life: 0.3, color: '#fff6c8', width: wdt, glow: '#ffd35c' });
    g.snd.laser(0.6);
    g.shake(7);
    g.fx.spark(g.p.x + Math.cos(base) * 26, g.p.y + Math.sin(base) * 26, 14, '#ffe9a0', 320);
  },
};

/* =================================================================== 5. ARC */
const ARC = {
  id: 'arc', icon: 'arc', kind: 'weapon', max: 8,
  name: { ja: 'アーク', en: 'Arc' },
  desc: { ja: '敵から敵へ連鎖する電撃を走らせる。', en: 'Lightning that leaps from enemy to enemy.' },
  stats: {
    dmg: [19, 23, 28, 35, 43, 53, 63, 77],
    chains: [2, 3, 3, 4, 4, 5, 6, 7],
    cd: [1.8, 1.72, 1.62, 1.5, 1.4, 1.3, 1.18, 1.05],
    range: 170,
  },
  evo: { id: 'arc_x', need: 'focus' },
  fire(g, w) {
    const first = g.nearest(g.p.x, g.p.y, 380);
    if (!first) return;
    g.chain(first, wv(w, 'chains'), wv(w, 'range') * warea(g, w), wdmg(g, w), w.id, '#a6d8ff', 0);
    g.snd.laser(1.5);
  },
};
const ARC_X = {
  id: 'arc_x', icon: 'arc', kind: 'weapon', max: 1, evoOf: 'arc',
  name: { ja: 'テンペスト', en: 'Tempest' },
  desc: { ja: '【進化】無数に枝分かれし、敵を麻痺させる嵐。', en: 'EVOLVED: a branching storm that stuns everything it touches.' },
  stats: { dmg: 89, chains: 13, cd: 0.9, range: 210 },
  fire(g, w) {
    const first = g.nearest(g.p.x, g.p.y, 460);
    if (!first) return;
    g.chain(first, wv(w, 'chains'), wv(w, 'range') * warea(g, w), wdmg(g, w), w.id, '#dcbaff', 0.45);
    g.snd.laser(1.1);
    g.shake(2);
  },
};

/* ============================================================= 6. BOOMERANG */
const RANG = {
  id: 'rang', icon: 'rang', kind: 'weapon', max: 8, countStat: true,
  name: { ja: 'ブーメラン', en: 'Boomerang' },
  desc: { ja: '弧を描いて戻ってくる刃。往復で二度斬る。', en: 'A blade that arcs out and slices again on the way back.' },
  stats: {
    dmg: [20, 24, 30, 36, 45, 54, 65, 78],
    cd: [2.2, 2.1, 2.0, 1.9, 1.8, 1.68, 1.55, 1.4],
    count: [1, 1, 2, 2, 3, 3, 4, 4],
    pierce: [3, 3, 4, 4, 5, 6, 7, 9],
    speed: 300, range: [180, 195, 210, 225, 240, 258, 276, 300],
  },
  evo: { id: 'rang_x', need: 'multishot' },
  fire(g, w) {
    const n = wcount(g, w), dmg = wdmg(g, w), A = warea(g, w);
    const tgt = g.nearest(g.p.x, g.p.y, 520);
    const base = tgt ? Math.atan2(tgt.y - g.p.y, tgt.x - g.p.x) : Math.atan2(g.aim.y, g.aim.x);
    for (let i = 0; i < n; i++) {
      const ang = base + (i - (n - 1) / 2) * 0.42;
      const sp = wv(w, 'speed');
      g.bullet({
        x: g.p.x, y: g.p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: 13 * A, dmg, life: 3.4, kind: 'rang', color: '#ff9ad5', beh: 'rang',
        pierce: wv(w, 'pierce'), wid: w.id + i, knock: 40, range: wv(w, 'range') * A, spin: 15,
      });
    }
    g.snd.shoot(0.9, true);
  },
};
const RANG_X = {
  id: 'rang_x', icon: 'rang', kind: 'weapon', max: 1, evoOf: 'rang',
  name: { ja: 'サイクロン', en: 'Cyclone' },
  desc: { ja: '【進化】四方に舞う巨大な刃が絶えず戻り続ける。', en: 'EVOLVED: giant blades circle out in every direction, endlessly.' },
  stats: { dmg: 100, cd: 1.5, count: 4, pierce: 99, speed: 340, range: 330 },
  fire(g, w) {
    const n = wcount(g, w), dmg = wdmg(g, w), A = warea(g, w);
    const base = g.rng.angle();
    for (let i = 0; i < n; i++) {
      const ang = base + (i / n) * TAU;
      const sp = wv(w, 'speed');
      g.bullet({
        x: g.p.x, y: g.p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: 19 * A, dmg, life: 4, kind: 'rang', color: '#ffb0e0', beh: 'rang',
        pierce: 99, wid: w.id + i, knock: 70, range: wv(w, 'range') * A, spin: 19, hitCd: 0.4,
      });
    }
    g.snd.shoot(0.62, true);
  },
};

/* ================================================================= 7. EMBER */
const EMBER = {
  id: 'ember', icon: 'ember', kind: 'weapon', max: 8,
  name: { ja: 'エンバー', en: 'Ember Field' },
  desc: { ja: '通った跡に燃える領域を残す。', en: 'Leaves burning ground in your wake.' },
  stats: {
    dmg: [15, 18, 22, 27, 32, 39, 47, 57],   // damage per second
    radius: [40, 44, 48, 53, 58, 64, 70, 78],
    cd: [1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.88],
    life: [3.0, 3.2, 3.4, 3.7, 4.0, 4.3, 4.6, 5.0],
  },
  evo: { id: 'ember_x', need: 'regen' },
  fire(g, w) {
    const A = warea(g, w);
    g.zone({
      x: g.p.x - g.p.vx * 0.08, y: g.p.y - g.p.vy * 0.08,
      r: wv(w, 'radius') * A, dps: wdmg(g, w), life: wv(w, 'life'), color: '#ff7a4d', wid: w.id,
    });
  },
};
const EMBER_X = {
  id: 'ember_x', icon: 'ember', kind: 'weapon', max: 1, evoOf: 'ember',
  name: { ja: 'インフェルノ', en: 'Inferno' },
  desc: { ja: '【進化】敵を引き寄せて焼き尽くす巨大な炎獄。', en: 'EVOLVED: a vast firestorm that drags enemies in and melts them.' },
  stats: { dmg: 84, radius: 108, cd: 0.85, life: 5.5 },
  fire(g, w) {
    const A = warea(g, w);
    g.zone({
      x: g.p.x, y: g.p.y, r: wv(w, 'radius') * A, dps: wdmg(g, w), life: wv(w, 'life'),
      color: '#ff5a3c', wid: w.id, pull: 55,
    });
  },
};

/* ================================================================ 8. SENTRY */
const SENTRY = {
  id: 'sentry', icon: 'sentry', kind: 'weapon', max: 8,
  name: { ja: 'センチネル', en: 'Sentinel' },
  desc: { ja: '追従するドローンが自動で敵を撃つ。', en: 'A drone escorts you and shoots on its own.' },
  stats: {
    dmg: [14, 18, 22, 27, 32, 39, 47, 57],
    drones: [1, 1, 1, 2, 2, 2, 3, 3],
    fireCd: [0.8, 0.74, 0.68, 0.62, 0.57, 0.52, 0.48, 0.42],
    cd: 0, range: 300, speed: 470,
  },
  evo: { id: 'sentry_x', need: 'overdrive' },
  init(g, w) { w.drones = []; w.phase = 0; },
  tick(g, w, dt) {
    const n = wv(w, 'drones');
    while (w.drones.length < n) w.drones.push({ t: g.rng.f() * 0.4, x: g.p.x, y: g.p.y });
    if (w.drones.length > n) w.drones.length = n;
    w.phase += dt * 1.5;
    const R = 52 * warea(g, w);
    const fcd = wv(w, 'fireCd') / (1 + g.st.haste);
    for (let i = 0; i < w.drones.length; i++) {
      const d = w.drones[i];
      const a = w.phase + (i / n) * TAU;
      const tx = g.p.x + Math.cos(a) * R, ty = g.p.y + Math.sin(a) * R;
      d.x += (tx - d.x) * Math.min(1, dt * 9);
      d.y += (ty - d.y) * Math.min(1, dt * 9);
      d.t -= dt;
      if (d.t <= 0) {
        const tgt = g.nearest(d.x, d.y, wv(w, 'range'));
        if (tgt) {
          d.t = fcd;
          const ang = Math.atan2(tgt.y - d.y, tgt.x - d.x);
          const sp = wv(w, 'speed');
          g.bullet({
            x: d.x, y: d.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            r: 5 * warea(g, w), dmg: wdmg(g, w), life: 1.2, kind: 'dot', color: '#c6ff8a',
            beh: 'straight', pierce: 0, wid: w.id, knock: 18,
          });
          g.snd.shoot(1.6, true);
        } else d.t = 0.12;
      }
    }
  },
  draw(g, w, ctx, r) {
    for (const d of w.drones) {
      r.glow(d.x, d.y, 20, '#b6ff6b', 0.6);
      r.poly(d.x, d.y, 8, 3, -w.phase * 2, '#eaffd6', '#a8f05c', 1, 1.4);
      r.ring(d.x, d.y, 4, '#ffffff', 1, 0.9);
    }
  },
};
const SENTRY_X = {
  id: 'sentry_x', icon: 'sentry', kind: 'weapon', max: 1, evoOf: 'sentry',
  name: { ja: 'リージョン', en: 'Legion' },
  desc: { ja: '【進化】5基の追尾ドローンが弾幕を張る。', en: 'EVOLVED: five drones lay down a homing barrage.' },
  stats: { dmg: 54, drones: 5, fireCd: 0.3, cd: 0, range: 360, speed: 430 },
  init(g, w) { w.drones = []; w.phase = 0; },
  tick(g, w, dt) {
    SENTRY.tick.call(this, g, w, dt);
  },
  draw(g, w, ctx, r) {
    for (const d of w.drones) {
      r.glow(d.x, d.y, 26, '#d8ff6b', 0.7);
      r.poly(d.x, d.y, 9.5, 4, -w.phase * 2.4, '#f4ffe0', '#ffd95c', 0.6, 1.5);
      r.ring(d.x, d.y, 4.5, '#ffffff', 1.2, 0.95);
    }
  },
};

export const WEAPONS = [BOLT, ORBIT, NOVA, LANCE, ARC, RANG, EMBER, SENTRY];
export const EVOS = [BOLT_X, ORBIT_X, NOVA_X, LANCE_X, ARC_X, RANG_X, EMBER_X, SENTRY_X];
export const ALL_WEAPONS = [...WEAPONS, ...EVOS];
export const WEAPON_BY_ID = Object.fromEntries(ALL_WEAPONS.map((w) => [w.id, w]));

/** Rough DPS estimate for the stat panel (ignores overkill/travel). */
export function estimateDps(g, w) {
  const d = wdmg(g, w);
  const critAvg = 1 + g.st.crit * (g.st.critMul - 1);
  const def = w.def;
  let dps = 0;
  if (def.id.startsWith('orbit')) dps = (d * wv(w, 'nodes')) / wv(w, 'hitCd') * 0.55;
  else if (def.id.startsWith('ember')) dps = d * 1.4;
  else if (def.id.startsWith('sentry')) dps = (d * wv(w, 'drones')) / (wv(w, 'fireCd') / (1 + g.st.haste));
  else if (def.id.startsWith('arc')) dps = (d * (1 + wv(w, 'chains'))) / wcd(g, w) * 0.7;
  else {
    const n = (wv(w, 'count') || 1) + (def.countStat ? g.st.projAdd : 0);
    const hits = 1 + Math.min(3, wv(w, 'pierce') || 0) * 0.6;
    dps = (d * n * hits) / Math.max(0.05, wcd(g, w));
  }
  return dps * critAvg;
}

