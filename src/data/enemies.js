/**
 * Enemy archetypes. `ai(g, e, dt)` writes the *desired* velocity into e.vx/e.vy;
 * the shared update in game/enemies.js adds separation, knockback and collision.
 */
const S = { dx: 0, dy: 0, d: 1 };
function toPlayer(g, e) {
  S.dx = g.p.x - e.x; S.dy = g.p.y - e.y;
  S.d = Math.hypot(S.dx, S.dy) || 1;
  S.dx /= S.d; S.dy /= S.d;
  return S;
}
const seek = (g, e, mul = 1) => {
  const s = toPlayer(g, e);
  e.vx = s.dx * e.spd * mul;
  e.vy = s.dy * e.spd * mul;
};

export const ENEMIES = [
  {
    id: 'drift', name: { ja: 'ドリフター', en: 'Drifter' },
    hp: 11, spd: 46, dmg: 8, r: 12, xp: 1, color: '#ff5c8a', sides: 3, spike: 1,
    desc: { ja: 'まっすぐ向かってくる基本の敵。', en: 'Comes straight at you. Nothing fancy.' },
    ai(g, e) { seek(g, e); },
  },
  {
    id: 'swarm', name: { ja: 'スウォーム', en: 'Swarmling' },
    hp: 7, spd: 86, dmg: 6, r: 9, xp: 1, color: '#ff9d5c', sides: 3, spike: 0.55,
    desc: { ja: '素早く群れる。数で押しつぶしてくる。', en: 'Fast and numerous. Death by a thousand cuts.' },
    ai(g, e, dt) {
      e.w1 = (e.w1 || 0) + dt * 7;
      const s = toPlayer(g, e);
      const px = -s.dy, py = s.dx;
      const wob = Math.sin(e.w1 + e.seed * 6) * 0.55;
      e.vx = (s.dx + px * wob) * e.spd;
      e.vy = (s.dy + py * wob) * e.spd;
    },
  },
  {
    id: 'brute', name: { ja: 'ブルート', en: 'Brute' },
    hp: 64, spd: 31, dmg: 15, r: 22, xp: 4, color: '#c46bff', sides: 6, spike: 1,
    desc: { ja: '重装甲。遅いが痛い。', en: 'Slow, heavy, hits like a truck.' },
    knockRes: 0.45,
    ai(g, e) { seek(g, e); },
  },
  {
    id: 'splitter', name: { ja: 'スプリッター', en: 'Splitter' },
    hp: 30, spd: 48, dmg: 10, r: 16, xp: 2, color: '#5cffc4', sides: 5, spike: 1,
    desc: { ja: '倒すと二体の欠片に分裂する。', en: 'Breaks into two shards when destroyed.' },
    ai(g, e) { seek(g, e); },
    onDeath(g, e) {
      for (let i = 0; i < 2; i++) {
        const c = g.spawnEnemy('shardling', e.x + (i ? 12 : -12), e.y + (i ? 8 : -8), e.hpMul * 0.8);
        if (c) { c.vx = (i ? 1 : -1) * 90; c.vy = (i ? 1 : -1) * 60; }
      }
    },
  },
  {
    id: 'shardling', name: { ja: 'シャード', en: 'Shard' },
    hp: 9, spd: 96, dmg: 6, r: 8, xp: 1, color: '#9dffe0', sides: 3, spike: 0.6, hidden: true,
    desc: { ja: 'スプリッターの欠片。', en: 'What is left of a Splitter.' },
    ai(g, e) { seek(g, e); },
  },
  {
    id: 'charger', name: { ja: 'チャージャー', en: 'Charger' },
    hp: 34, spd: 38, dmg: 18, r: 14, xp: 3, color: '#ffd45c', sides: 4, spike: 0.7,
    desc: { ja: '狙いを定め、一直線に突進する。', en: 'Locks on, winds up, then dashes.' },
    ai(g, e, dt) {
      e.st = e.st || 0; e.stt = (e.stt || 0) - dt;
      if (e.st === 0) {                       // approach
        seek(g, e);
        const d = Math.hypot(g.p.x - e.x, g.p.y - e.y);
        if (d < 260 && e.stt <= 0) { e.st = 1; e.stt = 0.62; }
      } else if (e.st === 1) {                // telegraph
        const s = toPlayer(g, e);
        e.aimx = s.dx; e.aimy = s.dy;
        e.vx *= 0.82; e.vy *= 0.82;
        if (e.stt <= 0) { e.st = 2; e.stt = 0.5; g.snd.shoot(0.5); }
      } else {                                // dash
        e.vx = e.aimx * 430; e.vy = e.aimy * 430;
        if (e.stt <= 0) { e.st = 0; e.stt = 1.1; }
      }
    },
  },
  {
    id: 'bomber', name: { ja: 'ボマー', en: 'Bomber' },
    hp: 24, spd: 62, dmg: 9, r: 14, xp: 2, color: '#ff6b6b', sides: 8, spike: 0.82,
    desc: { ja: '死ぬ間際に自爆する。近づきすぎるな。', en: 'Detonates on death. Mind the blast.' },
    ai(g, e) { seek(g, e); },
    onDeath(g, e) {
      const R = 76;
      g.fx.blast(e.x, e.y, R, '#ff8a5c');
      g.snd.boom(0.8);
      g.aoeSelfHarm(e.x, e.y, R, e.dmg * 1.3);
      g.enemiesIn(e.x, e.y, R, (o) => { if (o !== e) g.hurt(o, 14 * e.hpMul, { knock: 120, wid: 'boom' }); });
    },
  },
  {
    id: 'spitter', name: { ja: 'スピッター', en: 'Spitter' },
    hp: 26, spd: 36, dmg: 8, r: 13, xp: 3, color: '#8ab4ff', sides: 5, spike: 0.55,
    desc: { ja: '距離を取りながら弾を撃つ。', en: 'Keeps its distance and spits projectiles.' },
    ai(g, e, dt) {
      const s = toPlayer(g, e);
      const want = 210;
      const m = s.d > want + 40 ? 1 : s.d < want - 40 ? -0.85 : 0;
      e.vx = s.dx * e.spd * m + -s.dy * e.spd * 0.4;
      e.vy = s.dy * e.spd * m + s.dx * e.spd * 0.4;
      e.stt = (e.stt || 1.4) - dt;
      if (e.stt <= 0 && s.d < 420) {
        e.stt = 2.1;
        g.ebullet(e.x, e.y, s.dx * 190, s.dy * 190, 6.5, 9 * e.dmgMul, '#8ab4ff');
        g.snd.shoot(1.9, true);
      }
    },
  },
  {
    id: 'weaver', name: { ja: 'ウィーバー', en: 'Weaver' },
    hp: 30, spd: 92, dmg: 10, r: 11, xp: 2, color: '#66e6ff', sides: 4, spike: 0.5,
    desc: { ja: '螺旋を描いて回り込んでくる。', en: 'Spirals in from unexpected angles.' },
    ai(g, e, dt) {
      const s = toPlayer(g, e);
      e.w1 = (e.w1 || 0) + dt;
      const swirl = s.d > 130 ? 0.85 : 0.2;
      const px = -s.dy, py = s.dx;
      const dir = e.seed > 0.5 ? 1 : -1;
      e.vx = (s.dx + px * swirl * dir) * e.spd;
      e.vy = (s.dy + py * swirl * dir) * e.spd;
    },
  },
  {
    id: 'warden', name: { ja: 'ウォーデン', en: 'Warden' },
    hp: 105, spd: 27, dmg: 16, r: 21, xp: 6, color: '#5cd8ff', sides: 6, spike: 0.86,
    desc: { ja: '前面のシールドが正面からの攻撃を弾く。背後を狙え。', en: 'Front shield blocks most damage. Hit it from behind.' },
    knockRes: 0.6, shield: 0.75,
    ai(g, e) { const s = toPlayer(g, e); e.face = Math.atan2(s.dy, s.dx); seek(g, e); },
  },
  {
    id: 'summoner', name: { ja: 'サモナー', en: 'Summoner' },
    hp: 78, spd: 26, dmg: 12, r: 18, xp: 7, color: '#b06bff', sides: 7, spike: 0.62,
    desc: { ja: '雑魚を呼び続ける。放置は危険。', en: 'Keeps calling reinforcements. Kill it early.' },
    ai(g, e, dt) {
      const s = toPlayer(g, e);
      const m = s.d > 300 ? 1 : s.d < 200 ? -0.6 : 0;
      e.vx = s.dx * e.spd * m; e.vy = s.dy * e.spd * m;
      e.stt = (e.stt || 3) - dt;
      if (e.stt <= 0) {
        e.stt = 3.4;
        for (let i = 0; i < 3; i++) {
          const a = g.rng.angle();
          g.spawnEnemy('swarm', e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, e.hpMul);
        }
        g.fx.ring(e.x, e.y, 40, '#b06bff');
      }
    },
  },
  {
    id: 'phantom', name: { ja: 'ファントム', en: 'Phantom' },
    hp: 20, spd: 112, dmg: 12, r: 11, xp: 3, color: '#9aa8ff', sides: 3, spike: 0.4,
    desc: { ja: '他の敵をすり抜けて一直線に襲う。', en: 'Ignores everything and everyone. Comes straight for you.' },
    noSep: true,
    ai(g, e) { seek(g, e); },
  },
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
