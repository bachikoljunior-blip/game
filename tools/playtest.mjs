#!/usr/bin/env node
/**
 * Automated playtest: boots the game in a real browser at phone resolution,
 * drives it through every screen and into deep game states with the test bot,
 * captures screenshots and measures draw cost.
 *
 *   node tools/playtest.mjs [--shots dir] [--long]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SHOTS = join(ROOT, argVal('--shots') || 'shots');
const LONG = args.includes('--long');
const PORT = 8123;
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const EXEC = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const BOT_SRC = readFileSync(join(ROOT, 'tools/bot.js'), 'utf8');

const DEVICES = {
  phone: { width: 390, height: 844, dpr: 3 },
  small: { width: 360, height: 640, dpr: 2 },
  land: { width: 844, height: 390, dpr: 3 },
  tablet: { width: 820, height: 1180, dpr: 2 },
};

mkdirSync(SHOTS, { recursive: true });
const server = createStaticServer(ROOT);
await new Promise((r) => server.listen(PORT, r));
const URL_BASE = `http://127.0.0.1:${PORT}/index.html`;

const browser = await chromium.launch({
  executablePath: EXEC,
  headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const errors = [];
const perf = [];

async function newPage(device, lang = 'ja') {
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    isMobile: true, hasTouch: true,
    locale: lang === 'ja' ? 'ja-JP' : 'en-US',
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`[404] ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__lumina, null, { timeout: 20000 });
  await page.evaluate(async (src) => {
    window.__up = await import('./src/game/upgrades.js');
    window.__bot = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  }, BOT_SRC);
  return { ctx, page };
}

/**
 * Screenshot with the rAF loop parked. The software rasteriser in this
 * environment cannot both animate and serve a 4-megapixel capture in time.
 */
const shot = async (page, name) => {
  await page.evaluate(() => window.__lumina.loop.stop());
  await page.screenshot({ path: join(SHOTS, name + '.png'), timeout: 60000 });
  await page.evaluate(() => window.__lumina.loop.start());
  console.log('  📸', name);
};

/** Simulate `seconds` of play with the bot, keeping rendering off the hot path. */
async function play(page, seconds, opts = {}) {
  return page.evaluate(({ seconds, opts }) => {
    const { game } = window.__lumina;
    const bot = window.__bot.makeBot(game, opts);
    bot.hookUpgrades(window.__up);
    const STEP = 1 / 60;
    for (let i = 0; i < seconds * 60; i++) {
      if (game.state !== 'playing') break;
      if (opts.god) game.p.hp = game.p.maxHp;
      bot.step(STEP);
    }
    const g = game;
    return {
      time: +g.time.toFixed(1), level: g.level, kills: g.kills, state: g.state,
      hp: Math.round(g.p.hp), enemies: g.enemies.count,
      weapons: g.weapons.map((w) => w.def.id + (w.def.evoOf ? '★' : ':' + w.lv)),
      passives: g.passives.map((p) => p.def.id + ':' + p.lv),
    };
  }, { seconds, opts });
}

async function measure(page, tag) {
  const m = await page.evaluate(async () => {
    const { game, r } = window.__lumina;
    const ts = [];
    for (let i = 0; i < 70; i++) {
      await new Promise((res) => requestAnimationFrame(res));
      const t0 = performance.now();
      game.draw();
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b);
    return {
      median: +ts[ts.length >> 1].toFixed(2), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(2),
      enemies: game.enemies.count, bullets: game.bullets.count, particles: game.fx.count,
      gems: game.gems.count, quality: r.mode, canvas: `${r.cv.width}×${r.cv.height}`,
    };
  });
  perf.push({ tag, ...m });
  return m;
}

/* ---------------------------------------------------------------- menus */
console.log('▶ menus');
for (const lang of ['ja', 'en']) {
  const sfx = lang === 'ja' ? '' : '-en';
  const { ctx, page } = await newPage(DEVICES.phone, lang);
  await page.waitForTimeout(700);
  await shot(page, `01-title${sfx}`);
  for (const [btn, name] of [['btnChars', '02-pilots'], ['btnShop', '03-lab'], ['btnCodex', '04-codex'], ['btnOptions', '05-options']]) {
    await page.click('#' + btn);
    await page.waitForTimeout(300);
    await shot(page, `${name}${sfx}`);
    await page.click('.screen.show .close, .screen.show [data-close]').catch(() => {});
    await page.waitForTimeout(200);
  }
  await ctx.close();
}

