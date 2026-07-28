/**
 * Test pilot — a deliberately simple but *competent* bot, injected into the page
 * by the playtest harness. Balance numbers are only meaningful if the thing
 * holding the stick plays like a person: keep away from crowds, sweep up XP,
 * and pop Burst when surrounded.
 *
 * Returns a stepper you can drive at whatever rate you like.
 */
export function makeBot(game, opts = {}) {
  const pickStrategy = opts.pick || 'greedy';
  let ang = 0;

  /** Passives a player chasing damage would prioritise. */
  const CORE = ['power', 'haste', 'area', 'multishot', 'focus'];

  function chooseCard(choices, up) {
    if (pickStrategy === 'first') return choices[0];
    let best = null, bestScore = -1;
    for (const c of choices) {
      let s = 0;
      if (pickStrategy === 'focused') {
        // What a player who knows the game does: a small number of weapons
        // taken to max, backed by the multiplier passives, chasing evolutions.
        if (c.type === 'evo') s = 200;
        else if (c.type === 'weapon') s = c.lv === 1 ? (game.weapons.length < 3 ? 60 : 2) : 50 + c.lv;
        else if (c.type === 'passive') {
          const wanted = CORE.includes(c.id);
          s = c.lv === 1 ? (game.passives.length < 5 && wanted ? 45 : 8) : (wanted ? 40 + c.lv : 15);
        } else s = 5;
      } else {
        // greedy: prefer evolutions, then new weapons up to 4, then level-ups
        if (c.type === 'evo') s = 100;
        else if (c.type === 'weapon') s = c.lv === 1 ? (game.weapons.length < 4 ? 40 : 12) : 30 - c.lv;
        else if (c.type === 'passive') s = c.lv === 1 ? (game.passives.length < 4 ? 26 : 10) : 22 - c.lv;
        else s = 5;
      }
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return best;
  }

  function hookUpgrades(up) {
    game.uiBusy = () => false;
    game.onLevelUp = () => {
      const choices = up.buildChoices(game, 3);
      const c = chooseCard(choices, up);
      if (c) up.applyChoice(game, c);
    };
    game.onChest = () => {
      const c = up.buildChoices(game, 1)[0];
      if (c) up.applyChoice(game, c);
    };
  }

  function steer() {
    const p = game.p;
    let ax = 0, ay = 0;
    // repulsion from nearby threats
    let threats = 0;
    game.egrid.query(p.x, p.y, 190, (e) => {
      if (!e.alive || threats > 24) return;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 190) return;
      const w = (e.boss ? 5 : e.elite ? 3 : 1) * (190 - d) / 190;
      ax += (dx / d) * w; ay += (dy / d) * w;
      threats++;
    });
    const flee = Math.hypot(ax, ay);
    if (flee > 0) { ax /= flee; ay /= flee; }

    // attraction to the nearest gem when it's safe-ish
    let gx = 0, gy = 0, bd = 1e9;
    const G = game.gems.live;
    for (let i = 0; i < G.length; i += 3) {          // sample, not scan
      const g = G[i];
      const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
      if (d < bd) { bd = d; gx = g.x - p.x; gy = g.y - p.y; }
    }
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl; gy /= gl;

    // wander so we don't get stuck in a corner of the pressure field
    ang += 0.02;
    const wx = Math.cos(ang), wy = Math.sin(ang);

    const kFlee = threats > 3 ? 1.0 : 0.45;
    const kGem = threats > 8 ? 0.15 : 0.6;
    let mx = ax * kFlee + gx * kGem + wx * 0.25;
    let my = ay * kFlee + gy * kGem + wy * 0.25;
    const l = Math.hypot(mx, my) || 1;
    game.input.mx = mx / l; game.input.my = my / l; game.input.mag = 1;

    if (threats > 14 && game.burstT <= 0) game.input.burstQueued = true;
  }

  return {
    hookUpgrades,
    step(dt) {
      steer();
      game.update(dt);
      game.r.update(dt);      // keep the camera in sync even with the loop stopped
    },
  };
}
