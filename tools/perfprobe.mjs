#!/usr/bin/env node
/** Breaks the frame down by phase so we know what to optimise. */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8567;
const EXEC = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const server = createStaticServer(ROOT);
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: EXEC, headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__lumina);
await page.click('#btnPlay');
await page.waitForTimeout(300);

const out = await page.evaluate(async () => {
  const { game, r } = window.__lumina;
  const m = await import('./src/game/upgrades.js');
  game.onLevelUp = () => { const c = m.buildChoices(game, 3)[0]; if (c) m.applyChoice(game, c); };
  game.onChest = game.onLevelUp;
  // fast-forward to a heavy state
  let a = 0;
  for (let i = 0; i < 60 * 300; i++) {
    a += 0.012;
    game.input.mx = Math.cos(a); game.input.my = Math.sin(a); game.input.mag = 1;
    if (game.p.hp < game.p.maxHp * 0.5) game.p.hp = game.p.maxHp;   // immortal probe
    game.update(1 / 60);
  }
  game.p.hp = game.p.maxHp;

  const bench = async (label, fn, frames = 60) => {
    const ts = [];
    for (let i = 0; i < frames; i++) {
      await new Promise((res) => requestAnimationFrame(res));
      const t0 = performance.now();
      fn();
      ts.push(performance.now() - t0);
    }
    ts.sort((x, y) => x - y);
    return { label, median: +ts[ts.length >> 1].toFixed(2) };
  };

  const res = [];
  res.push(await bench('update only', () => game.update(1 / 60)));
  res.push(await bench('full draw', () => game.draw()));
  const oldAlpha = r.q.bloomAlpha;
  r.q.bloomAlpha = 0;
  res.push(await bench('draw, no bloom', () => game.draw()));
  const oldStars = r.q.starLayers, oldGrid = r.q.grid;
  r.q.starLayers = 0; r.q.grid = false;
  res.push(await bench('draw, no bloom/bg', () => game.draw()));
  r.q.starLayers = oldStars; r.q.grid = oldGrid;
  res.push(await bench('bg only', () => { r.begin(); }));
  r.q.bloomAlpha = oldAlpha;
  res.push(await bench('bloom only', () => { r.bloom(); }));

  return {
    res,
    counts: {
      enemies: game.enemies.count, bullets: game.bullets.count, particles: game.fx.count,
      gems: game.gems.count, zones: game.zones.count, level: game.level, time: Math.round(game.time),
      canvas: `${r.cv.width}x${r.cv.height}`, bloomBuf: `${r.bl.width}x${r.bl.height}`,
      weapons: game.weapons.map((w) => w.def.id + ':' + w.lv).join(' '),
    },
  };
});

console.log(JSON.stringify(out.counts, null, 1));
for (const r of out.res) console.log(`  ${r.label.padEnd(20)} ${String(r.median).padStart(6)} ms`);

await browser.close();
server.close();
