/**
 * ABYSS CORE — the 10-minute boss.
 * Three phases, each layering a new pattern on top of the last.
 */
import { TAU, clamp } from '../core/util.js';

export const BOSS_DEF = {
  id: 'core', name: { ja: 'アビス・コア', en: 'Abyss Core' },
  hp: 2600, spd: 38, dmg: 26, r: 56, xp: 500, color: '#b06bff', sides: 6, spike: 1,
  knockRes: 1, noSep: true, hidden: true,
  desc: { ja: '深淵の中枢。すべての敵を生み出す存在。', en: 'The heart of the swarm. Kill it to end the run.' },
  ai(g, e, dt) { bossAi(g, e, dt); },
};

function phaseOf(e) {
  const k = e.hp / e.maxHp;
  return k > 0.66 ? 0 : k > 0.33 ? 1 : 2;
}

export function bossAi(g, e, dt) {
  const ph = phaseOf(e);
  if (ph !== e.st) {                       // phase change
    e.st = ph;
    e.stt = 1.2;                           // brief vulnerable stagger
    e.atk = 0; e.atkT = 1.4; e.spiral = g.rng.angle();
    g.wave({ x: e.x, y: e.y, maxR: 460, speed: 900, dmg: 40 * g.diff.dmgMul, knock: 260, color: '#d9a8ff', wid: 'bossph', width: 16 });
    g.clearEBullets();
    g.fx.blast(e.x, e.y, 240, '#c78aff', 0.5);
    g.fx.ring(e.x, e.y, 300, '#ffffff', 0.6, 6);
    g.shake(16);
    g.snd.boom(1.6);
    g.alert(ph === 1 ? 'PHASE 2' : 'PHASE 3', 'bad');
  }

  const p = g.p;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.face = Math.atan2(dy, dx);

  if (e.stt > 0) { e.stt -= dt; e.vx *= 0.9; e.vy *= 0.9; return; }

  // movement: keep mid range, dash in phase 2+
  const want = 190;
  const spd = e.spd * (1 + ph * 0.25);
  if (e.dash > 0) {
    e.dash -= dt;
    e.vx = e.aimx * 430; e.vy = e.aimy * 430;
    if (g.rng.f() < dt * 30) g.fx.spark(e.x, e.y, 2, '#c78aff', 200);
  } else {
    const m = d > want + 60 ? 1 : d < want - 60 ? -0.7 : 0.1;
    e.vx = (dx / d) * spd * m - (dy / d) * spd * 0.55;
    e.vy = (dy / d) * spd * m + (dx / d) * spd * 0.55;
  }

  e.atkT -= dt;
  e.spiral = (e.spiral || 0) + dt * (2.4 + ph * 0.9);

  // continuous spiral stream from phase 2
  if (ph >= 1) {
    e.sp2 = (e.sp2 || 0) - dt;
    if (e.sp2 <= 0) {
      e.sp2 = ph >= 2 ? 0.075 : 0.12;
      const arms = ph >= 2 ? 3 : 2;
      for (let i = 0; i < arms; i++) {
        const a = e.spiral + (i / arms) * TAU;
        g.ebullet(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, Math.cos(a) * 175, Math.sin(a) * 175, 7, 11 * g.diff.dmgMul, '#d9a8ff');
      }
    }
  }

  if (e.atkT > 0) return;

  const roll = (e.atk = (e.atk + 1) % (ph >= 1 ? 3 : 2));
  if (roll === 0) {                         // radial burst
    e.atkT = 2.6 - ph * 0.5;
    const n = 14 + ph * 6;
    const off = g.rng.angle();
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      g.ebullet(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, Math.cos(a) * 205, Math.sin(a) * 205, 8, 12 * g.diff.dmgMul, '#ff8ad8');
    }
    g.fx.ring(e.x, e.y, e.r * 2.2, '#ff8ad8', 0.4, 5);
    g.snd.boom(0.8);
  } else if (roll === 1) {                  // summon
    e.atkT = 3.4 - ph * 0.6;
    const kinds = ph === 0 ? ['swarm', 'drift'] : ph === 1 ? ['swarm', 'charger', 'bomber'] : ['charger', 'brute', 'phantom'];
    const n = 5 + ph * 3;
    for (let i = 0; i < n; i++) {
      const a = g.rng.angle(), rad = e.r + 30 + g.rng.f() * 90;
      g.spawnEnemy(g.rng.pick(kinds), e.x + Math.cos(a) * rad, e.y + Math.sin(a) * rad, g.diff.hpMul * 0.7);
    }
    g.fx.ring(e.x, e.y, 150, '#b06bff', 0.5, 5);
  } else {                                  // dash + shotgun
    e.atkT = 3.0;
    e.dash = 0.75;
    e.aimx = dx / d; e.aimy = dy / d;
    const base = e.face;
    for (let i = -3; i <= 3; i++) {
      const a = base + i * 0.16;
      g.ebullet(e.x, e.y, Math.cos(a) * 250, Math.sin(a) * 250, 7, 13 * g.diff.dmgMul, '#ffb45c');
    }
    g.snd.shoot(0.4);
    g.shake(4);
  }
}

export function drawBoss(g, e, ctx, r) {
  const ph = phaseOf(e);
  const s = e.r * (1 + Math.sin(e.t * 3) * 0.03) * (e.hitT > 0 ? 1.06 : 1);
  const flash = e.hitT > 0;
  const c1 = ['#b06bff', '#ff6bd0', '#ff5c5c'][ph];
  const c2 = ['#e0b3ff', '#ffb3e6', '#ffb3b3'][ph];

  r.glow(e.x, e.y, s * 3.2, c1, 0.5);

  // outer broken rings
  ctx.save();
  ctx.translate(e.x, e.y);
  for (let ring = 0; ring < 3; ring++) {
    const rr = s * (1.5 + ring * 0.42);
    const dir = ring % 2 ? -1 : 1;
    const rot = e.t * (0.5 + ring * 0.35) * dir;
    const segs = 4 + ring;
    ctx.strokeStyle = ring === 0 ? c2 : c1;
    ctx.globalAlpha = 0.85 - ring * 0.2;
    ctx.lineWidth = 4 - ring;
    for (let i = 0; i < segs; i++) {
      const a0 = rot + (i / segs) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a0 + TAU / segs - 0.34);
      ctx.stroke();
    }
  }
  // core
  ctx.globalAlpha = 1;
  ctx.rotate(e.t * 0.4);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const px = Math.cos(a) * s, py = Math.sin(a) * s;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = flash ? '#ffffff' : '#1a0f2e';
  ctx.fill();
  ctx.strokeStyle = flash ? '#ffffff' : c2;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // eye tracking the player
  const ex = e.x + Math.cos(e.face) * s * 0.28, ey = e.y + Math.sin(e.face) * s * 0.28;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, s * 0.5, s * 0.3, e.face, 0, TAU);
  ctx.fillStyle = flash ? '#ffffff' : '#2a1840';
  ctx.globalAlpha = 1;
  ctx.fill();
  ctx.strokeStyle = c2;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ex, ey, s * 0.17, 0, TAU);
  ctx.fillStyle = flash ? '#ffffff' : c2;
  ctx.fill();

  if (e.stt > 0) {
    ctx.globalAlpha = clamp(e.stt, 0, 1) * 0.6;
    r.ring(e.x, e.y, s * (2.4 - e.stt), '#ffffff', 4, 1);
    ctx.globalAlpha = 1;
  }
}
