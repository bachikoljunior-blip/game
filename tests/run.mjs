#!/usr/bin/env node
/**
 * Unit tests for the pure logic — no browser, no dependencies.
 *   node tests/run.mjs
 *
 * Covers the parts where a silent regression would be expensive: RNG contracts,
 * the spatial index, pooling, data-table integrity, and the upgrade pipeline.
 */
import { Rng } from '../src/core/rng.js';
import { Pool } from '../src/core/pool.js';
import { SpatialGrid } from '../src/core/grid.js';
import * as U from '../src/core/util.js';
import { META, metaBonuses, spentTotal } from '../src/data/meta.js';
import { WEAPONS, EVOS, ALL_WEAPONS, WEAPON_BY_ID, wv } from '../src/data/weapons.js';
import { PASSIVES, PASSIVE_BY_ID } from '../src/data/passives.js';
import { CHARACTERS } from '../src/data/characters.js';
import { ENEMIES, ENEMY_BY_ID } from '../src/data/enemies.js';
import { buildChoices, applyChoice, cardInfo, weaponDelta, passiveDelta, MAX_WEAPONS, MAX_PASSIVES } from '../src/game/upgrades.js';
import { Director, RUN_LEN } from '../src/game/waves.js';
import { XP_NEED } from '../src/game/game.js';

