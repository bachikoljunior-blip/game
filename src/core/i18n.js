/** Tiny i18n. Content names live with their data; this covers chrome + prose. */
import { save } from './save.js';

const DICT = {
  ja: {
    tagline: '片手で挑む ネオン生存戦',
    play: 'ゲーム開始', pilots: '機体選択', lab: '強化ラボ', codex: '記録', options: '設定',
    deploy: '出撃', back: '戻る', respec: 'すべて返金', close: '閉じる',
    levelUp: 'レベルアップ', reroll: '引き直し', banish: '除外', skip: 'スキップ（+10 HP）',
    cache: '補給コンテナ', claim: '受け取る', paused: '一時停止', resume: '再開', abandon: '撤退する',
    home: 'ホーム', again: 'もう一度',
    survived: '生存記録', victory: '生還成功', defeat: '力尽きた',
    time: '生存時間', kills: '撃破', level: 'レベル', damage: '与ダメージ', shardsEarned: '獲得シャード',
    weapons: '武器', passives: 'パッシブ', stats: 'ステータス',
    newRecord: '自己最高記録！', unlockedTitle: '解放', endlessUnlocked: 'エンドレスモードが解放されました',
    lang: '言語', sfxVol: '効果音', musVol: '音楽', haptics: '振動', quality: '画質',
    qAuto: '自動', qHigh: '高', qLow: '軽量',
    on: 'オン', off: 'オフ',
    resetSave: 'セーブデータを消去', resetConfirm: '本当に消去しますか？ 元に戻せません。',
    howTitle: '遊び方',
    how: '<b>画面のどこでもドラッグ</b>して移動。攻撃は自動です。敵を倒して<b>経験値</b>を集め、レベルアップで武器を選び、自分だけのビルドを組み上げましょう。<br>右下の<b>バースト</b>で周囲を吹き飛ばし、短時間無敵になります（2本目の指でタップしてもOK）。<br>10分間生き延びて<b>コアを撃破</b>すれば勝利。<br>キーボード: <kbd>WASD</kbd> 移動 / <kbd>Space</kbd> バースト / <kbd>Esc</kbd> 一時停止',
    creditNote: 'グラフィック・効果音・音楽はすべてリアルタイム生成。外部素材ゼロ、オフライン動作。',
    best: '最高', run: '出撃回数', wins: '勝利', totalShards: '所持シャード',
    lockedHint: '未解放', costShards: 'シャード',
    maxed: 'MAX', owned: '所持', buy: '強化',
    warnHorde: '大群 接近', warnElite: 'エリート出現', warnBoss: '警告：コア覚醒',
    bossName: 'アビス・コア',
    evolveReady: '進化可能',
    needShards: 'シャードが足りません',
    lvl: 'Lv',
    tapToStart: 'タップして開始',
    hintMove: '<b>画面のどこでもドラッグ</b>して移動。攻撃は自動です',
    danger: '危険度',
    endless: 'エンドレス',
    endlessOn: 'エンドレス モード',
    startWeapon: '初期武器',
    chooseUpgrade: '強化を選択',
    dps: '推定DPS', hpStat: '最大HP', spdStat: '移動速度', armorStat: '装甲',
    critStat: '会心率', areaStat: '範囲', hasteStat: '攻速', magnetStat: '収集',
    growth: '成長', regenStat: '再生',
  },
  en: {
    tagline: 'ONE-THUMB NEON SURVIVAL',
    play: 'START RUN', pilots: 'PILOTS', lab: 'UPGRADE LAB', codex: 'CODEX', options: 'OPTIONS',
    deploy: 'DEPLOY', back: 'BACK', respec: 'REFUND ALL', close: 'CLOSE',
    levelUp: 'LEVEL UP', reroll: 'REROLL', banish: 'BANISH', skip: 'SKIP (+10 HP)',
    cache: 'SUPPLY CACHE', claim: 'CLAIM', paused: 'PAUSED', resume: 'RESUME', abandon: 'ABANDON RUN',
    home: 'HOME', again: 'RUN AGAIN',
    survived: 'RUN REPORT', victory: 'CORE DESTROYED', defeat: 'YOU FELL',
    time: 'TIME', kills: 'KILLS', level: 'LEVEL', damage: 'DAMAGE', shardsEarned: 'SHARDS',
    weapons: 'WEAPONS', passives: 'PASSIVES', stats: 'STATS',
    newRecord: 'NEW RECORD!', unlockedTitle: 'UNLOCKED', endlessUnlocked: 'Endless mode unlocked',
    lang: 'Language', sfxVol: 'SFX', musVol: 'Music', haptics: 'Haptics', quality: 'Quality',
    qAuto: 'Auto', qHigh: 'High', qLow: 'Lite',
    on: 'ON', off: 'OFF',
    resetSave: 'Erase save data', resetConfirm: 'Erase all progress? This cannot be undone.',
    howTitle: 'HOW TO PLAY',
    how: '<b>Drag anywhere</b> to move — weapons fire themselves. Collect <b>XP</b> from kills, then pick upgrades to build your own engine of destruction.<br>Tap <b>Burst</b> (bottom right) to blast everything nearby and gain brief invulnerability — a second finger anywhere works too.<br>Survive 10 minutes and <b>kill the Core</b> to win.<br>Keyboard: <kbd>WASD</kbd> move / <kbd>Space</kbd> burst / <kbd>Esc</kbd> pause',
    creditNote: 'Every pixel and every sound is generated at runtime. No assets, fully offline.',
    best: 'BEST', run: 'RUNS', wins: 'WINS', totalShards: 'SHARDS',
    lockedHint: 'LOCKED', costShards: 'shards',
    maxed: 'MAX', owned: 'OWNED', buy: 'UPGRADE',
    warnHorde: 'HORDE INCOMING', warnElite: 'ELITE DETECTED', warnBoss: 'WARNING: CORE AWAKENS',
    bossName: 'ABYSS CORE',
    evolveReady: 'EVOLUTION READY',
    needShards: 'Not enough shards',
    lvl: 'Lv',
    tapToStart: 'TAP TO START',
    hintMove: '<b>Drag anywhere</b> to move — your weapons fire themselves',
    danger: 'THREAT',
    endless: 'ENDLESS',
    endlessOn: 'ENDLESS MODE',
    startWeapon: 'START WEAPON',
    chooseUpgrade: 'CHOOSE AN UPGRADE',
    dps: 'EST. DPS', hpStat: 'MAX HP', spdStat: 'SPEED', armorStat: 'ARMOR',
    critStat: 'CRIT', areaStat: 'AREA', hasteStat: 'HASTE', magnetStat: 'MAGNET',
    growth: 'GROWTH', regenStat: 'REGEN',
  },
};

export let lang = 'ja';

export function initLang() {
  const stored = save.opts.lang;
  if (stored && DICT[stored]) lang = stored;
  else lang = /^ja/i.test(navigator.language || '') ? 'ja' : 'en';
  document.documentElement.lang = lang;
  return lang;
}
export function setLang(l) {
  if (!DICT[l]) return;
  lang = l;
  save.setOpt('lang', l);
  document.documentElement.lang = l;
  applyDom();
}
export function t(key) {
  const d = DICT[lang];
  return (d && d[key]) !== undefined ? d[key] : (DICT.en[key] !== undefined ? DICT.en[key] : key);
}
/** Pick the right side of a {ja,en} pair coming from data files. */
export function L(pair) {
  if (pair === null || pair === undefined) return '';
  if (typeof pair === 'string') return pair;
  return pair[lang] !== undefined ? pair[lang] : pair.en;
}
export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    const v = t(k);
    if (/<[a-z]/i.test(v)) el.innerHTML = v; else el.textContent = v;
  });
}
