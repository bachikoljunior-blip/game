/**
 * Wave director — decides what spawns, how much of it, and in what shape.
 * A steady trickle scaled by time, punctuated by scripted formations,
 * elites, and finally the boss at RUN_LEN.
 */
import { TAU, clamp } from '../core/util.js';
import { t as T } from '../core/i18n.js';

export const RUN_LEN = 600;            // seconds until the Core awakens

const TABLE = [
  { t: 0, w: { drift: 10 } },
  { t: 32, w: { drift: 10, swarm: 5 } },
  { t: 75, w: { drift: 9, swarm: 7, weaver: 3 } },
  { t: 125, w: { drift: 8, swarm: 7, weaver: 4, bomber: 2.5, brute: 1.5 } },
  { t: 185, w: { drift: 6, swarm: 7, weaver: 4, bomber: 3, brute: 3, charger: 3 } },
  { t: 255, w: { drift: 5, swarm: 6, weaver: 4, bomber: 3, brute: 4, charger: 4, spitter: 3 } },
  { t: 335, w: { swarm: 6, weaver: 4, bomber: 3, brute: 4, charger: 4, spitter: 3, splitter: 4, phantom: 2 } },
  { t: 415, w: { swarm: 6, weaver: 4, bomber: 3, brute: 5, charger: 4, spitter: 3, splitter: 4, phantom: 3, warden: 2, summoner: 1.5 } },
  { t: 500, w: { swarm: 7, weaver: 4, bomber: 4, brute: 6, charger: 5, spitter: 4, splitter: 5, phantom: 4, warden: 3, summoner: 2 } },
];

/** [time, kind, arg] scripted beats. */
const EVENTS = [
  [60, 'ring', 'drift', 16],
  [90, 'cluster', 'swarm', 16],
  [120, 'horde', 'swarm', 34],
  [150, 'elite', 'brute', 1],
  [180, 'line', 'charger', 9],
  [210, 'ring', 'weaver', 20],
  [240, 'horde', 'drift', 40],
  [270, 'elite', 'charger', 1],
  [300, 'ring', 'bomber', 18],
  [330, 'cluster', 'splitter', 14],
  [360, 'horde', 'swarm', 52],
  [390, 'elite', 'warden', 2],
  [420, 'line', 'phantom', 14],
  [450, 'ring', 'brute', 16],
  [480, 'horde', 'weaver', 50],
  [510, 'elite', 'summoner', 2],
  [540, 'ring', 'charger', 22],
  [570, 'horde', 'phantom', 44],
];

export class Director {
  constructor(g) {
    this.g = g;
    this.reset();
  }
  reset() {
    this.acc = 0;
    this.ev = 0;
    this.bossSpawned = false;
    this.warned = false;
    this.loop = 0;
  }

  /** Live difficulty multipliers. */
  difficulty(time) {
    const m = time / 60;
    return {
      hpMul: 1 + m * 0.34 + m * m * 0.05,
      dmgMul: 1 + m * 0.075,
      rate: clamp(0.95 + m * 0.66, 1, 8),
    };
  }

  weights(time) {
    let w = TABLE[0].w;
    for (let i = 0; i < TABLE.length; i++) if (time >= TABLE[i].t) w = TABLE[i].w;
    return w;
  }

  update(dt) {
    const g = this.g;
    const time = g.time;
    g.diff = this.difficulty(time);

    // ---- scripted beats
    while (this.ev < EVENTS.length && time >= EVENTS[this.ev][0]) {
      const [, kind, type, n] = EVENTS[this.ev++];
      this.event(kind, type, n);
    }

    // ---- boss
    if (!this.bossSpawned && time >= RUN_LEN - 6 && !this.warned) {
      this.warned = true;
      g.alert(T('warnBoss'), 'bad');
      g.snd.bossWarn();
      g.shake(6);
    }
    if (!this.bossSpawned && time >= RUN_LEN) {
      this.bossSpawned = true;
      g.spawnBoss();
    }

    // ---- endless escalation
    if (this.bossSpawned && g.endless && time > RUN_LEN + 60 * (this.loop + 1)) {
      this.loop++;
      g.alert(T('warnHorde'), 'bad');
      this.event('horde', 'phantom', 40 + this.loop * 8);
      if (this.loop % 2 === 0) this.event('elite', 'brute', 1 + (this.loop >> 1));
    }

    // ---- steady trickle
    if (g.enemies.count < g.maxEnemies) {
      this.acc += dt * g.diff.rate;
      let n = 0;
      while (this.acc >= 1 && n < 8) {
        this.acc -= 1;
        n++;
        this.spawnOne();
      }
    } else this.acc = 0;
  }

  pickType() {
    const g = this.g;
    const w = this.weights(g.time);
    const keys = Object.keys(w);
    let total = 0;
    for (const k of keys) total += w[k];
    let r = g.rng.f() * total;
    for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
    return keys[0];
  }

  spawnOne(type) {
    const g = this.g;
    const a = g.rng.angle();
    const rad = g.spawnR * (0.98 + g.rng.f() * 0.12);
    g.spawnEnemy(type || this.pickType(), g.p.x + Math.cos(a) * rad, g.p.y + Math.sin(a) * rad, g.diff.hpMul);
  }

  event(kind, type, n) {
    const g = this.g;
    const R = g.spawnR;
    switch (kind) {
      case 'ring': {
        const off = g.rng.angle();
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU;
          g.spawnEnemy(type, g.p.x + Math.cos(a) * R, g.p.y + Math.sin(a) * R, g.diff.hpMul);
        }
        break;
      }
      case 'cluster': {
        const a = g.rng.angle();
        const cx = g.p.x + Math.cos(a) * R, cy = g.p.y + Math.sin(a) * R;
        for (let i = 0; i < n; i++) {
          const aa = g.rng.angle(), rr = Math.sqrt(g.rng.f()) * 90;
          g.spawnEnemy(type, cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, g.diff.hpMul);
        }
        break;
      }
      case 'line': {
        const a = g.rng.angle();
        const cx = g.p.x + Math.cos(a) * R, cy = g.p.y + Math.sin(a) * R;
        const px = -Math.sin(a), py = Math.cos(a);
        for (let i = 0; i < n; i++) {
          const o = (i - (n - 1) / 2) * 46;
          g.spawnEnemy(type, cx + px * o, cy + py * o, g.diff.hpMul);
        }
        break;
      }
      case 'horde': {
        g.alert(T('warnHorde'), 'warn');
        g.snd.bossWarn();
        const off = g.rng.angle();
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU + (g.rng.f() - 0.5) * 0.2;
          const rr = R * (1 + (i % 3) * 0.09);
          g.spawnEnemy(type, g.p.x + Math.cos(a) * rr, g.p.y + Math.sin(a) * rr, g.diff.hpMul);
        }
        break;
      }
      case 'elite': {
        g.alert(T('warnElite'), 'warn');
        for (let i = 0; i < n; i++) {
          const a = g.rng.angle();
          g.spawnEnemy(type, g.p.x + Math.cos(a) * R * 0.85, g.p.y + Math.sin(a) * R * 0.85, g.diff.hpMul, true);
        }
        break;
      }
    }
  }
}
