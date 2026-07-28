/**
 * Level-up offer generation, application, and (auto-generated) card text.
 * Descriptions are derived from the actual stat tables, so they can never
 * drift away from what the weapon really does.
 */
import { WEAPONS, WEAPON_BY_ID } from '../data/weapons.js';
import { PASSIVES, PASSIVE_BY_ID } from '../data/passives.js';
import { L, lang } from '../core/i18n.js';

export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

const STAT_LABEL = {
  dmg: { ja: 'ダメージ', en: 'Damage' },
  count: { ja: '弾数', en: 'Projectiles' },
  cd: { ja: '攻撃間隔', en: 'Cooldown' },
  radius: { ja: '範囲', en: 'Area' },
  pierce: { ja: '貫通', en: 'Pierce' },
  chains: { ja: '連鎖', en: 'Chains' },
  nodes: { ja: '結晶', en: 'Shards' },
  drones: { ja: 'ドローン', en: 'Drones' },
  fireCd: { ja: '発射間隔', en: 'Fire delay' },
  life: { ja: '持続', en: 'Duration' },
  range: { ja: '射程', en: 'Range' },
  speed: { ja: '弾速', en: 'Speed' },
};
const DPS_LABEL = { ja: '毎秒ダメージ', en: 'Damage/sec' };

function num(v) {
  return Math.abs(v) < 1 ? (Math.round(v * 100) / 100).toString() : (Math.round(v * 10) / 10).toString();
}

/** Human-readable diff between two weapon levels. */
export function weaponDelta(def, lv) {
  if (lv <= 1) return L(def.desc);
  const parts = [];
  for (const key in def.stats) {
    const s = def.stats[key];
    if (!Array.isArray(s)) continue;
    const a = s[Math.min(s.length - 1, lv - 2)], b = s[Math.min(s.length - 1, lv - 1)];
    if (a === b) continue;
    const lbl = STAT_LABEL[key] ? L(STAT_LABEL[key]) : key;
    const label = key === 'dmg' && (def.id === 'ember' || def.id === 'ember_x') ? L(DPS_LABEL) : lbl;
    const d = b - a;
    const suffix = key === 'cd' || key === 'fireCd' || key === 'life' ? 's' : '';
    parts.push(`${label} ${d > 0 ? '+' : ''}${num(d)}${suffix}`);
  }
  return parts.length ? parts.join(' / ') : L(def.desc);
}

