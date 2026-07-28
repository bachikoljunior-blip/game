/**
 * Game — owns the run: entities, stats, damage rules, progression.
 * UI talks to it through callbacks (onLevelUp / onChest / onEnd / onHud).
 */
import { Pool } from '../core/pool.js';
import { SpatialGrid } from '../core/grid.js';
import { Rng } from '../core/rng.js';
import { clamp, TAU, dist2, damp } from '../core/util.js';
import { save } from '../core/save.js';
import { metaBonuses } from '../data/meta.js';
import { CHAR_BY_ID } from '../data/characters.js';
import { WEAPON_BY_ID } from '../data/weapons.js';
import { ENEMY_BY_ID } from '../data/enemies.js';
import { Fx } from './particles.js';
import { Director, RUN_LEN } from './waves.js';
import { mkEnemy, initEnemy, updateEnemies, drawEnemies } from './enemies.js';
import { BOSS_DEF, drawBoss } from './boss.js';
import * as E from './entities.js';

/**
 * XP curve. Tuned so a clean 10-minute run lands around level 30 — roughly one
 * upgrade every 15-25s, which is the pace the card flow is designed around.
 */
export const XP_NEED = (lv) => Math.floor(7 + (lv - 1) * 4.1 + Math.pow(lv - 1, 2) * 0.03);

export class Game {
  constructor(r, input, snd) {
    this.r = r; this.input = input; this.snd = snd;
    this.rng = new Rng(1);
    this.fx = new Fx(this.rng);
    this.enemies = new Pool(mkEnemy, 256);
    this.bullets = new Pool(E.mkBullet, 128);
    this.ebullets = new Pool(E.mkEBullet, 64);
    this.waves = new Pool(E.mkWave, 8);
    this.zones = new Pool(E.mkZone, 16);
    this.beams = new Pool(E.mkBeam, 8);
    this.gems = new Pool(E.mkGem, 256);
    this.drops = new Pool(E.mkDrop, 16);
    this.egrid = new SpatialGrid(52);
    this.director = new Director(this);
    this.boss = { ai: BOSS_DEF.ai };
    this.p = {
      x: 0, y: 0, vx: 0, vy: 0, r: 12, hp: 100, maxHp: 100, inv: 0, face: -Math.PI / 2,
      hitFlash: 0, trail: 0, spin: 0, hurtT: 0, hurtDir: 0,
    };
    this.aim = { x: 1, y: 0 };
    this.st = {};
    this.diff = { hpMul: 1, dmgMul: 1, rate: 1 };
    this.state = 'idle';     // idle | playing | over
    this.hitstop = 0;
    this.time = 0;
    this.onLevelUp = null; this.onChest = null; this.onEnd = null; this.onAlert = null;
    /** Set by the UI: true while a modal owns the screen, so prompts queue up. */
    this.uiBusy = () => false;
    this.frame = 0;
    this._chainSeen = new Set();
  }

  /* ------------------------------------------------------------------ setup */
  start(charId, endless) {
    const ch = CHAR_BY_ID[charId] || CHAR_BY_ID.lumina;
    this.char = ch;
    this.endless = !!endless;
    this.rng.seed(((Math.random() * 0xffffffff) >>> 0) || 7);
    this.meta = metaBonuses(save.data.meta);

    this.enemies.clear(); this.bullets.clear(); this.ebullets.clear();
    this.waves.clear(); this.zones.clear(); this.beams.clear();
    this.gems.clear(); this.drops.clear(); this.fx.clear();

    this.time = 0; this.frame = 0;
    this.level = 1; this.xp = 0; this.xpNeed = XP_NEED(1);
    this.kills = 0; this.dmgDone = 0; this.runShards = 0;
    this.pendingLevels = 0;
    this.pendingChests = 0;
    this.banned = new Set();
    this.evolved = [];
    this.weapons = []; this.passives = [];
    this.director.reset();

    const p = this.p;
    p.x = 0; p.y = 0; p.vx = p.vy = 0; p.inv = 1.2; p.hitFlash = 0;
    this.r.snapCam(0, 0);
    this.r.tint = 0;
    this.r.setPalette([5, 7, 16], [90, 150, 230], true);

    this.recomputeStats();
    p.hp = p.maxHp = this.st.maxHp;
    this.rerolls = this.st.rerolls;
    this.banishes = this.st.banishes;
    this.revives = this.st.revives;
    this.burstT = 0;

    this.addWeapon(ch.weapon);
    this.recomputeStats();
    save.see('seenWeapons', ch.weapon);

    this.maxEnemies = this.r.mode === 'low' ? 170 : 300;
    this.fx.setCap(this.r.q.maxParticles);
    this.updateBounds();
    this.state = 'playing';
    this.bossRef = null;
    this.won = false;

    for (let i = 0; i < (this.st.headstart | 0); i++) this.pendingLevels++;
  }

