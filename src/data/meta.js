/**
 * Permanent upgrades bought with Shards (the "Lab").
 * `val[i]` = cumulative bonus at level i+1. `cost[i]` = price of level i+1.
 */
export const META = [
  {
    id: 'might', icon: 'power', max: 5, cost: [40, 70, 120, 190, 280],
    name: { ja: '恒久出力', en: 'Core Tuning' },
    desc: { ja: '全ダメージ +4%/段', en: '+4% damage per rank' },
    stat: 'dmgMul', val: [0.04, 0.08, 0.12, 0.16, 0.2],
  },
  {
    id: 'vigor', icon: 'vitality', max: 5, cost: [30, 55, 95, 150, 230],
    name: { ja: '耐久強化', en: 'Reinforcement' },
    desc: { ja: '最大HP +8/段', en: '+8 max HP per rank' },
    stat: 'hpAdd', val: [8, 16, 24, 32, 42],
  },
  {
    id: 'plating', icon: 'armor', max: 3, cost: [90, 190, 340],
    name: { ja: '硬質皮膜', en: 'Hard Plating' },
    desc: { ja: '装甲 +1/段', en: '+1 armor per rank' },
    stat: 'armor', val: [1, 2, 3],
  },
  {
    id: 'thrust', icon: 'swift', max: 4, cost: [35, 65, 115, 180],
    name: { ja: '推進調整', en: 'Thrust Tuning' },
    desc: { ja: '移動速度 +3%/段', en: '+3% move speed per rank' },
    stat: 'spdMul', val: [0.03, 0.06, 0.09, 0.12],
  },
  {
    id: 'scholar', icon: 'insight', max: 5, cost: [45, 80, 130, 200, 300],
    name: { ja: '解析精度', en: 'Deep Analysis' },
    desc: { ja: '獲得経験値 +6%/段', en: '+6% XP per rank' },
    stat: 'xpMul', val: [0.06, 0.12, 0.19, 0.26, 0.35],
  },
  {
    id: 'grasp', icon: 'magnet', max: 3, cost: [40, 80, 150],
    name: { ja: '収集範囲', en: 'Collector' },
    desc: { ja: '吸引範囲 +20%/段', en: '+20% pickup radius per rank' },
    stat: 'magnetMul', val: [0.2, 0.42, 0.7],
  },
  {
    id: 'mend', icon: 'regen', max: 4, cost: [60, 110, 190, 300],
    name: { ja: '自動修復', en: 'Auto-Mender' },
    desc: { ja: '毎秒回復 +0.3/段', en: '+0.3 HP/s per rank' },
    stat: 'regen', val: [0.3, 0.6, 0.95, 1.4],
  },
  {
    id: 'fortune', icon: 'luck', max: 4, cost: [70, 130, 220, 340],
    name: { ja: '幸運強化', en: 'Fortune Circuit' },
    desc: { ja: '幸運 +6%/段', en: '+6% luck per rank' },
    stat: 'luck', val: [0.06, 0.12, 0.19, 0.27],
  },
  {
    id: 'overcharge', icon: 'overdrive', max: 4, cost: [55, 100, 170, 270],
    name: { ja: 'バースト調整', en: 'Burst Tuning' },
    desc: { ja: 'バーストCD -6%/段', en: '-6% burst cooldown per rank' },
    stat: 'burstCdMul', val: [-0.06, -0.12, -0.18, -0.25],
  },
  {
    id: 'reroll', icon: 'reroll', max: 3, cost: [80, 160, 300],
    name: { ja: '引き直し券', en: 'Reroll Token' },
    desc: { ja: 'レベルアップの引き直し +1', en: '+1 reroll per run' },
    stat: 'rerolls', val: [1, 2, 3],
  },
  {
    id: 'banish', icon: 'banish', max: 2, cost: [120, 260],
    name: { ja: '除外券', en: 'Banish Token' },
    desc: { ja: '不要な選択肢を除外 +1', en: '+1 banish per run' },
    stat: 'banishes', val: [1, 2],
  },
  {
    id: 'headstart', icon: 'headstart', max: 2, cost: [150, 400],
    name: { ja: '先行装備', en: 'Head Start' },
    desc: { ja: '開始時に強化を1つ選べる', en: 'Begin each run with an extra upgrade' },
    stat: 'headstart', val: [1, 2],
  },
  {
    id: 'revive', icon: 'revive', max: 1, cost: [900],
    name: { ja: '再起動', en: 'Reboot' },
    desc: { ja: '一度だけ、HP半分で復活する', en: 'Revive once at half HP' },
    stat: 'revives', val: [1],
  },
  {
    id: 'greed', icon: 'shard', max: 5, cost: [60, 110, 180, 280, 420],
    name: { ja: '換金効率', en: 'Refinery' },
    desc: { ja: '獲得シャード +8%/段', en: '+8% shards earned per rank' },
    stat: 'shardMul', val: [0.08, 0.16, 0.25, 0.35, 0.5],
  },
];

export const META_BY_ID = Object.fromEntries(META.map((m) => [m.id, m]));

/** Total shards sunk into the lab (for the refund button). */
export function spentTotal(levels) {
  let sum = 0;
  for (const m of META) {
    const lv = Math.min(m.max, Math.max(0, levels[m.id] | 0));
    for (let i = 0; i < lv; i++) sum += m.cost[i];
  }
  return sum;
}

/** Aggregate meta bonuses into a flat object of stat -> value. */
export function metaBonuses(levels) {
  const out = {};
  for (const m of META) {
    const lv = levels[m.id] | 0;
    if (lv <= 0) continue;
    out[m.stat] = (out[m.stat] || 0) + m.val[Math.min(lv, m.max) - 1];
  }
  return out;
}