export function passiveDelta(def, lv) {
  const prev = lv <= 1 ? 0 : def.val[lv - 2];
  const cur = def.val[lv - 1];
  const d = cur - prev;
  const fmt = (v) => (def.unit === '%' ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` : `${v > 0 ? '+' : ''}${num(v)}`);
  let s = fmt(d);
  if (def.extra) {
    const pv = lv <= 1 ? 0 : def.extra.val[lv - 2];
    s += ` / ${fmt(def.extra.val[lv - 1] - pv)}`;
  }
  return lv <= 1 ? `${L(def.desc)} (${s})` : s;
}

/* ------------------------------------------------------------------ offers */
function evoAvailable(g) {
  const out = [];
  for (const w of g.weapons) {
    const def = w.def;
    if (!def.evo || w.lv < def.max) continue;
    const need = g.passives.find((p) => p.def.id === def.evo.need);
    if (!need || need.lv < 4) continue;
    const edef = WEAPON_BY_ID[def.evo.id];
    if (!edef) continue;
    out.push({ type: 'evo', id: edef.id, def: edef, lv: 1, from: w, rarity: 'evo' });
  }
  return out;
}

/** Build `n` distinct offers for the level-up screen. */
export function buildChoices(g, n = 3) {
  const out = [];
  const banned = g.banned;

  // an available evolution always takes the top slot
  const evos = evoAvailable(g).filter((e) => !banned.has(e.id));
  if (evos.length) out.push(g.rng.pick(evos));

  const pool = [];
  const wCount = g.weapons.length, pCount = g.passives.length;

  for (const def of WEAPONS) {
    if (banned.has(def.id)) continue;
    const owned = g.weapons.find((w) => w.def.id === def.id || w.def.evoOf === def.id);
    if (owned) {
      if (owned.def.evoOf || owned.lv >= owned.def.max) continue;
      pool.push({ type: 'weapon', id: def.id, def, lv: owned.lv + 1, own: owned, w: 9 - owned.lv * 0.4, rarity: owned.lv >= 5 ? 'rare' : 'norm' });
    } else if (wCount < MAX_WEAPONS) {
      pool.push({ type: 'weapon', id: def.id, def, lv: 1, w: wCount < 3 ? 13 : 6, rarity: 'new' });
    }
  }
  for (const def of PASSIVES) {
    if (banned.has(def.id)) continue;
    const owned = g.passives.find((p) => p.def.id === def.id);
    if (owned) {
      if (owned.lv >= def.max) continue;
      pool.push({ type: 'passive', id: def.id, def, lv: owned.lv + 1, own: owned, w: 7 - owned.lv * 0.3, rarity: owned.lv >= 3 ? 'rare' : 'norm' });
    } else if (pCount < MAX_PASSIVES) {
      pool.push({ type: 'passive', id: def.id, def, lv: 1, w: 8, rarity: 'new' });
    }
  }

  const luckBias = 1 + g.st.luck;
  while (out.length < n && pool.length) {
    const pick = g.rng.weighted(pool, (o) => o.w * (o.rarity === 'rare' ? luckBias : 1));
    if (!pick) break;
    pool.splice(pool.indexOf(pick), 1);
    out.push(pick);
  }

  // fallbacks when everything is maxed
  while (out.length < Math.min(n, 3)) {
    out.push(g.rng.f() < 0.5
      ? { type: 'heal', id: 'heal_' + out.length, lv: 1, rarity: 'norm' }
      : { type: 'shard', id: 'shard_' + out.length, lv: 1, rarity: 'norm' });
  }
  return out;
}

export function applyChoice(g, c) {
  switch (c.type) {
    case 'evo': {
      const slot = g.weapons.indexOf(c.from);
      const w = g.addWeapon(c.def.id, true);   // appended to the end...
      g.weapons.pop();                          // ...then moved into the old slot
      if (slot >= 0) g.weapons[slot] = w; else g.weapons.push(w);
      g.evolved.push(c.def.id);
      g.fx.blast(g.p.x, g.p.y, 220, '#ffd45c', 0.6);
      g.fx.ring(g.p.x, g.p.y, 260, '#fff', 0.7, 7);
      g.shake(10);
      g.snd.chest();
      break;
    }
    case 'weapon':
      if (c.own) c.own.lv++;
      else g.addWeapon(c.def.id);
      break;
    case 'passive':
      if (c.own) c.own.lv++;
      else g.passives.push({ def: c.def, lv: 1 });
      break;
    case 'heal':
      g.healPlayer(40);
      break;
    case 'shard':
      g.runShards += 25;
      break;
  }
  g.recomputeStats();
}

/** Everything the card UI needs. */
export function cardInfo(g, c) {
  if (c.type === 'heal') {
    return {
      icon: 'heart', rarity: 'norm',
      title: lang === 'ja' ? '修復キット' : 'Repair Kit',
      sub: lang === 'ja' ? 'HPを40回復する。' : 'Restore 40 HP.',
      lvl: '', tag: '',
    };
  }
  if (c.type === 'shard') {
    return {
      icon: 'shard', rarity: 'norm',
      title: lang === 'ja' ? 'シャード鉱脈' : 'Shard Vein',
      sub: lang === 'ja' ? 'シャードを25個獲得する。' : 'Gain 25 shards.',
      lvl: '', tag: '',
    };
  }
  const def = c.def;
  const isW = c.type === 'weapon' || c.type === 'evo';
  return {
    icon: def.icon,
    rarity: c.rarity,
    title: L(def.name),
    sub: isW ? weaponDelta(def, c.lv) : passiveDelta(def, c.lv),
    lvl: c.type === 'evo' ? '' : `Lv.${c.lv}`,
    tag: c.type === 'evo' ? 'evo' : c.lv === 1 ? 'new' : '',
  };
}