/* ------------------------------------------------------------------- audio */
console.log('▶ audio synthesis');
{
  const { ctx, page } = await newPage(DEVICES.phone);
  const res = await page.evaluate(async () => {
    const { sound } = window.__lumina;
    const out = { failures: [], nodes: 0, steps: 0, state: '' };
    sound.init();
    if (!sound.ready) { out.failures.push('AudioContext unavailable'); return out; }
    out.state = sound.ctx.state;
    // every sfx entry point must survive being called
    const calls = [
      ['shoot', [1, false]], ['shoot', [1.4, true]], ['laser', [1]], ['hit', [false]], ['hit', [true]],
      ['crit', []], ['kill', []], ['boom', [1]], ['boom', [2]], ['pickup', [3]], ['coin', []],
      ['hurt', []], ['heal', []], ['levelUp', []], ['chest', []], ['burst', []],
      ['ui', [0]], ['ui', [1]], ['ui', [2]], ['bossWarn', []], ['win', []], ['lose', []],
      ['duck', [0.3, 0.5]], ['muffle', [true]], ['muffle', [false]], ['setVolumes', [0.5, 0.4]],
    ];
    for (const [fn, args] of calls) {
      try { sound[fn](...args); } catch (e) { out.failures.push(`${fn}: ${e.message}`); }
    }
    // the generative score must actually schedule notes
    try {
      sound.startMusic();
      const s0 = sound.step;
      for (let i = 0; i < 40; i++) {
        sound.update(i / 40);
        await new Promise((r) => setTimeout(r, 12));
      }
      out.steps = sound.step - s0;
      sound.stopMusic(0.1);
    } catch (e) { out.failures.push(`music: ${e.message}`); }
    return out;
  });
  const check = (cond, msg) => { if (!cond) errors.push(`[audio] ${msg}`); console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
  check(res.failures.length === 0, `every sound effect synthesises${res.failures.length ? ': ' + res.failures[0] : ''}`);
  check(res.steps > 0, `generative music schedules notes (${res.steps} sixteenths)`);
  await ctx.close();
}

/* ------------------------------------------------------------- offline PWA */
console.log('▶ offline (service worker)');
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL_BASE, { waitUntil: 'load' });
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return !!(reg && reg.active);
  });
  const check = (cond, msg) => { if (!cond) errors.push(`[offline] ${msg}`); console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
  check(registered, 'service worker activates');

  // give the install handler a moment to finish filling the cache
  await page.waitForTimeout(1200);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    if (!keys.length) return 0;
    const c = await caches.open(keys[0]);
    return (await c.keys()).length;
  });
  check(cached > 30, `precache is populated (${cached} entries)`);

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  const bootedOffline = await page.waitForFunction(() => !!window.__lumina, null, { timeout: 15000 })
    .then(() => true).catch(() => false);
  check(bootedOffline, 'game boots with the network switched off');
  if (bootedOffline) {
    await page.click('#btnPlay');
    await page.waitForTimeout(400);
    check(await page.evaluate(() => window.__lumina.game.state === 'playing'), 'a run starts while offline');
  }
  check(errs.length === 0, `no page errors offline${errs.length ? ': ' + errs[0] : ''}`);
  await ctx.setOffline(false);
  await ctx.close();
}

/* ------------------------------------------------------ real touch input */
console.log('▶ touch controls');
{
  const { ctx, page } = await newPage(DEVICES.phone);
  await page.click('#btnPlay');
  await page.waitForTimeout(250);

  const before = await page.evaluate(() => ({ x: window.__lumina.game.p.x, y: window.__lumina.game.p.y }));
  // drag from the middle of the screen towards the upper right
  await page.mouse.move(195, 500);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(195 + i * 8, 500 - i * 6);
  await page.waitForTimeout(450);
  const stick = await page.evaluate(() => {
    const { input, game } = window.__lumina;
    return { on: input.stick.on, mag: +input.mag.toFixed(2), x: game.p.x, y: game.p.y };
  });
  await shot(page, '06-joystick');
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => {
    const { input, game } = window.__lumina;
    return { on: input.stick.on, mag: input.mag, x: game.p.x, y: game.p.y };
  });

  const moved = Math.hypot(stick.x - before.x, stick.y - before.y);
  const check = (cond, msg) => { if (!cond) errors.push(`[input] ${msg}`); console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
  check(stick.on, 'drag plants the joystick');
  check(stick.mag > 0.9, `stick reaches full deflection (${stick.mag})`);
  check(moved > 40, `player actually moves (${moved.toFixed(0)} units)`);
  check(stick.x > before.x && stick.y < before.y, 'player moves in the dragged direction');
  check(!after.on && after.mag === 0, 'release stops the ship');

  // the Burst button
  await page.evaluate(() => { window.__lumina.game.burstT = 0; });
  await page.click('#btnBurst');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => window.__lumina.game.burstT > 0), 'Burst button fires Burst');

  // a second finger while the stick is held also fires Burst
  const secondFinger = await page.evaluate(() => {
    const { input, game } = window.__lumina;
    game.burstT = 0;
    const app = document.getElementById('app');
    const mk = (type, id, x, y) => new PointerEvent(type, {
      pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch',
    });
    app.dispatchEvent(mk('pointerdown', 1, 195, 500));     // thumb on the stick
    app.dispatchEvent(mk('pointermove', 1, 235, 470));
    app.dispatchEvent(mk('pointerdown', 2, 120, 700));     // second finger
    const queued = input.burstQueued;
    app.dispatchEvent(mk('pointerup', 1, 235, 470));
    app.dispatchEvent(mk('pointerup', 2, 120, 700));
    return { queued, stickReleased: !input.stick.on };
  });
  check(secondFinger.queued, 'second finger queues Burst without dropping the stick');
  check(secondFinger.stickReleased, 'lifting the thumb releases the stick');

  // pause button must not be swallowed by the joystick layer
  await page.click('#btnPause');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => window.__lumina.screens.cur === 'pause'), 'pause button works mid-run');
  await page.click('#btnResume');
  await ctx.close();
}

