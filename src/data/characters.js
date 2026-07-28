/** Playable pilots. `base` values are absolute starting stats. */
export const CHARACTERS = [
  {
    id: 'lumina', icon: 'c_lumina', weapon: 'bolt', cost: 0,
    name: { ja: 'ルミナ', en: 'LUMINA' },
    role: { ja: '万能型', en: 'BALANCED' },
    blurb: { ja: '扱いやすく、どんなビルドにも応える。', en: 'Forgiving, and good at everything.' },
    base: { hp: 110, spd: 152, armor: 0, dmgMul: 1, haste: 0, crit: 0.05, critMul: 2, xpMul: 1, magnetMul: 0, luck: 0, regen: 0, burstCd: 22 },
  },
  {
    id: 'nova', icon: 'c_nova', weapon: 'nova', cost: 250,
    name: { ja: 'ノヴァ', en: 'NOVA' },
    role: { ja: '重装型', en: 'BULWARK' },
    blurb: { ja: '硬くて遅い。押し寄せる群れを衝撃波で薙ぎ払う。', en: 'Slow and tough. Clears crowds with shockwaves.' },
    base: { hp: 150, spd: 134, armor: 2, dmgMul: 1, haste: -0.08, crit: 0.03, critMul: 2, xpMul: 1, magnetMul: 0, luck: 0, regen: 0.3, burstCd: 20 },
  },
  {
    id: 'sigma', icon: 'c_sigma', weapon: 'lance', cost: 550,
    name: { ja: 'シグマ', en: 'SIGMA' },
    role: { ja: '一撃型', en: 'GLASS CANNON' },
    blurb: { ja: '紙装甲だが火力は破格。会心を積み上げろ。', en: 'Paper-thin, absurd damage. Stack crit and pray.' },
    base: { hp: 72, spd: 170, armor: 0, dmgMul: 1.18, haste: 0.05, crit: 0.18, critMul: 2.2, xpMul: 1, magnetMul: 0, luck: 0, regen: 0, burstCd: 24 },
  },
  {
    id: 'echo', icon: 'c_echo', weapon: 'orbit', cost: 850,
    name: { ja: 'エコー', en: 'ECHO' },
    role: { ja: '収集型', en: 'HARVESTER' },
    blurb: { ja: '経験値と幸運に優れ、ビルドが一気に育つ。', en: 'Levels absurdly fast and finds better cards.' },
    base: { hp: 92, spd: 158, armor: 0, dmgMul: 0.95, haste: 0, crit: 0.05, critMul: 2, xpMul: 1.3, magnetMul: 1.6, luck: 0.2, regen: 0, burstCd: 20 },
  },
  {
    id: 'vex', icon: 'c_vex', weapon: 'arc', cost: -1, feat: 'win',
    name: { ja: 'ヴェクス', en: 'VEX' },
    role: { ja: '連鎖型', en: 'CONDUIT' },
    blurb: { ja: '手数で押す。クールダウンが極端に短い。', en: 'Everything recharges absurdly fast.' },
    base: { hp: 88, spd: 160, armor: 1, dmgMul: 0.92, haste: 0.28, crit: 0.08, critMul: 2, xpMul: 1.05, magnetMul: 0.3, luck: 0.05, regen: 0, burstCd: 16 },
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