  updateBounds() {
    this.spawnR = this.r.viewRadius(70);
    this.cullR = this.r.viewRadius(260);
  }

  addWeapon(id, isEvo) {
    const def = WEAPON_BY_ID[id];
    if (!def) return null;
    const w = { def, lv: 1, t: 0, phase: 0, drones: [] };
    if (def.init) def.init(this, w);
    this.weapons.push(w);
    save.see('seenWeapons', id);
    if (isEvo) save.see('evolved', id);
    return w;
  }

  /* ------------------------------------------------------------------ stats */
  recomputeStats() {
    const b = this.char.base, m = this.meta || {};
    const st = this.st;
    const P = (id) => {
      const p = this.passives.find((x) => x.def.id === id);
      return p ? p.def.val[p.lv - 1] : 0;
    };
    const PX = (id) => {
      const p = this.passives.find((x) => x.def.id === id);
      return p && p.def.extra ? p.def.extra.val[p.lv - 1] : 0;
    };

    const hpMulP = P('vitality');
    st.maxHp = Math.round((b.hp + (m.hpAdd || 0)) * (1 + hpMulP));
    st.spd = b.spd * (1 + P('swift') + (m.spdMul || 0));
    st.armor = b.armor + P('armor') + (m.armor || 0);
    st.dmgMul = b.dmgMul * (1 + P('power') + (m.dmgMul || 0));
    st.haste = b.haste + P('haste');
    st.areaMul = P('area');
    st.projAdd = P('multishot');
    st.crit = clamp(b.crit + P('focus'), 0, 0.95);
    st.critMul = b.critMul + PX('focus');
    st.xpMul = b.xpMul * (1 + P('insight') + (m.xpMul || 0));
    st.magnet = 112 * (1 + b.magnetMul + P('magnet') + (m.magnetMul || 0));
    st.luck = b.luck + P('luck') + (m.luck || 0);
    st.regen = b.regen + P('regen') + (m.regen || 0);
    st.burstPow = P('overdrive');
    st.burstCd = b.burstCd * (1 + PX('overdrive') + (m.burstCdMul || 0));
    st.rerolls = 1 + (m.rerolls || 0);
    st.banishes = m.banishes || 0;
    st.revives = m.revives || 0;
    st.headstart = m.headstart || 0;
    st.shardMul = 1 + (m.shardMul || 0);

    const p = this.p;
    if (p.maxHp !== st.maxHp) {
      const gain = st.maxHp - p.maxHp;
      p.maxHp = st.maxHp;
      if (gain > 0) p.hp = Math.min(p.maxHp, p.hp + gain);
      p.hp = Math.min(p.hp, p.maxHp);
    }
  }

