#!/usr/bin/env node
/**
 * Captures specific dramatic moments that a linear playtest rarely hits —
 * boss close-up, evolution card, chest, burst, victory screen — so they can be
 * eyeballed for polish.
 *
 *   node tools/showcase.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'shots');
const PORT = 8144;
const EXEC = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const BOT_SRC = readFileSync(join(ROOT, 'tools/bot.js'), 'utf8');
mkdirSync(SHOTS, { recursive: true });

const server = createStaticServer(ROOT);
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({
  executablePath: EXEC, headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const errors = [];
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ja-JP',
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__lumina);
await page.evaluate(async (src) => {
  window.__up = await import('./src/game/upgrades.js');
  window.__bot = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
}, BOT_SRC);

const shot = async (name) => {
  await page.evaluate(() => window.__lumina.loop.stop());
  await page.screenshot({ path: join(SHOTS, name + '.png'), timeout: 60000 });
  await page.evaluate(() => window.__lumina.loop.start());
  console.log('  📸', name);
};
const sim = (sec, god = true) => page.evaluate(({ sec, god }) => {
  const { game } = window.__lumina;
  const bot = window.__bot.makeBot(game, {});
  bot.hookUpgrades(window.__up);
  for (let i = 0; i < sec * 60; i++) {
    if (game.state !== 'playing') break;
    if (god) game.p.hp = game.p.maxHp;
    bot.step(1 / 60);
  }
  return { t: Math.round(game.time), lv: game.level };
}, { sec, god });

/* -------- 1. evolution card ------------------------------------------- */
await page.click('#btnPlay');
await page.waitForTimeout(250);
await page.evaluate(() => {
  const { game, screens } = window.__lumina;
  const up = window.__up;
  game.weapons[0].lv = 8;
  game.passives.push({ def: (up.MAX_WEAPONS, window.__pass || null) || null, lv: 4 });
  game.passives.length = 0;
  // give the exact passive the bolt evolution needs
  import('./src/data/passives.js').then((m) => {
    game.passives.push({ def: m.PASSIVE_BY_ID.power, lv: 4 });
    game.passives.push({ def: m.PASSIVE_BY_ID.focus, lv: 3 });
    game.recomputeStats();
    game.level = 21;
    game.onLevelUp = () => screens.openLevelUp();
    game.pendingLevels = 1;
  });
});
await page.waitForTimeout(900);
await shot('40-evolution');
await page.click('#luCards .ucard');
await page.waitForTimeout(400);
await shot('41-after-evo');

/* -------- 2. chest ----------------------------------------------------- */
await page.evaluate(() => {
  const { game, screens } = window.__lumina;
  game.onChest = () => screens.openChest();
  game.collectDrop({ kind: 'chest' });
});
await page.waitForTimeout(500);
await shot('42-chest');
await page.click('#btnChestOk');
await page.waitForTimeout(300);

/* -------- 3. burst in a horde ----------------------------------------- */
await sim(180);
await page.evaluate(() => {
  const { game } = window.__lumina;
  game.director.event('horde', 'swarm', 60);
  for (let i = 0; i < 90; i++) game.update(1 / 60);
  game.burstT = 0;
  game.doBurst();
  for (let i = 0; i < 7; i++) { game.update(1 / 60); game.r.update(1 / 60); }
  game.draw();
});
await shot('43-burst');

/* -------- 3b. sectors -------------------------------------------------- */
{
  const marks = [[10, '50-sector1'], [130, '51-sector2'], [250, '52-sector3'], [370, '53-sector4'], [490, '54-sector5']];
  await page.evaluate(() => { window.__lumina.game.start('lumina', false); });
  for (const [t, name] of marks) {
    await page.evaluate((target) => {
      const { game } = window.__lumina;
      const bot = window.__bot.makeBot(game, {});
      bot.hookUpgrades(window.__up);
      // jump the clock, then let the world settle into the new sector
      game.time = Math.max(game.time, target - 2);
      for (let i = 0; i < 60 * 6; i++) { game.p.hp = game.p.maxHp; bot.step(1 / 60); }
      game.draw();
    }, t);
    await shot(name);
  }
}

/* -------- 4. boss close-up -------------------------------------------- */
await page.evaluate(() => {
  const { game } = window.__lumina;
  game.time = 599;
  game.director.ev = 99;
  for (let i = 0; i < 120; i++) { game.p.hp = game.p.maxHp; game.update(1 / 60); game.r.update(1 / 60); }
  const b = game.bossRef;
  if (b) { b.x = game.p.x + 40; b.y = game.p.y - 190; }
  for (let i = 0; i < 90; i++) { game.p.hp = game.p.maxHp; game.update(1 / 60); game.r.update(1 / 60); }
  game.draw();
});
await shot('44-boss-closeup');

/* -------- 5. phase 2 + victory ---------------------------------------- */
await page.evaluate(() => {
  const { game } = window.__lumina;
  const b = game.bossRef;
  if (b) { b.hp = b.maxHp * 0.3; b.x = game.p.x - 60; b.y = game.p.y - 210; }
  for (let i = 0; i < 60; i++) { game.p.hp = game.p.maxHp; game.update(1 / 60); game.r.update(1 / 60); }
  game.draw();
});
await shot('45-boss-phase3');

await page.evaluate(() => {
  const { game } = window.__lumina;
  if (game.bossRef) game.hurt(game.bossRef, 1e9, { quiet: true });
});
await page.waitForTimeout(2600);
await shot('46-victory');

/* -------- 6. defeat --------------------------------------------------- */
await page.evaluate(() => {
  const { game } = window.__lumina;
  game.start('sigma', false);
  const bot = window.__bot.makeBot(game, {});
  bot.hookUpgrades(window.__up);
  for (let i = 0; i < 60 * 200; i++) { if (game.state !== 'playing') break; bot.step(1 / 60); }
  game.uiBusy = () => false;
  game.hitPlayer(99999, game.p.x + 30, game.p.y);
});
await page.waitForTimeout(2200);
await shot('47-defeat');

console.log(errors.length ? '\n✗ errors:\n' + [...new Set(errors)].join('\n') : '\n✓ no errors');
await browser.close();
server.close();
