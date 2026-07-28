#!/usr/bin/env node
/**
 * Balance harness: plays full runs with the test bot at 1000x speed and reports
 * the shape of the difficulty curve — survival time, level pace, kill rate,
 * damage taken, and which builds the bot fell into.
 *
 *   node tools/balance.mjs [runs] [--char lumina] [--pick first]
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const RUNS = +(args.find((a) => /^\d+$/.test(a)) || 6);
const CHAR = args.includes('--char') ? args[args.indexOf('--char') + 1] : 'lumina';
const PICK = args.includes('--pick') ? args[args.indexOf('--pick') + 1] : 'greedy';
const PORT = 8611;
const EXEC = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const BOT_SRC = readFileSync(join(ROOT, 'tools/bot.js'), 'utf8');

const server = createStaticServer(ROOT);
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({
  executablePath: EXEC, headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  ✗ PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  ✗', m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__lumina);

const runs = await page.evaluate(async ({ RUNS, CHAR, PICK, BOT_SRC }) => {
  const { game, loop } = window.__lumina;
  loop.stop();                                   // no rendering: pure simulation
  const up = await import('./src/game/upgrades.js');
  const mod = await import(URL.createObjectURL(new Blob([BOT_SRC], { type: 'text/javascript' })));
  const out = [];
  for (let n = 0; n < RUNS; n++) {
    game.start(CHAR, false);
    const bot = mod.makeBot(game, { pick: PICK });
    bot.hookUpgrades(up);
    const marks = [];
    let nextMark = 60;
    let dmgTaken = 0;
    const realHit = game.hitPlayer.bind(game);
    game.hitPlayer = (d) => { const before = game.p.hp; realHit(d); dmgTaken += Math.max(0, before - game.p.hp); };
    const STEP = 1 / 60;
    for (let i = 0; i < 60 * 700; i++) {
      if (game.state !== 'playing') break;
      bot.step(STEP);
      if (game.time >= nextMark) {
        marks.push({ t: nextMark, lv: game.level, kills: game.kills, hp: Math.round(game.p.hp), en: game.enemies.count });
        nextMark += 60;
      }
    }
    out.push({
      char: CHAR,
      time: +game.time.toFixed(1),
      won: game.won,
      level: game.level,
      kills: game.kills,
      dmgDone: Math.round(game.dmgDone),
      dmgTaken: Math.round(dmgTaken),
      shards: Math.round(game.runShards),
      weapons: game.weapons.map((w) => w.def.id + (w.def.evoOf ? '★' : ':' + w.lv)),
      passives: game.passives.map((p) => p.def.id + ':' + p.lv),
      marks,
    });
  }
  return out;
}, { RUNS, CHAR, PICK, BOT_SRC });

/* ------------------------------------------------------------------ report */
const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
console.log(`\n══ ${CHAR} × ${RUNS} runs (pick=${PICK}) ══`);
for (const r of runs) {
  console.log(` ${r.won ? '★WIN ' : '     '}${String(r.time).padStart(6)}s  Lv${String(r.level).padStart(3)}  ` +
    `${String(r.kills).padStart(5)} kills  taken ${String(r.dmgTaken).padStart(5)}  ` +
    `${r.weapons.join(' ')} | ${r.passives.join(' ')}`);
}
console.log(`\n avg time ${avg((r) => r.time).toFixed(0)}s   avg level ${avg((r) => r.level).toFixed(1)}   ` +
  `avg kills ${avg((r) => r.kills).toFixed(0)}   win rate ${(runs.filter((r) => r.won).length / runs.length * 100).toFixed(0)}%`);

console.log('\n time   level  kills   hp   enemies      (median across runs)');
const maxMarks = Math.max(...runs.map((r) => r.marks.length));
const med = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
for (let i = 0; i < maxMarks; i++) {
  const ms = runs.map((r) => r.marks[i]).filter(Boolean);
  if (ms.length < Math.max(1, runs.length / 2)) break;
  console.log(` ${String(ms[0].t).padStart(4)}s  ${String(med(ms.map((m) => m.lv))).padStart(5)}  ` +
    `${String(med(ms.map((m) => m.kills))).padStart(5)}  ${String(med(ms.map((m) => m.hp))).padStart(4)}  ` +
    `${String(med(ms.map((m) => m.en))).padStart(6)}   (${ms.length} alive)`);
}

await browser.close();
server.close();
