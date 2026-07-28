/**
 * LUMINA — entry point.
 * Boots the engine, owns the frame loop, and mediates between Game and UI.
 */
import { Renderer } from './core/render.js';
import { Input } from './core/input.js';
import { Loop } from './core/loop.js';
import { sound } from './core/audio.js';
import { save } from './core/save.js';
import { initLang, applyDom, t, lang } from './core/i18n.js';
import { TAU } from './core/util.js';
import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';

initLang();
applyDom();

const canvas = document.getElementById('view');
const r = new Renderer(canvas);
const input = new Input(document.getElementById('app'));
const game = new Game(r, input, sound);
const hud = new Hud();

r.setQuality(save.opts.quality || 'auto');
sound.sfxVol = save.opts.sfx;
sound.musVol = save.opts.mus;

/* ------------------------------------------------------------------ wiring */
const api = {
  start(charId) {
    sound.init();
    sound.resume();
    sound.setVolumes(save.opts.sfx, save.opts.mus);
    screens.close();
    hud.show(true);
    hud.cache = {}; hud.loadoutKey = '';
    const firstEver = save.data.runs === 0;
    game.start(charId, save.data.endlessUnlocked && screens.endless);
    sound.startMusic();
    resultShown = false;
    if (firstEver) hud.showHint(t('hintMove'));
  },
  resume() { screens.close(); },
  quit() {
    bankRun(false, true);
    game.state = 'idle';
    sound.stopMusic();
    hud.show(false);
    screens.openTitle();
  },
  afterModal() { /* simulation resumes automatically */ },
};

const screens = new Screens(game, hud, api);
let resultShown = false;

game.uiBusy = () => screens.isModal();
game.onLevelUp = () => screens.openLevelUp();
game.onChest = () => screens.openChest();
game.onAlert = (text, cls) => hud.alert(text, cls);
game.onHurt = () => hud.hurtFlash();
game.onEnd = (won) => {
  sound.stopMusic(1.2);
  if (won) hud.whiteFlash(0.75);
  setTimeout(() => {
    if (resultShown) return;
    resultShown = true;
    screens.openResults(bankRun(won, false));
    hud.show(false);
  }, won ? 1500 : 1100);
};

input.onPause = () => {
  if (game.state === 'playing' && !screens.isOpen()) screens.openPause();
  else if (screens.cur === 'pause') api.resume();
};

/** Award shards, persist records, compute unlocks. */
function bankRun(won, abandoned) {
  const st = game.st;
  const shards = Math.max(0, Math.round(
    (game.runShards + game.kills * 0.35 + game.time * 0.6 + (won ? 200 : 0)) * (st.shardMul || 1)));
  save.addShards(shards);
  const d = save.data;
  d.runs++;
  if (won) d.wins++;
  const record = game.time > d.best.time;
  if (record) d.best.time = game.time;
  d.best.kills = Math.max(d.best.kills, game.kills);
  d.best.level = Math.max(d.best.level, game.level);
  d.best.dmg = Math.max(d.best.dmg, Math.round(game.dmgDone));

  const unlocks = [];
  if (won) {
    if (save.unlock('vex')) unlocks.push(lang === 'ja' ? '新機体「ヴェクス」が使用可能に' : 'New pilot available: VEX');
    if (!d.endlessUnlocked) { d.endlessUnlocked = true; unlocks.push(t('endlessUnlocked')); }
  }
  save.flush();
  return {
    won, abandoned, shards, record, unlocks,
    time: game.time, kills: game.kills, level: game.level, dmg: Math.round(game.dmgDone),
  };
}

/* -------------------------------------------------------------------- loop */
const loop = new Loop(
  (dt) => {
    if (game.state === 'playing' && !screens.isModal()) {
      game.update(dt);
      r.update(dt);
    } else if (game.state === 'idle') {
      r.cam.tx += Math.cos(r.time * 0.11) * 9 * dt;
      r.cam.ty += 14 * dt;
      r.update(dt);
    }
  },
  (rt) => {
    const t0 = performance.now();
    if (game.state === 'idle') drawAttract();
    else game.draw();
    drawStick();
    if (game.state === 'playing') hud.update(game);
    sound.update(game.state === 'playing' ? game.intensity || 0 : 0);
    r.sample(performance.now() - t0);
  },
);