  /* ------------------------------------------------------------------ update */
  update(dt) {
    if (this.state !== 'playing') return;
    this.frame++;
    this.time += dt;
    if ((this.frame & 31) === 0) this.updateBounds();

    const p = this.p, st = this.st, inp = this.input;

    // ---- movement
    inp.sample();
    const mx = inp.mx, my = inp.my;
    const mag = Math.hypot(mx, my);
    const tvx = mx * st.spd, tvy = my * st.spd;
    p.vx = damp(p.vx, tvx, 16, dt);
    p.vy = damp(p.vy, tvy, 16, dt);
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (mag > 0.05) {
      this.aim.x = mx / mag; this.aim.y = my / mag;
      p.face = Math.atan2(my, mx);
      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = 0.03;
        this.fx.trail(p.x - p.vx * 0.03, p.y - p.vy * 0.03, '#63f4ff', 3.4, 0.28);
      }
    }
    p.spin += dt * (1.2 + mag * 2.4);
    if (p.inv > 0) p.inv -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (st.regen > 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + st.regen * dt);
    }

    // ---- burst
    if (this.burstT > 0) this.burstT -= dt;
    if (inp.takeBurst()) this.doBurst();

    // ---- director & spatial index
    this.director.update(dt);
    this.egrid.clear();
    const EL = this.enemies.live;
    for (let i = 0; i < EL.length; i++) this.egrid.insert(EL[i]);

    // ---- weapons
    for (let i = 0; i < this.weapons.length; i++) {
      const w = this.weapons[i];
      if (w.def.tick) w.def.tick(this, w, dt);
      if (!w.def.fire) continue;
      w.t -= dt;
      if (w.t <= 0) {
        const cd = w.def.stats.cd;
        const base = Array.isArray(cd) ? cd[Math.min(cd.length - 1, w.lv - 1)] : cd;
        w.t = Math.max(0.05, base / (1 + this.st.haste));
        w.def.fire(this, w);
      }
    }

    updateEnemies(this, dt);
    E.updateBullets(this, dt);
    E.updateEBullets(this, dt);
    E.updateWaves(this, dt);
    E.updateZones(this, dt);
    E.updateBeams(this, dt);
    E.updateGems(this, dt);
    E.updateDrops(this, dt);
    this.fx.update(dt);

    // ---- camera & mood
    this.r.follow(p.x, p.y, p.vx, p.vy);
    const threat = clamp(this.enemies.count / 150, 0, 1) * 0.45 + clamp(this.time / RUN_LEN, 0, 1) * 0.55;
    this.r.tint = damp(this.r.tint, threat, 1.5, dt);
    this.intensity = clamp(threat * (this.bossRef ? 1.2 : 1), 0, 1);

    // One prompt at a time: a chest opening in the same frame as a level-up
    // must not stomp the other's modal.
    if (!this.uiBusy()) {
      if (this.pendingChests > 0 && this.onChest) {
        this.pendingChests--;
        this.onChest();
      } else if (this.pendingLevels > 0 && this.onLevelUp) {
        this.pendingLevels--;
        this.onLevelUp();
      }
    }
  }

  /* ------------------------------------------------------------- spawn API */
  spawnEnemy(id, x, y, hpMul, elite) {
    if (this.enemies.count >= this.maxEnemies + (elite ? 40 : 0)) return null;
    const def = ENEMY_BY_ID[id];
    if (!def) return null;
    const e = this.enemies.spawn();
    initEnemy(e, def, x, y, hpMul || this.diff.hpMul, this.diff.dmgMul, elite);
    save.see('seenEnemies', id);
    if (elite) this.fx.ring(x, y, 60, '#ffcf5c', 0.5, 4);
    return e;
  }

  spawnBoss() {
    const a = this.rng.angle();
    const e = this.enemies.spawn();
    const hp = BOSS_DEF.hp * (1 + this.time / 240) * (this.endless ? 1 + this.director.loop * 0.5 : 1);
    initEnemy(e, BOSS_DEF, this.p.x + Math.cos(a) * this.spawnR, this.p.y + Math.sin(a) * this.spawnR, 1, this.diff.dmgMul, false);
    e.maxHp = e.hp = hp;
    e.boss = true; e.r = BOSS_DEF.r; e.st = -1; e.atkT = 2; e.atk = 0; e.dash = 0;
    this.bossRef = e;
    this.fx.blast(e.x, e.y, 300, '#b06bff', 0.7);
    this.shake(12);
    this.snd.boom(1.8);
    return e;
  }

  bullet(o) {
    const b = this.bullets.spawn();
    b.x = o.x; b.y = o.y; b.vx = o.vx; b.vy = o.vy; b.r = o.r; b.dmg = o.dmg;
    b.life = b.max = o.life; b.kind = o.kind; b.color = o.color; b.beh = o.beh || 'straight';
    b.pierce = o.pierce | 0; b.wid = o.wid; b.knock = o.knock || 0; b.turn = o.turn || 0;
    b.rot = o.rot || 0; b.len = o.len || 0; b.spin = o.spin || 0; b.range = o.range || 0;
    b.burst = o.burst || 0; b.burstMul = o.burstMul || 0.5; b.hitCd = o.hitCd || 0;
    b.dist = 0; b.back = false; b.ret = 0; b.tgt = null;
    b.hits.clear();
    return b;
  }
  ebullet(x, y, vx, vy, r, dmg, color) {
    const b = this.ebullets.spawn();
    b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.r = r; b.dmg = dmg; b.color = color;
    b.life = 6; b.rot = this.rng.angle(); b.spin = 4;
    return b;
  }
  clearEBullets() {
    const L = this.ebullets.live;
    for (let i = 0; i < L.length; i++) { this.fx.spark(L[i].x, L[i].y, 3, L[i].color, 90); L[i].alive = false; }
    this.ebullets.sweep();
  }
  wave(o) {
    const w = this.waves.spawn();
    w.x = o.x; w.y = o.y; w.r = 4; w.maxR = o.maxR; w.speed = o.speed; w.dmg = o.dmg;
    w.knock = o.knock || 0; w.color = o.color; w.wid = o.wid; w.width = o.width || 8; w.delay = o.delay || 0;
    w.hits.clear();
    return w;
  }
  zone(o) {
    const z = this.zones.spawn();
    z.x = o.x; z.y = o.y; z.r = o.r; z.dps = o.dps; z.life = z.max = o.life;
    z.color = o.color; z.wid = o.wid; z.pull = o.pull || 0; z.t = 0;
    return z;
  }
  beam(o) {
    const b = this.beams.spawn();
    b.pts = o.pts; b.life = b.max = o.life; b.color = o.color; b.glow = o.glow || o.color; b.width = o.width;
    return b;
  }

  /* ------------------------------------------------------------- damage API */
  lock(e, key, cd) {
    const until = e.lock[key];
    if (until !== undefined && until > this.time) return false;
    e.lock[key] = this.time + cd;
    return true;
  }

  nearest(x, y, r) {
    return this.egrid.nearest(x, y, r, aliveFilter);
  }
  enemiesIn(x, y, r, fn) {
    const r2 = r * r;
    this.egrid.query(x, y, r + 30, (e) => {
      if (!e.alive) return;
      const rr = r + e.r;
      if (dist2(x, y, e.x, e.y) <= rr * rr) fn(e);
    });
  }

  hurt(e, dmg, o) {
    if (!e.alive) return 0;
    o = o || {};
    let crit = o.crit;
    if (crit === undefined) crit = this.rng.f() < this.st.crit;
    let d = dmg * (crit ? this.st.critMul : 1);

    if (e.def.shield && (o.kx !== undefined)) {
      const dot = o.kx * Math.cos(e.face) + o.ky * Math.sin(e.face);
      if (dot < -0.15) d *= 1 - e.def.shield;
    }
    e.hp -= d;
    this.dmgDone += d;
    e.hitT = 0.09;
    if (o.stun) e.stun = Math.max(e.stun, o.stun);

    if (o.knock && !e.boss) {
      const res = 1 - (e.def.knockRes || 0);
      const k = o.knock * res;
      e.kx += (o.kx || 0) * k; e.ky += (o.ky || 0) * k;
    }
    if (!o.quiet) {
      this.fx.dmg(e.x, e.y - e.r * 0.4, d, crit);
      if (crit) this.snd.crit(); else this.snd.hit(d > 40);
    }
    if (e.hp <= 0) this.kill(e);
    return d;
  }

  aoe(x, y, r, dmg, o) {
    o = o || {};
    this.enemiesIn(x, y, r, (e) => {
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
      this.hurt(e, dmg, { knock: o.knock, kx: dx / d, ky: dy / d, wid: o.wid, quiet: o.quiet });
    });
  }

  lineHit(x1, y1, x2, y2, width, dmg, o) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    this.egrid.query(mx, my, len / 2 + width + 40, (e) => {
      if (!e.alive) return;
      const px = e.x - x1, py = e.y - y1;
      const t = clamp(px * ux + py * uy, 0, len);
      const cx = x1 + ux * t, cy = y1 + uy * t;
      const rr = width * 0.5 + e.r;
      if (dist2(cx, cy, e.x, e.y) > rr * rr) return;
      this.hurt(e, dmg, { knock: o.knock, kx: ux, ky: uy, wid: o.wid });
    });
  }

  chain(first, chains, range, dmg, wid, color, stun, falloff) {
    const seen = this._chainSeen;
    seen.clear();
    const nodes = [this.p.x, this.p.y];
    let cur = first;
    for (let i = 0; i <= chains && cur; i++) {
      seen.add(cur.uid);
      nodes.push(cur.x, cur.y);
      const drop = Math.pow(falloff === undefined ? 0.96 : falloff, i);
      this.hurt(cur, dmg * drop, { knock: 20, kx: 0, ky: 0, wid, stun });
      this.fx.spark(cur.x, cur.y, 4, color, 150);
      let next = null, bd = range * range;
      this.egrid.query(cur.x, cur.y, range, (e) => {
        if (!e.alive || seen.has(e.uid)) return;
        const d = dist2(cur.x, cur.y, e.x, e.y);
        if (d < bd) { bd = d; next = e; }
      });
      cur = next;
    }
    if (nodes.length >= 4) {
      this.beam({ pts: jagged(nodes, this.rng), life: 0.22, color: '#ffffff', glow: color, width: 7 });
    }
  }

  aoeSelfHarm(x, y, r, dmg) {
    const p = this.p;
    const rr = r + p.r;
    if (dist2(x, y, p.x, p.y) < rr * rr) this.hitPlayer(dmg, x, y);
  }

  /* ------------------------------------------------------------------ death */
  kill(e) {
    e.alive = false;
    this.kills++;
    const def = e.def;

    this.fx.debris(e.x, e.y, e.elite ? 12 : e.boss ? 40 : 5, def.color, e.r * 0.45, def.sides, e.boss ? 320 : 150);
    this.fx.spark(e.x, e.y, e.boss ? 60 : e.elite ? 16 : 6, '#ffffff', e.boss ? 420 : 190);
    if (e.boss || e.elite) {
      this.fx.blast(e.x, e.y, e.boss ? 320 : 120, def.color, 0.5);
      this.shake(e.boss ? 22 : 7);
      this.snd.boom(e.boss ? 2 : 1);
      this.hitstop = e.boss ? 0.28 : 0.07;
    } else this.snd.kill();

    // XP
    let xp = e.xp;
    while (xp > 0) {
      const tier = xp >= 25 ? 2 : xp >= 6 ? 1 : 0;
      const v = tier === 2 ? Math.min(xp, 100) : tier === 1 ? Math.min(xp, 24) : Math.min(xp, 5);
      this.spawnGem(e.x, e.y, v, tier);
      xp -= v;
      if (this.gems.count > 700) break;
    }

    // drops
    const luck = 1 + this.st.luck;
    const roll = this.rng.f();
    if (e.elite || e.boss) this.drop(e.x, e.y, 'chest');
    else if (roll < 0.020 * luck) this.drop(e.x, e.y, 'heart');
    else if (roll < 0.030 * luck) this.drop(e.x, e.y, 'magnet');
    else if (roll < 0.038 * luck) this.drop(e.x, e.y, 'bomb');
    else if (roll < 0.085 * luck) this.drop(e.x, e.y, 'shard');

    if (def.onDeath) def.onDeath(this, e);

    if (e.boss) {
      this.bossRef = null;
      if (this.endless) {                       // endless: the Core reforms, harder
        this.director.bossSpawned = false;
        this.director.warned = false;
        this.director.bossAt = this.time + 100;
        this.director.loop++;
        this.alert(this.endless ? 'CORE REFORMING' : '', 'bad');
      }
      else this.finish(true);
    }
  }

  spawnGem(x, y, v, tier) {
    const g = this.gems.spawn();
    const a = this.rng.angle(), s = 40 + this.rng.f() * 70;
    g.x = x; g.y = y; g.vx = Math.cos(a) * s; g.vy = Math.sin(a) * s;
    g.v = v; g.tier = tier; g.t = this.rng.f() * 6; g.pull = false;
  }
  drop(x, y, kind) {
    const d = this.drops.spawn();
    const a = this.rng.angle(), s = 30 + this.rng.f() * 40;
    d.x = x; d.y = y; d.vx = Math.cos(a) * s; d.vy = Math.sin(a) * s;
    d.kind = kind; d.t = 0; d.life = kind === 'chest' ? 60 : 26;
  }

  collectGem(gm) {
    this.xp += gm.v * this.st.xpMul;
    this.snd.pickup(this.kills);
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = XP_NEED(this.level);
      this.pendingLevels++;
      this.fx.ring(this.p.x, this.p.y, 110, '#9dffea', 0.5, 4);
      this.fx.spark(this.p.x, this.p.y, 14, '#c8fff0', 190);
    }
  }

  collectDrop(d) {
    switch (d.kind) {
      case 'heart':
        this.healPlayer(Math.max(25, this.p.maxHp * 0.3));
        break;
      case 'magnet': {
        const L = this.gems.live;
        for (let i = 0; i < L.length; i++) L[i].pull = true;
        this.snd.coin();
        this.fx.ring(this.p.x, this.p.y, 400, '#63f4ff', 0.6, 5);
        break;
      }
      case 'bomb': {
        const R = 520;
        this.aoe(this.p.x, this.p.y, R, 220 * this.st.dmgMul, { knock: 320, wid: 'bomb' });
        this.fx.blast(this.p.x, this.p.y, R * 0.7, '#ffb45c', 0.5);
        this.fx.ring(this.p.x, this.p.y, R, '#fff', 0.7, 8);
        this.clearEBullets();
        this.shake(16);
        this.snd.boom(2);
        break;
      }
      case 'chest':
        this.snd.chest();
        this.pendingChests++;
        break;
      case 'shard':
        this.runShards += 4 + Math.floor(this.rng.f() * 4);
        this.snd.coin();
        break;
    }
  }

  healPlayer(n) {
    const before = this.p.hp;
    this.p.hp = Math.min(this.p.maxHp, this.p.hp + n);
    const got = Math.round(this.p.hp - before);
    if (got > 0) {
      this.fx.heal(this.p.x, this.p.y, '+' + got);
      this.snd.heal();
    }
  }

  hitPlayer(dmg, srcX, srcY) {
    const p = this.p;
    if (p.inv > 0 || this.state !== 'playing') return;
    if (srcX !== undefined) { p.hurtDir = Math.atan2(srcY - p.y, srcX - p.x); p.hurtT = 0.75; }
    const d = Math.max(1, dmg - this.st.armor);
    p.hp -= d;
    p.inv = 0.72;
    p.hitFlash = 0.32;
    this.hitstop = 0.05;
    this.shake(5 + Math.min(8, d * 0.25));
    this.snd.hurt();
    this.fx.spark(p.x, p.y, 10, '#ff6b8a', 200);
    if (navigator.vibrate && save.opts.haptics) navigator.vibrate(30);
    if (this.onHurt) this.onHurt(d);
    if (p.hp <= 0) {
      if (this.revives > 0) {
        this.revives--;
        p.hp = p.maxHp * 0.5;
        p.inv = 3;
        this.aoe(p.x, p.y, 620, 400 * this.st.dmgMul, { knock: 500, wid: 'revive' });
        this.clearEBullets();
        this.fx.blast(p.x, p.y, 520, '#63f4ff', 0.9);
        this.fx.ring(p.x, p.y, 700, '#fff', 1, 10);
        this.shake(24);
        this.snd.win();
        this.alert('REBOOT', 'good');
      } else {
        p.hp = 0;
        this.finish(false);
      }
    }
  }

  doBurst() {
    if (this.burstT > 0 || this.state !== 'playing') return;
    this.burstT = this.st.burstCd;
    const p = this.p;
    const R = 270 * (1 + this.st.areaMul);
    const dmg = 130 * (1 + this.st.burstPow) * this.st.dmgMul;
    this.wave({ x: p.x, y: p.y, maxR: R, speed: R / 0.3, dmg, knock: 480, color: '#9ef7ff', wid: 'burst', width: 16 });
    this.clearEBullets();
    p.inv = Math.max(p.inv, 1.1);
    this.fx.blast(p.x, p.y, R * 0.75, '#63f4ff', 0.5);
    this.fx.ring(p.x, p.y, R, '#ffffff', 0.5, 6);
    this.fx.spark(p.x, p.y, 30, '#bff4ff', 320);
    this.shake(13);
    this.snd.burst();
    if (navigator.vibrate && save.opts.haptics) navigator.vibrate([0, 18, 26, 18]);
  }

  shake(n) { this.r.shake(n); }
  alert(text, cls) { if (this.onAlert) this.onAlert(text, cls); }

  finish(won) {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.won = won;
    const p = this.p;
    if (!won) {
      this.fx.blast(p.x, p.y, 260, '#ff5c8a', 0.9);
      this.fx.debris(p.x, p.y, 26, '#63f4ff', 6, 3, 260);
      this.shake(20);
      this.snd.lose();
    } else {
      this.snd.win();
    }
    if (this.onEnd) this.onEnd(won);
  }

  /* ------------------------------------------------------------------- draw */
  draw() {
    const r = this.r;
    // 1. low-res glow pass (feeds the bloom)
    if (r.glowBegin()) {
      r.world();
      this.scene(r.ctx, r, true);
      r.glowEnd();
    }
    // 2. crisp main pass
    r.begin();
    r.world();
    this.scene(r.ctx, r, false);
    // 3. additive glow on top, then text (kept out of the blur so it stays legible)
    r.bloom();
    r.world();
    this.fx.drawText(r.ctx, r);
    this.drawOffscreenMarkers(r);
  }

  /**
   * Edge markers for threats you cannot see. Without these, a boss circling
   * just outside the view shoots at you from nowhere.
   */
  drawOffscreenMarkers(r) {
    const L = this.enemies.live;
    const ctx = r.ctx;
    const w = r.w, h = r.h, pad = 26;
    const cx = w * 0.5, cy = h * 0.5;
    r.screen();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!e.boss && !e.elite) continue;
      const sx = (e.x - r.cam.x) * r.scale + cx;
      const sy = (e.y - r.cam.y) * r.scale + cy;
      if (sx > pad && sx < w - pad && sy > pad && sy < h - pad) continue;
      const dx = sx - cx, dy = sy - cy;
      const len = Math.hypot(dx, dy) || 1;
      // clamp to the inset rectangle along the direction of the threat
      const k = Math.min((cx - pad) / Math.max(1e-3, Math.abs(dx)), (cy - pad) / Math.max(1e-3, Math.abs(dy)));
      const mx = cx + dx * k, my = cy + dy * k;
      const a = Math.atan2(dy, dx);
      const col = e.boss ? '#ff8ad8' : '#ffcf5c';
      const size = e.boss ? 13 : 9;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(a);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.7, size * 0.62);
      ctx.lineTo(-size * 0.35, 0);
      ctx.lineTo(-size * 0.7, -size * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(mx, my, size * 1.7, 0, TAU);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The world, drawn once. Called twice per frame: glow pass, then main pass. */
  scene(ctx, r, glow) {
    E.drawZones(this, ctx, r);
    E.drawGems(this, ctx, r);
    E.drawDrops(this, ctx, r);
    drawEnemies(this, ctx, r, glow);
    if (this.bossRef && this.bossRef.alive) drawBoss(this, this.bossRef, ctx, r);
    E.drawWaves(this, ctx, r);
    E.drawEBullets(this, ctx, r);
    E.drawBullets(this, ctx, r);
    for (let i = 0; i < this.weapons.length; i++) {
      const w = this.weapons[i];
      if (w.def.draw) w.def.draw(this, w, ctx, r);
    }
    E.drawBeams(this, ctx, r);
    this.drawPlayer(ctx, r, glow);
    this.fx.draw(ctx, r);
  }

  drawPlayer(ctx, r, glow) {
    const p = this.p;
    if (this.state === 'over' && !this.won) return;
    const flash = p.hitFlash > 0 && ((this.frame >> 1) & 1);
    const inv = p.inv > 0;

    if (!glow) {                       // pickup radius hint (never blooms)
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = '#63f4ff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, this.st.magnet, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // The glow pass gets a deliberately restrained version of the ship:
    // a bright hull in both passes turns the player into a featureless white
    // ball once the bloom lands on it.
    r.glow(p.x, p.y, glow ? 20 : 26, flash ? '#ffffff' : '#63f4ff', glow ? 0.42 : 0.28);

    // rotating guard arcs
    ctx.strokeStyle = inv ? '#ffffff' : '#63f4ff';
    ctx.globalAlpha = inv ? 0.95 : 0.7;
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 3; i++) {
      const a = p.spin + (i / 3) * TAU;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 22, a, a + 1.3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // hull
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.face);
    ctx.beginPath();
    ctx.moveTo(14.5, 0); ctx.lineTo(-8, 10); ctx.lineTo(-4, 0); ctx.lineTo(-8, -10);
    ctx.closePath();
    if (glow) {
      ctx.strokeStyle = flash ? '#ffffff' : '#6fe6ff';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    } else {
      ctx.fillStyle = flash ? '#ffffff' : '#dff4ff';
      ctx.fill();
      ctx.strokeStyle = flash ? '#ff5c8a' : '#2ea8c8';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    ctx.restore();

    // core dot
    if (!glow) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.8, 0, TAU); ctx.fill();
    }

    if (p.hurtT > 0 && !glow) {          // where did that come from?
      const k = p.hurtT / 0.75;
      ctx.globalAlpha = k * 0.85;
      ctx.strokeStyle = '#ff5c8a';
      ctx.lineWidth = 4 + k * 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 34 - k * 4, p.hurtDir - 0.55, p.hurtDir + 0.55);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    }

    if (this.p.hp / this.p.maxHp < 0.34) {
      const k = 0.5 + Math.sin(this.time * 8) * 0.5;
      r.ring(p.x, p.y, 26 + k * 4, '#ff5c8a', 2, 0.35 + k * 0.35);
    }
  }
}

const aliveFilter = (e) => e.alive && !e.dying;

/**
 * Turns a polyline into a lightning bolt: each span is subdivided and the
 * midpoints are pushed sideways, so an arc looks electric instead of ruled.
 */
function jagged(nodes, rng) {
  const out = [nodes[0], nodes[1]];
  for (let i = 2; i < nodes.length; i += 2) {
    const x0 = nodes[i - 2], y0 = nodes[i - 1], x1 = nodes[i], y1 = nodes[i + 1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    const steps = len > 60 ? 3 : 2;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const off = (rng.f() - 0.5) * Math.min(26, len * 0.3);
      out.push(x0 + dx * t + px * off, y0 + dy * t + py * off);
    }
    out.push(x1, y1);
  }
  return out;
}