/* ------------------------------------------------------------- gameplay */
console.log('▶ gameplay');
{
  const { ctx, page } = await newPage(DEVICES.phone);
  await page.click('#btnPlay');
  await page.waitForTimeout(250);
  await play(page, 25);
  await shot(page, '10-early');

  // hand the level-up handler back to the UI (the bot hijacks it) and force one
  await page.evaluate(() => {
    const { game, screens } = window.__lumina;
    game.onLevelUp = () => screens.openLevelUp();
    game.level++;
    game.pendingLevels = 1;
  });
  await page.waitForTimeout(600);
  await shot(page, '11-levelup');
  await page.click('#luCards .ucard');
  await page.waitForTimeout(250);

  await play(page, 150, { god: true });
  await page.evaluate(() => window.__lumina.game.draw());
  await shot(page, '12-midgame');

  await page.click('#btnPause');
  await page.waitForTimeout(350);
  await shot(page, '13-pause');
  await page.click('#btnResume');
  await page.waitForTimeout(200);

  const st = await play(page, 260, { god: true });
  await page.evaluate(() => window.__lumina.game.draw());
  const m = await measure(page, 'late-game');
  console.log(`  ▸ t=${st.time}s lv=${st.level} kills=${st.kills} | draw ${m.median}ms p95 ${m.p95}ms | E${m.enemies} B${m.bullets} P${m.particles} G${m.gems}`);
  console.log(`    ${st.weapons.join(' ')} | ${st.passives.join(' ')}`);
  await shot(page, '14-lategame');
  await ctx.close();
}

/* ----------------------------------------------------------------- boss */
if (LONG) {
  console.log('▶ boss');
  const { ctx, page } = await newPage(DEVICES.phone);
  await page.click('#btnPlay');
  await page.waitForTimeout(250);
  await play(page, 601, { god: true });
  await page.evaluate(() => window.__lumina.game.draw());
  const m = await measure(page, 'boss');
  console.log(`  ▸ boss fight | draw ${m.median}ms p95 ${m.p95}ms | E${m.enemies}`);
  await shot(page, '15-boss');
  await play(page, 90, { god: true });
  await page.waitForTimeout(2200);
  await shot(page, '16-results');
  await ctx.close();
}

/* -------------------------------------------------------------- devices */
console.log('▶ devices');
for (const d of ['small', 'land', 'tablet']) {
  const { ctx, page } = await newPage(DEVICES[d]);
  await page.waitForTimeout(500);
  await shot(page, `30-title-${d}`);
  await page.click('#btnPlay');
  await page.waitForTimeout(250);
  await play(page, 170, { god: true });
  await page.evaluate(() => window.__lumina.game.draw());
  await measure(page, 'dev-' + d);
  await shot(page, `31-play-${d}`);
  await ctx.close();
}

/* --------------------------------------------------------------- report */
console.log('\n─── draw cost ───');
for (const p of perf) {
  console.log(` ${p.tag.padEnd(12)} median ${String(p.median).padStart(6)}ms  p95 ${String(p.p95).padStart(6)}ms  ` +
    `${p.canvas} [${p.quality}]  E${p.enemies} B${p.bullets} P${p.particles} G${p.gems}`);
}
const uniq = [...new Set(errors)];
if (uniq.length) {
  console.log('\n─── errors ───');
  uniq.slice(0, 25).forEach((e) => console.log(' ✗', e));
} else console.log('\n✓ no console/page errors');

await browser.close();
server.close();
process.exit(uniq.length ? 1 : 0);
