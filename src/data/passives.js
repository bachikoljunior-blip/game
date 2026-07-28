/**
 * Passive upgrades. Each has 5 levels; `val[i]` is the CUMULATIVE bonus at level i+1
 * so the card can show the delta and the stat block can read one number.
 */
export const PASSIVES = [
  {
    id: 'power', icon: 'power', kind: 'passive', max: 5,
    name: { ja: '出力上昇', en: 'Power Core' },
    desc: { ja: 'すべての攻撃のダメージが上がる。', en: 'All weapons deal more damage.' },
    stat: 'dmgMul', val: [0.12, 0.24, 0.36, 0.50, 0.65], unit: '%',
  },
  {
    id: 'haste', icon: 'haste', kind: 'passive', max: 5,
    name: { ja: '高速装填', en: 'Rapid Loader' },
    desc: { ja: '武器のクールダウンが短くなる。', en: 'Weapons recharge faster.' },
    stat: 'haste', val: [0.10, 0.20, 0.30, 0.42, 0.55], unit: '%',
  },
  {
    id: 'area', icon: 'area', kind: 'passive', max: 5,
    name: { ja: '増幅フィールド', en: 'Amplifier' },
    desc: { ja: '攻撃範囲と弾のサイズが大きくなる。', en: 'Bigger attacks and projectiles.' },
    stat: 'areaMul', val: [0.12, 0.24, 0.37, 0.50, 0.65], unit: '%',
  },
  {
    id: 'multishot', icon: 'multishot', kind: 'passive', max: 5,
    name: { ja: '分裂射撃', en: 'Split Barrel' },
    desc: { ja: '弾を撃つ武器の弾数が増える。', en: 'Projectile weapons fire extra shots.' },
    stat: 'projAdd', val: [1, 1, 2, 2, 3], unit: 'flat',
  },
  {
    id: 'swift', icon: 'swift', kind: 'passive', max: 5,
    name: { ja: '推進強化', en: 'Thrusters' },
    desc: { ja: '移動速度が上がる。', en: 'Move faster.' },
    stat: 'spdMul', val: [0.08, 0.16, 0.24, 0.33, 0.42], unit: '%',
  },
  {
    id: 'vitality', icon: 'vitality', kind: 'passive', max: 5,
    name: { ja: '生命装甲', en: 'Vital Frame' },
    desc: { ja: '最大HPが増え、同量を回復する。', en: 'Raises max HP and heals you.' },
    stat: 'hpMul', val: [0.15, 0.30, 0.45, 0.62, 0.80], unit: '%',
  },
  {
    id: 'armor', icon: 'armor', kind: 'passive', max: 5,
    name: { ja: '反射装甲', en: 'Deflectors' },
    desc: { ja: '被ダメージを一定量軽減する。', en: 'Reduces every hit you take.' },
    stat: 'armor', val: [1, 2, 3, 4, 6], unit: 'flat',
  },
  {
    id: 'magnet', icon: 'magnet', kind: 'passive', max: 5,
    name: { ja: '重力収集', en: 'Gravity Well' },
    desc: { ja: '経験値の吸引範囲が広がる。', en: 'Wider pickup radius.' },
    stat: 'magnetMul', val: [0.3, 0.6, 0.95, 1.35, 1.8], unit: '%',
  },
  {
    id: 'insight', icon: 'insight', kind: 'passive', max: 5,
    name: { ja: '解析装置', en: 'Analyser' },
    desc: { ja: '獲得経験値が増える。', en: 'Gain more XP.' },
    stat: 'xpMul', val: [0.12, 0.24, 0.38, 0.52, 0.70], unit: '%',
  },
  {
    id: 'focus', icon: 'focus', kind: 'passive', max: 5,
    name: { ja: '照準補正', en: 'Targeting' },
    desc: { ja: '会心率と会心ダメージが上がる。', en: 'More crit chance and crit damage.' },
    stat: 'crit', val: [0.06, 0.12, 0.18, 0.25, 0.33], unit: '%',
    extra: { stat: 'critMul', val: [0.15, 0.3, 0.45, 0.6, 0.8] },
  },
  {
    id: 'regen', icon: 'regen', kind: 'passive', max: 5,
    name: { ja: '自己修復', en: 'Nanoweave' },
    desc: { ja: '毎秒HPが回復する。', en: 'Regenerate HP every second.' },
    stat: 'regen', val: [0.5, 1.0, 1.6, 2.3, 3.2], unit: 'flat',
  },
  {
    id: 'luck', icon: 'luck', kind: 'passive', max: 5,
    name: { ja: '幸運回路', en: 'Fortune' },
    desc: { ja: 'レアな選択肢とドロップが増える。', en: 'Better cards and more drops.' },
    stat: 'luck', val: [0.12, 0.24, 0.38, 0.52, 0.70], unit: '%',
  },
  {
    id: 'overdrive', icon: 'overdrive', kind: 'passive', max: 5,
    name: { ja: 'バースト回路', en: 'Overdrive' },
    desc: { ja: 'バーストの威力が上がり再使用が早くなる。', en: 'Stronger Burst, shorter cooldown.' },
    stat: 'burstPow', val: [0.25, 0.5, 0.8, 1.15, 1.6], unit: '%',
    extra: { stat: 'burstCdMul', val: [-0.12, -0.22, -0.32, -0.42, -0.52] },
  },
];

export const PASSIVE_BY_ID = Object.fromEntries(PASSIVES.map((p) => [p.id, p]));