let pass = 0, fail = 0, group = '';
const G = (name) => { group = name; console.log(`\n── ${name}`); };
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${msg}`); }
}
const eq = (a, b, msg) => ok(Object.is(a, b) || a === b, `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} — got ${a}, want ~${b}`);

/* ------------------------------------------------------------------- rng */
G('rng');
{
  const a = new Rng(42), b = new Rng(42);
  const xs = Array.from({ length: 50 }, () => a.f());
  const ys = Array.from({ length: 50 }, () => b.f());
  ok(xs.every((v, i) => v === ys[i]), 'same seed produces the same stream');
  ok(xs.every((v) => v >= 0 && v < 1), 'f() stays in [0,1)');

  const c = new Rng(7);
  ok(new Rng(8).f() !== c.f(), 'different seeds diverge');

  let mn = 1, mx = 0;
  for (let i = 0; i < 5000; i++) { const v = c.f(); mn = Math.min(mn, v); mx = Math.max(mx, v); }
  ok(mn < 0.01 && mx > 0.99, 'stream covers the range');

  for (let i = 0; i < 500; i++) {
    const v = c.ints(3, 7);
    if (v < 3 || v > 7 || v % 1) { ok(false, 'ints() out of range'); break; }
  }
  pass++;

  const items = [{ w: 0 }, { w: 10 }, { w: 0 }];
  let allSecond = true;
  for (let i = 0; i < 200; i++) if (c.weighted(items, (o) => o.w) !== items[1]) allSecond = false;
  ok(allSecond, 'weighted() never returns a zero-weight entry');
  eq(c.weighted([], () => 1), null, 'weighted() of an empty list is null');
  eq(c.weighted([1, 2], () => 0), null, 'weighted() with no weight is null');

  const src = [1, 2, 3, 4, 5];
  const s = c.sample(src, 3);
  eq(s.length, 3, 'sample() returns n items');
  eq(new Set(s).size, 3, 'sample() items are distinct');
  eq(src.join(), '1,2,3,4,5', 'sample() does not mutate the source');
}

/* ------------------------------------------------------------------ util */
G('util');
{
  eq(U.clamp(5, 0, 3), 3, 'clamp high');
  eq(U.clamp(-5, 0, 3), 0, 'clamp low');
  eq(U.lerp(0, 10, 0.25), 2.5, 'lerp');
  eq(U.fmtTime(0), '00:00', 'fmtTime zero');
  eq(U.fmtTime(75.9), '01:15', 'fmtTime truncates');
  eq(U.fmtTime(-4), '00:00', 'fmtTime clamps negatives');
  eq(U.fmtTime(3599), '59:59', 'fmtTime minutes');
  eq(U.fmtNum(999), '999', 'fmtNum small');
  eq(U.fmtNum(1500), '1.5K', 'fmtNum thousands');
  eq(U.fmtNum(2500000), '2.5M', 'fmtNum millions');
  near(U.angDelta(0.1, 6.2), -0.183, 0.01, 'angDelta wraps the short way');
  near(U.angDelta(6.2, 0.1), 0.183, 0.01, 'angDelta wraps back');
  ok(Math.abs(U.angDelta(0, Math.PI * 2)) < 1e-9, 'angDelta of a full turn is 0');
  // damp is frame-rate independent: one big step ≈ many small ones
  let big = U.damp(0, 100, 5, 0.5);
  let small = 0;
  for (let i = 0; i < 50; i++) small = U.damp(small, 100, 5, 0.01);
  near(big, small, 0.001, 'damp is frame-rate independent');
  eq(U.rgb('#ff8000'), '255,128,0', 'rgb parses 6-digit hex');
  eq(U.rgb('#f80'), '255,136,0', 'rgb parses 3-digit hex');
  eq(U.mix('#000000', '#ffffff', 0.5), 'rgb(128,128,128)', 'mix midpoint');
}

/* ------------------------------------------------------------------ pool */
G('pool');
{
  let made = 0;
  const p = new Pool(() => ({ alive: false, id: made++ }), 2);
  eq(made, 2, 'preallocates');
  const a = p.spawn(), b = p.spawn(), c = p.spawn();
  eq(p.count, 3, 'tracks live count');
  ok(a.alive && b.alive && c.alive, 'spawned objects are alive');
  b.alive = false;
  p.sweep();
  eq(p.count, 2, 'sweep removes the dead');
  ok(p.live.includes(a) && p.live.includes(c), 'sweep keeps the living');
  const d = p.spawn();
  eq(d, b, 'recycles the freed object rather than allocating');
  eq(made, 3, 'no extra allocation on reuse');

  for (let i = 0; i < 20; i++) p.spawn();
  p.trim(5);
  p.sweep();
  eq(p.count, 5, 'trim caps the population');
  p.clear();
  eq(p.count, 0, 'clear empties the pool');
}

/* ------------------------------------------------------------------ grid */
G('spatial grid');
{
  const g = new SpatialGrid(50);
  const pts = [];
  for (let x = -200; x <= 200; x += 40) for (let y = -200; y <= 200; y += 40) pts.push({ x, y, alive: true });
  g.clear();
  pts.forEach((p) => g.insert(p));

  const brute = (x, y, r) => pts.filter((p) => Math.hypot(p.x - x, p.y - y) <= r);
  for (const [x, y, r] of [[0, 0, 60], [-200, 190, 45], [37, -84, 120], [1000, 1000, 50]]) {
    const found = new Set();
    g.query(x, y, r, (p) => { if (Math.hypot(p.x - x, p.y - y) <= r) found.add(p); });
    eq(found.size, brute(x, y, r).length, `query(${x},${y},${r}) matches brute force`);
  }

  for (const [x, y] of [[0, 0], [13, -7], [-190, 205], [500, 500]]) {
    const want = pts.reduce((best, p) => {
      const d = Math.hypot(p.x - x, p.y - y);
      return d < best.d ? { p, d } : best;
    }, { p: null, d: Infinity });
    const got = g.nearest(x, y, 400, (e) => e.alive);
    if (want.d <= 400) {
      near(Math.hypot(got.x - x, got.y - y), want.d, 1e-9, `nearest(${x},${y}) picks the closest`);
    } else eq(got, null, 'nearest returns null past the radius');
  }
  eq(g.nearest(0, 0, 5, () => false), null, 'nearest honours the filter');

  g.clear();
  let seen = 0;
  g.query(0, 0, 500, () => seen++);
  eq(seen, 0, 'clear empties every bucket');
}

/* ------------------------------------------------------------- data files */
G('data integrity');
{
  const dupes = (arr) => {
    const s = new Set(); const d = [];
    for (const x of arr) { if (s.has(x)) d.push(x); s.add(x); }
    return d;
  };
  eq(dupes(ALL_WEAPONS.map((w) => w.id)).length, 0, 'weapon ids are unique');
  eq(dupes(PASSIVES.map((p) => p.id)).length, 0, 'passive ids are unique');
  eq(dupes(ENEMIES.map((e) => e.id)).length, 0, 'enemy ids are unique');
  eq(dupes(CHARACTERS.map((c) => c.id)).length, 0, 'character ids are unique');
  eq(dupes(META.map((m) => m.id)).length, 0, 'meta ids are unique');

  for (const w of ALL_WEAPONS) {
    ok(w.name.ja && w.name.en, `${w.id} is translated`);
    ok(w.desc.ja && w.desc.en, `${w.id} has both descriptions`);
    ok(typeof w.fire === 'function' || typeof w.tick === 'function', `${w.id} does something`);
    ok(w.stats && w.stats.dmg !== undefined, `${w.id} has damage`);
    for (const k in w.stats) {
      const s = w.stats[k];
      if (Array.isArray(s)) {
        eq(s.length, w.max, `${w.id}.${k} has one entry per level`);
        ok(s.every((v) => typeof v === 'number' && isFinite(v)), `${w.id}.${k} is numeric`);
      }
    }
    // damage must never go backwards on level-up
    if (Array.isArray(w.stats.dmg)) {
      ok(w.stats.dmg.every((v, i, a) => i === 0 || v >= a[i - 1]), `${w.id} damage is monotonic`);
    }
    if (Array.isArray(w.stats.cd)) {
      ok(w.stats.cd.every((v, i, a) => i === 0 || v <= a[i - 1]), `${w.id} cooldown never worsens`);
      ok(w.stats.cd.every((v) => v > 0.04), `${w.id} cooldown stays sane`);
    }
  }

  for (const w of WEAPONS) {
    ok(w.evo, `${w.id} declares an evolution`);
    const evo = WEAPON_BY_ID[w.evo.id];
    ok(evo, `${w.id} evolution target ${w.evo.id} exists`);
    eq(evo.evoOf, w.id, `${evo.id} points back at ${w.id}`);
    ok(PASSIVE_BY_ID[w.evo.need], `${w.id} evolution needs a real passive (${w.evo.need})`);
  }
  eq(EVOS.length, WEAPONS.length, 'every weapon has exactly one evolution');
  // every passive should gate at least one evolution, or the pool has dead weight
  const needed = new Set(WEAPONS.map((w) => w.evo.need));
  ok(needed.size === WEAPONS.length, 'each evolution needs a different passive');

  for (const p of PASSIVES) {
    eq(p.val.length, p.max, `${p.id} value table matches its max level`);
    ok(p.val.every((v, i, a) => i === 0 || Math.abs(v) >= Math.abs(a[i - 1])), `${p.id} values grow`);
    if (p.extra) eq(p.extra.val.length, p.max, `${p.id} extra table matches max level`);
  }
  for (const m of META) {
    eq(m.cost.length, m.max, `${m.id} price list matches max level`);
    eq(m.val.length, m.max, `${m.id} value list matches max level`);
    ok(m.cost.every((v, i, a) => i === 0 || v > a[i - 1]), `${m.id} costs increase`);
  }
  for (const c of CHARACTERS) {
    ok(WEAPON_BY_ID[c.weapon], `${c.id} starts with a real weapon`);
    ok(c.base.hp > 0 && c.base.spd > 0, `${c.id} has sane base stats`);
  }
  for (const e of ENEMIES) {
    ok(typeof e.ai === 'function', `${e.id} has an AI`);
    ok(e.hp > 0 && e.r > 0 && e.xp > 0, `${e.id} has sane stats`);
    ok(e.sides >= 3, `${e.id} is drawable`);
  }
  ok(ENEMY_BY_ID.shardling, 'splitter offspring exists');
}

/* ------------------------------------------------------- weapon accessors */
G('weapon stat access');
{
  const w = { def: WEAPON_BY_ID.bolt, lv: 1 };
  eq(wv(w, 'dmg'), WEAPON_BY_ID.bolt.stats.dmg[0], 'level 1 reads index 0');
  w.lv = 8;
  eq(wv(w, 'dmg'), WEAPON_BY_ID.bolt.stats.dmg[7], 'level 8 reads the last index');
  w.lv = 99;
  eq(wv(w, 'dmg'), WEAPON_BY_ID.bolt.stats.dmg[7], 'over-level clamps');
  w.lv = 0;
  eq(wv(w, 'dmg'), WEAPON_BY_ID.bolt.stats.dmg[0], 'under-level clamps');
  eq(wv(w, 'speed'), 340, 'scalar stats pass through');
  eq(wv(w, 'nope'), 0, 'unknown stats are 0');
}

/* ----------------------------------------------------------- progression */
G('progression curves');
{
  let prev = 0;
  for (let lv = 1; lv <= 60; lv++) {
    const n = XP_NEED(lv);
    ok(n > prev, `XP requirement grows at level ${lv}`);
    prev = n;
  }
  near(XP_NEED(1), 7, 0.5, 'first level is cheap');
  ok(XP_NEED(30) < 200, 'late levels stay reachable');

  const d = new Director({ });
  let lastHp = 0, lastRate = 0;
  for (let t = 0; t <= RUN_LEN; t += 30) {
    const diff = d.difficulty(t);
    ok(diff.hpMul >= lastHp, `enemy HP scaling is monotonic at ${t}s`);
    ok(diff.rate >= lastRate - 1e-9, `spawn rate is monotonic at ${t}s`);
    lastHp = diff.hpMul; lastRate = diff.rate;
  }
  const end = d.difficulty(RUN_LEN);
  ok(end.hpMul > 5 && end.hpMul < 20, `end-game HP multiplier is in range (${end.hpMul.toFixed(1)})`);
  ok(end.rate <= 8, 'spawn rate is capped');

  // the weight table must only reference enemies that exist
  for (let t = 0; t <= RUN_LEN; t += 10) {
    for (const id of Object.keys(d.weights(t))) ok(!!ENEMY_BY_ID[id], `weight table entry "${id}" exists`);
  }
}

/* --------------------------------------------------------------- meta */
G('meta upgrades');
{
  eq(spentTotal({}), 0, 'nothing spent by default');
  eq(spentTotal({ might: 2 }), META[0].cost[0] + META[0].cost[1], 'refund totals the ranks bought');
  eq(spentTotal({ might: 99 }), META[0].cost.reduce((a, b) => a + b, 0), 'refund clamps to max rank');
  const b = metaBonuses({ might: 3, vigor: 1 });
  near(b.dmgMul, META.find((m) => m.id === 'might').val[2], 1e-9, 'damage bonus reads the right rank');
  near(b.hpAdd, META.find((m) => m.id === 'vigor').val[0], 1e-9, 'hp bonus reads the right rank');
  eq(metaBonuses({}).dmgMul, undefined, 'no bonuses when nothing is bought');
  // stat names must be ones the game actually reads
  const known = new Set(['dmgMul', 'hpAdd', 'armor', 'spdMul', 'xpMul', 'magnetMul', 'regen', 'luck',
    'burstCdMul', 'rerolls', 'banishes', 'headstart', 'revives', 'shardMul']);
  for (const m of META) ok(known.has(m.stat), `meta stat "${m.stat}" is consumed by recomputeStats`);
}

/* ------------------------------------------------------------- upgrades */
G('upgrade offers');
{
  // a minimal stand-in for Game: just what buildChoices/applyChoice touch
  const mkGame = () => {
    const g = {
      rng: new Rng(3), weapons: [], passives: [], banned: new Set(), evolved: [],
      st: { luck: 0 }, runShards: 0, p: { x: 0, y: 0 },
      fx: { blast() {}, ring() {} }, snd: { chest() {} },
      shake() {}, healPlayer() {}, recomputeStats() {},
      addWeapon(id) { const w = { def: WEAPON_BY_ID[id], lv: 1 }; g.weapons.push(w); return w; },
    };
    return g;
  };

  const g = mkGame();
  g.addWeapon('bolt');
  const c1 = buildChoices(g, 3);
  eq(c1.length, 3, 'returns the requested number of offers');
  eq(new Set(c1.map((c) => c.id)).size, 3, 'offers are distinct');
  ok(c1.every((c) => c.type !== 'evo'), 'no evolution offered before requirements are met');

  // banned ids never come back
  g.banned.add('nova');
  for (let i = 0; i < 60; i++) {
    ok(!buildChoices(g, 4).some((c) => c.id === 'nova'), 'banished upgrades stay out of the pool');
  }

  // slot limits are respected
  const full = mkGame();
  for (const w of WEAPONS.slice(0, MAX_WEAPONS)) full.addWeapon(w.id);
  for (let i = 0; i < 200; i++) {
    for (const c of buildChoices(full, 4)) {
      ok(!(c.type === 'weapon' && c.lv === 1), 'no new weapons once every slot is full');
    }
  }
  const fullP = mkGame();
  fullP.passives = PASSIVES.slice(0, MAX_PASSIVES).map((def) => ({ def, lv: 1 }));
  for (let i = 0; i < 100; i++) {
    for (const c of buildChoices(fullP, 4)) {
      ok(!(c.type === 'passive' && c.lv === 1), 'no new passives once every slot is full');
    }
  }

  // maxed weapons stop being offered
  const maxed = mkGame();
  const bolt = maxed.addWeapon('bolt');
  bolt.lv = 8;
  for (let i = 0; i < 100; i++) {
    ok(!buildChoices(maxed, 4).some((c) => c.type === 'weapon' && c.id === 'bolt'),
      'a maxed weapon is not offered again');
  }

  // evolution appears once the passive requirement is met, and replaces in place
  const evoG = mkGame();
  evoG.addWeapon('orbit');           // slot 0
  const b2 = evoG.addWeapon('bolt'); // slot 1
  b2.lv = 8;
  evoG.passives.push({ def: PASSIVE_BY_ID.power, lv: 4 });
  const offers = buildChoices(evoG, 3);
  const evo = offers.find((c) => c.type === 'evo');
  ok(evo && evo.id === 'bolt_x', 'evolution is offered when weapon is maxed and passive is level 4');
  applyChoice(evoG, evo);
  eq(evoG.weapons.length, 2, 'evolving does not consume an extra weapon slot');
  eq(evoG.weapons[1].def.id, 'bolt_x', 'the evolved weapon takes the original slot');
  eq(evoG.weapons[0].def.id, 'orbit', 'other weapons keep their slots');
  ok(!buildChoices(evoG, 4).some((c) => c.type === 'evo' && c.id === 'bolt_x'), 'an evolution is only offered once');

  // levelling up an owned weapon increments it
  const lvG = mkGame();
  const w = lvG.addWeapon('bolt');
  applyChoice(lvG, { type: 'weapon', id: 'bolt', def: WEAPON_BY_ID.bolt, lv: 2, own: w });
  eq(w.lv, 2, 'level-up bumps the owned weapon');
  applyChoice(lvG, { type: 'passive', id: 'power', def: PASSIVE_BY_ID.power, lv: 1 });
  eq(lvG.passives.length, 1, 'a new passive is added');
  applyChoice(lvG, { type: 'shard', id: 'shard_0', lv: 1 });
  eq(lvG.runShards, 25, 'shard fallback pays out');

  // fallbacks when everything is exhausted
  const done = mkGame();
  for (const wd of WEAPONS.slice(0, MAX_WEAPONS)) done.addWeapon(wd.id).lv = 8;
  done.passives = PASSIVES.slice(0, MAX_PASSIVES).map((def) => ({ def, lv: def.max }));
  const fb = buildChoices(done, 3);
  eq(fb.length, 3, 'still offers three cards when the pool is dry');
  ok(fb.every((c) => c.type === 'heal' || c.type === 'shard' || c.type === 'evo'),
    'dry pool falls back to heal/shard/evolution');
}

/* ------------------------------------------------------------ card text */
G('card text');
{
  for (const w of ALL_WEAPONS) {
    for (let lv = 1; lv <= w.max; lv++) {
      const s = weaponDelta(w, lv);
      ok(typeof s === 'string' && s.length > 0, `${w.id} lv${lv} has description text`);
      ok(!s.includes('undefined') && !s.includes('NaN'), `${w.id} lv${lv} text is clean: ${s}`);
    }
  }
  for (const p of PASSIVES) {
    for (let lv = 1; lv <= p.max; lv++) {
      const s = passiveDelta(p, lv);
      ok(typeof s === 'string' && s.length > 0, `${p.id} lv${lv} has description text`);
      ok(!s.includes('undefined') && !s.includes('NaN'), `${p.id} lv${lv} text is clean: ${s}`);
    }
  }
  const g = { st: { crit: 0.1, critMul: 2, haste: 0, projAdd: 0, dmgMul: 1 } };
  const info = cardInfo(g, { type: 'heal', id: 'heal_0', lv: 1 });
  ok(info.title && info.sub, 'fallback cards still render');
}

/* ------------------------------------------------------------------ done */
console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