/** Hit-stop: freeze a couple of frames on heavy impacts for punch. */
const origUpdate = loop.update;
loop.update = (dt) => {
  if (game.hitstop > 0) {
    game.hitstop -= dt;
    origUpdate(dt * 0.12);
    return;
  }
  origUpdate(dt);
};

/* --------------------------------------------------------- screen-space bits */
function drawStick() {
  const s = input.stick;
  if (!s.on || game.state !== 'playing' || screens.isOpen()) return;
  const ctx = r.ctx;
  r.screen();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(99,244,255,.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(s.bx, s.by, 46, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(s.bx, s.by, 46 * 0.55, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  const dx = s.tx - s.bx, dy = s.ty - s.by;
  const len = Math.min(46, Math.hypot(dx, dy));
  const a = Math.atan2(dy, dx);
  const tx = s.bx + Math.cos(a) * len, ty = s.by + Math.sin(a) * len;
  const grd = ctx.createRadialGradient(tx, ty, 0, tx, ty, 26);
  grd.addColorStop(0, 'rgba(190,250,255,.95)');
  grd.addColorStop(1, 'rgba(99,244,255,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(tx, ty, 26, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** Idle backdrop behind the menus. */
const attract = [];
for (let i = 0; i < 14; i++) {
  attract.push({
    a: Math.random() * TAU, rad: 120 + Math.random() * 460, sp: (Math.random() - 0.5) * 0.35,
    s: 8 + Math.random() * 18, sides: 3 + ((Math.random() * 5) | 0), rot: Math.random() * TAU,
    c: ['#ff5c8a', '#c46bff', '#5cd8ff', '#ff9d5c'][(Math.random() * 4) | 0],
  });
}
function attractScene(step) {
  const ctx = r.ctx;
  const cx = r.cam.x, cy = r.cam.y;
  for (const o of attract) {
    if (step) { o.a += o.sp * 0.006; o.rot += 0.004; }
    const x = cx + Math.cos(o.a) * o.rad, y = cy + Math.sin(o.a) * o.rad * 0.7;
    ctx.beginPath();
    for (let i = 0; i < o.sides; i++) {
      const ang = o.rot + (i / o.sides) * TAU;
      const px = x + Math.cos(ang) * o.s, py = y + Math.sin(ang) * o.s;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = o.c;
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = o.c;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawAttract() {
  if (r.glowBegin()) { r.world(); attractScene(false); r.glowEnd(); }
  r.begin();
  r.world();
  attractScene(true);
  r.bloom();
}

/* ------------------------------------------------------------------ events */
let resizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    r.resize();
    game.updateBounds();
    screens.drawLogo();
  }, 80);
});
window.addEventListener('orientationchange', () => setTimeout(() => {
  r.resize(); game.updateBounds(); screens.drawLogo();
}, 260));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === 'playing' && !screens.isModal()) screens.openPause();
    sound.stopMusic(0.2);
  } else if (game.state === 'playing') {
    sound.resume();
    sound.startMusic();
  }
});

// First gesture unlocks WebAudio on iOS.
const unlock = () => {
  sound.init();
  sound.resume();
  sound.setVolumes(save.opts.sfx, save.opts.mus);
  window.removeEventListener('pointerdown', unlock);
};
window.addEventListener('pointerdown', unlock);

/* -------------------------------------------------------------------- boot */
screens.openTitle();
loop.start();
requestAnimationFrame(() => {
  const b = document.getElementById('boot');
  b.classList.add('gone');
  setTimeout(() => b.remove(), 600);
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
  });
}

// Debug hooks for the automated playtests.
window.__lumina = { game, r, input, screens, hud, loop, sound, save };
