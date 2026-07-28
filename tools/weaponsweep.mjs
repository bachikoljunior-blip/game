#!/usr/bin/env node
/**
 * Exercises every weapon and every evolution in a live run: gives the player the
 * weapon at each level, simulates and draws with enemies present, and reports
 * damage output plus any error. Catches behaviours that a random playtest may
 * never reach.
 *
 *   node tools/weaponsweep.mjs
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8177;
const EXEC = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const server = createStaticServer(ROOT);
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({
  executablePath: EXEC, headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__lumina);

const rows = await page.evaluate(async () => {
  const { game, r } = window.__lumina;
  const W = await import('./src/data/weapons.js');
  const P = await import('./src/data/passives.js');
  const out = [];

  for (const def of W.ALL_WEAPONS) {
    for (const lv of def.max > 1 ? [1, Math.ceil(def.max / 2), def.max] : [1]) {
      game.start('lumina', false);
      game.weapons.length = 0;
      // area/multishot on, to exercise the scaling paths too
      game.passives.push({ def: P.PASSIVE_BY_ID.area, lv: 3 });
      game.passives.push({ def: P.PASSIVE_BY_ID.multishot, lv: 3 });
      game.passives.push({ def: P.PASSIVE_BY_ID.haste, lv: 3 });
      game.recomputeStats();
      const w = game.addWeapon(def.id);
      w.lv = lv;
      if (def.init) def.init(game, w);

      // a ring of targets that keeps being replenished
      const spawn = () => {
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const d = 60 + (i % 4) * 55;
          const e = game.spawnEnemy('drift', game.p.x + Math.cos(a) * d, game.p.y + Math.sin(a) * d, 40);
          if (e) { e.spd = 0; e.def = { ...e.def, ai() {} }; }
        }
      };
      spawn();

      let err = null;
      const before = game.dmgDone;
      try {
        for (let i = 0; i < 60 * 6; i++) {
          game.p.hp = game.p.maxHp;
          game.input.mx = Math.cos(i * 0.02); game.input.my = Math.sin(i * 0.02); game.input.mag = 1;
          game.update(1 / 60);
          game.r.update(1 / 60);
          if (i % 90 === 0) spawn();
          if (i % 30 === 0) game.draw();          // exercise the draw path as well
        }
      } catch (e) { err = e.message; }

      const dps = (game.dmgDone - before) / 6;
      out.push({
        id: def.id, lv, max: def.max, evo: !!def.evoOf,
        dps: Math.round(dps), kills: game.kills, err,
        bullets: game.bullets.count, zones: game.zones.count, beams: game.beams.count,
      });
    }
  }
  return out;
});

console.log('\n  weapon           lv   est. DPS   kills   err');
let bad = 0;
for (const row of rows) {
  const flag = row.err ? '✗' : row.dps <= 0 ? '⚠' : ' ';
  if (row.err || row.dps <= 0) bad++;
  console.log(` ${flag} ${(row.id + (row.evo ? '★' : '')).padEnd(16)} ${String(row.lv).padStart(2)}   ` +
    `${String(row.dps).padStart(8)}   ${String(row.kills).padStart(5)}   ${row.err || ''}`);
}
if (errors.length) {
  console.log('\n─── page errors ───');
  [...new Set(errors)].forEach((e) => console.log(' ✗', e));
}
console.log(bad || errors.length ? `\n✗ ${bad} weapon(s) with problems` : '\n✓ every weapon and evolution fires and deals damage');

await browser.close();
server.close();
process.exit(bad || errors.length ? 1 : 0);
