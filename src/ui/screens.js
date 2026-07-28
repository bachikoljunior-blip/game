/**
 * All menus and modals. Everything is DOM so text stays crisp and tappable;
 * the canvas keeps rendering behind them (blurred by CSS) for atmosphere.
 */
import { save } from '../core/save.js';
import { sound } from '../core/audio.js';
import { t, L, lang, setLang } from '../core/i18n.js';
import { fmtTime, fmtNum, clamp } from '../core/util.js';
import { iconCanvas } from './icons.js';
import { CHARACTERS, CHAR_BY_ID } from '../data/characters.js';
import { META, spentTotal } from '../data/meta.js';
import { WEAPONS, EVOS, WEAPON_BY_ID, estimateDps } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { ENEMIES } from '../data/enemies.js';
import { buildChoices, applyChoice, cardInfo } from '../game/upgrades.js';

const $ = (id) => document.getElementById(id);
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const click = (node, fn, silent) => {
  node.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (!silent) sound.ui(0);
    fn(ev);
  });
};

export class Screens {
  constructor(g, hud, api) {
    this.g = g; this.hud = hud; this.api = api;
    this.cur = null;
    this.choices = [];
    this.selChar = save.data.chosen || 'lumina';
    this.endless = false;
    this._bind();
    this.drawLogo();
  }

  /* ------------------------------------------------------------- plumbing */
  isOpen() { return !!this.cur; }
  /** Screens that should freeze the simulation. */
  isModal() {
    return this.cur === 'levelup' || this.cur === 'pause' || this.cur === 'chest' ||
      this.cur === 'results' || this.cur === 'title' || this.cur === 'chars' ||
      this.cur === 'shop' || this.cur === 'options' || this.cur === 'codex';
  }
  show(id) {
    document.querySelectorAll('#overlay .screen').forEach((s) => s.classList.remove('show'));
    this.cur = id;
    if (id) {
      const s = $('scr-' + id);
      if (s) s.classList.add('show');
    }
    sound.muffle(!!id && id !== 'title');
    this.g.input.enabled = !id;
    if (id) this.g.input.release();      // never resume with a stuck stick
  }
  close() { this.show(null); }

  _bind() {
    click($('btnPlay'), () => this.api.start(this.selChar));
    click($('btnChars'), () => this.openChars());
    click($('btnShop'), () => this.openShop());
    click($('btnCodex'), () => this.openCodex());
    click($('btnOptions'), () => this.openOptions());
    document.querySelectorAll('[data-close]').forEach((b) => click(b, () => this.openTitle()));
    click($('btnCharGo'), () => this.api.start(this.selChar));
    click($('btnRespec'), () => this.respec());
    click($('btnEndless'), () => {
      this.endless = !this.endless;
      this.openTitle();
    });

    click($('btnReroll'), () => this.reroll());
    click($('btnBanish'), () => this.banishMode());
    click($('btnSkip'), () => { this.g.healPlayer(10); this.closeLevelUp(); });
    click($('btnChestOk'), () => this.closeChest());

    click($('btnPause'), () => this.openPause());
    click($('btnResume'), () => this.api.resume());
    click($('btnQuit'), () => this.api.quit());
    click($('btnResHome'), () => this.openTitle());
    click($('btnResAgain'), () => this.api.start(this.selChar));

    const burst = $('btnBurst');
    burst.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.g.input.burstQueued = true;
    });
  }

  /* ---------------------------------------------------------------- title */
  openTitle() {
    this.show('title');
    this.hud.show(false);
    $('titleShards').textContent = save.shards;
    const b = save.data.best;
    $('titleBest').textContent = b.time > 0
      ? `${t('best')} ${fmtTime(b.time)} · ${t('level')} ${b.level}` : '';
    const ch = CHAR_BY_ID[this.selChar] || CHARACTERS[0];
    $('playSub').textContent = L(ch.name);
    const eb = $('btnEndless');
    eb.classList.toggle('hidden', !save.data.endlessUnlocked);
    if (!save.data.endlessUnlocked) this.endless = false;
    eb.classList.toggle('on', this.endless);
    this.drawLogo();
  }

  drawLogo() {
    const cv = $('logoCanvas');
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const W = 620, H = 260;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const word = 'LUMINA';
    const size = 92;
    ctx.font = `900 ${size}px ui-sans-serif,system-ui,-apple-system,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const spacing = 11;
    const widths = [...word].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (word.length - 1);
    let x = W / 2 - total / 2;
    const y = H / 2 - 6;

    const grad = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#d8f8ff');
    grad.addColorStop(1, '#4fd6f5');

    // glow passes
    for (let pass = 0; pass < 3; pass++) {
      ctx.save();
      ctx.shadowColor = pass === 0 ? 'rgba(60,220,255,.9)' : 'rgba(120,240,255,.5)';
      ctx.shadowBlur = pass === 0 ? 42 : 16;
      ctx.fillStyle = pass === 2 ? grad : 'rgba(90,220,255,.35)';
      let cx = x;
      for (let i = 0; i < word.length; i++) {
        ctx.fillText(word[i], cx + widths[i] / 2, y);
        cx += widths[i] + spacing;
      }
      ctx.restore();
    }
    // underline
    const uy = y + size * 0.52;
    const lg = ctx.createLinearGradient(W / 2 - total / 2, 0, W / 2 + total / 2, 0);
    lg.addColorStop(0, 'rgba(99,244,255,0)');
    lg.addColorStop(0.5, 'rgba(99,244,255,.95)');
    lg.addColorStop(1, 'rgba(99,244,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(W / 2 - total / 2, uy, total, 2);
    ctx.shadowColor = 'rgba(99,244,255,.9)'; ctx.shadowBlur = 14;
    ctx.fillRect(W / 2 - total / 2, uy, total, 2);
    ctx.shadowBlur = 0;

    // kana
    ctx.font = `700 21px ui-sans-serif,system-ui,sans-serif`;
    ctx.fillStyle = 'rgba(190,230,255,.72)';
    ctx.fillText(lang === 'ja' ? 'ル ミ ナ' : 'N E O N   S U R V I V A L', W / 2, uy + 30);
  }

  /* ---------------------------------------------------------------- pilots */
  openChars() {
    this.show('chars');
    const list = $('charList');
    list.innerHTML = '';
    for (const c of CHARACTERS) {
      const unlocked = save.isUnlocked(c.id);
      const card = el('div', 'pcard' + (this.selChar === c.id ? ' sel' : '') + (unlocked ? '' : ' locked'));
      card.appendChild(iconCanvas(c.icon, 56));
      card.appendChild(el('h3', null, L(c.name)));
      card.appendChild(el('div', 'role', L(c.role)));
      const w = WEAPON_BY_ID[c.weapon];
      card.appendChild(el('div', 'wep', L(w.name)));
      const st = el('div', 'stats');
      st.innerHTML =
        `<i><span>${t('hpStat')}</span><b>${c.base.hp}</b></i>` +
        `<i><span>${t('spdStat')}</span><b>${c.base.spd}</b></i>` +
        `<i><span>${t('critStat')}</span><b>${Math.round(c.base.crit * 100)}%</b></i>` +
        `<i><span>${t('hasteStat')}</span><b>${c.base.haste >= 0 ? '+' : ''}${Math.round(c.base.haste * 100)}%</b></i>`;
      card.appendChild(st);
      card.appendChild(el('div', 'role', L(c.blurb)));
      if (!unlocked) {
        card.appendChild(el('div', 'lockmsg', c.feat
          ? (lang === 'ja' ? 'コアを撃破すると解放' : 'Unlocked by beating the Core')
          : `${c.cost} ${t('costShards')}`));
      }
      click(card, () => {
        if (unlocked) {
          this.selChar = c.id;
          save.data.chosen = c.id; save.flush();
          this.openChars();
        } else if (!c.feat && save.shards >= c.cost) {
          save.addShards(-c.cost);
          save.unlock(c.id);
          this.selChar = c.id;
          save.data.chosen = c.id; save.flush();
          sound.chest();
          this.openChars();
        } else {
          sound.ui(2);
          this.toast(t('needShards'));
        }
      });
      list.appendChild(card);
    }
  }

  /* ------------------------------------------------------------------ shop */
  openShop() {
    this.show('shop');
    $('shopShards').textContent = save.shards;
    const list = $('shopList');
    list.innerHTML = '';
    for (const m of META) {
      const lv = save.metaLevel(m.id);
      const maxed = lv >= m.max;
      const cost = maxed ? 0 : m.cost[lv];
      const card = el('div', 'mcard' + (maxed ? ' maxed' : ''));
      const top = el('div', 'mcard-top');
      top.appendChild(iconCanvas(m.icon, 26));
      top.appendChild(el('h4', null, L(m.name)));
      card.appendChild(top);
      card.appendChild(el('p', null, L(m.desc)));
      const pips = el('div', 'pips');
      for (let i = 0; i < m.max; i++) pips.appendChild(el('i', i < lv ? 'on' : ''));
      card.appendChild(pips);
      const afford = save.shards >= cost;
      const buy = el('button', 'buy ' + (maxed ? 'done' : afford ? '' : 'poor'),
        maxed ? t('maxed') : `${t('buy')} · ${cost}`);
      if (!maxed) {
        click(buy, () => {
          if (save.shards < cost) { sound.ui(2); this.toast(t('needShards')); return; }
          save.addShards(-cost);
          save.setMetaLevel(m.id, lv + 1);
          sound.levelUp();
          this.openShop();
        }, true);
      }
      card.appendChild(buy);
      list.appendChild(card);
    }
  }

  respec() {
    const back = spentTotal(save.data.meta);
    if (back <= 0) { sound.ui(2); return; }
    save.data.meta = {};
    save.addShards(back);
    sound.chest();
    this.openShop();
  }

  /* ----------------------------------------------------------------- codex */
  openCodex() {
    this.show('codex');
    const body = $('codexBody');
    body.innerHTML = '';
    const d = save.data;

    const stats = el('div', 'cx-sec');
    stats.appendChild(el('h3', null, t('stats')));
    const grid = el('div', 'cx-grid');
    const add = (label, val) => grid.appendChild(el('div', 'cx-stat', `${label}<b>${val}</b>`));
    add(t('best'), fmtTime(d.best.time));
    add(t('level'), d.best.level);
    add(t('kills'), fmtNum(d.best.kills));
    add(t('damage'), fmtNum(d.best.dmg));
    add(t('run'), d.runs);
    add(t('wins'), d.wins);
    add(t('totalShards'), save.shards);
    stats.appendChild(grid);
    body.appendChild(stats);

    const secW = el('div', 'cx-sec');
    secW.appendChild(el('h3', null, t('weapons')));
    const lw = el('div', 'cx-list');
    for (const w of WEAPONS) {
      const seen = d.seenWeapons.includes(w.id);
      const row = el('div', 'cx-row' + (seen ? '' : ' locked'));
      row.appendChild(iconCanvas(w.icon, 26));
      const tx = el('div', 't');
      tx.appendChild(el('h5', null, seen ? L(w.name) : '???'));
      tx.appendChild(el('p', null, seen ? L(w.desc) : '—'));
      const evo = EVOS.find((e) => e.evoOf === w.id);
      if (evo && seen) {
        const got = d.evolved.includes(evo.id);
        tx.appendChild(el('p', 'evo', got ? `★ ${L(evo.name)} — ${L(evo.desc)}`
          : `★ ${L(evo.name)} — Lv.MAX + ${L(PASSIVES.find((p) => p.id === w.evo.need).name)} Lv.4`));
      }
      row.appendChild(tx);
      lw.appendChild(row);
    }
    secW.appendChild(lw);
    body.appendChild(secW);

    const secP = el('div', 'cx-sec');
    secP.appendChild(el('h3', null, t('passives')));
    const lp = el('div', 'cx-list');
    for (const p of PASSIVES) {
      const row = el('div', 'cx-row');
      row.appendChild(iconCanvas(p.icon, 26));
      const tx = el('div', 't');
      tx.appendChild(el('h5', null, L(p.name)));
      tx.appendChild(el('p', null, L(p.desc)));
      row.appendChild(tx);
      lp.appendChild(row);
    }
    secP.appendChild(lp);
    body.appendChild(secP);

    const secE = el('div', 'cx-sec');
    secE.appendChild(el('h3', null, lang === 'ja' ? '敵性体' : 'BESTIARY'));
    const le = el('div', 'cx-list');
    for (const e of ENEMIES) {
      if (e.hidden) continue;
      const seen = d.seenEnemies.includes(e.id);
      const row = el('div', 'cx-row' + (seen ? '' : ' locked'));
      const cv = document.createElement('canvas');
      cv.width = cv.height = 26 * 2; cv.style.width = cv.style.height = '26px';
      const cx = cv.getContext('2d');
      cx.setTransform(2, 0, 0, 2, 0, 0);
      cx.translate(13, 13);
      cx.fillStyle = seen ? e.color : '#26303f';
      cx.beginPath();
      const n = e.spike < 1 ? e.sides * 2 : e.sides;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const rr = (e.spike < 1 && i & 1 ? e.spike : 1) * 10;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
      }
      cx.closePath(); cx.fill();
      row.appendChild(cv);
      const tx = el('div', 't');
      tx.appendChild(el('h5', null, seen ? L(e.name) : '???'));
      tx.appendChild(el('p', null, seen ? L(e.desc) : '—'));
      row.appendChild(tx);
      le.appendChild(row);
    }
    secE.appendChild(le);
    body.appendChild(secE);
  }

  /* --------------------------------------------------------------- options */
  openOptions() {
    this.show('options');
    const body = $('optionsBody');
    body.innerHTML = '';
    const o = save.opts;

    const row = (labelText, control, sub) => {
      const r = el('div', 'opt-row');
      const lab = el('label', null, labelText + (sub ? `<small>${sub}</small>` : ''));
      r.appendChild(lab);
      r.appendChild(control);
      body.appendChild(r);
      return r;
    };
    const seg = (opts, cur, on) => {
      const s = el('div', 'seg');
      for (const [val, label] of opts) {
        const b = el('button', val === cur ? 'on' : '', label);
        click(b, () => { on(val); });
        s.appendChild(b);
      }
      return s;
    };
    const slider = (val, on) => {
      const i = el('input');
      i.type = 'range'; i.min = 0; i.max = 100; i.value = Math.round(val * 100);
      i.addEventListener('input', () => on(+i.value / 100));
      i.addEventListener('change', () => sound.ui(0));
      return i;
    };

    row(t('lang'), seg([['ja', '日本語'], ['en', 'English']], lang, (v) => {
      setLang(v);
      this.openOptions();
      this.drawLogo();
    }));
    row(t('sfxVol'), slider(o.sfx, (v) => { save.setOpt('sfx', v); sound.setVolumes(v, save.opts.mus); }));
    row(t('musVol'), slider(o.mus, (v) => { save.setOpt('mus', v); sound.setVolumes(save.opts.sfx, v); }));
    row(t('haptics'), seg([[true, t('on')], [false, t('off')]], !!o.haptics, (v) => {
      save.setOpt('haptics', v); this.openOptions();
    }));
    row(t('quality'), seg([['auto', t('qAuto')], ['high', t('qHigh')], ['low', t('qLow')]], o.quality, (v) => {
      save.setOpt('quality', v);
      this.g.r.setQuality(v);
      this.openOptions();
    }), lang === 'ja' ? '動作が重いときは軽量に' : 'Drop to Lite if the frame rate dips');

    const how = el('div', 'about');
    how.innerHTML = `<h3 style="letter-spacing:.2em;font-size:11px;color:var(--cy);margin:18px 0 6px">${t('howTitle')}</h3>${t('how')}`;
    body.appendChild(how);

    const about = el('div', 'about', t('creditNote') + (save.ok ? '' : '<br><b>⚠︎ localStorage unavailable — progress will not persist.</b>'));
    body.appendChild(about);

    const dz = el('div', 'danger-zone');
    const rb = el('button', 'btn ghost', t('resetSave'));
    click(rb, () => {
      if (confirm(t('resetConfirm'))) {
        save.reset();
        location.reload();
      }
    });
    dz.appendChild(rb);
    body.appendChild(dz);
  }

  /* -------------------------------------------------------------- level up */
  openLevelUp() {
    const g = this.g;
    this.banish = false;
    const luckExtra = g.rng.f() < clamp(g.st.luck * 0.6, 0, 0.45) ? 1 : 0;
    this.choices = buildChoices(g, 3 + luckExtra);
    $('luTitle').textContent = `Lv.${g.level}`;
    this.renderBuildStrip($('luBuild'));
    this.renderChoices();
    this.show('levelup');
    sound.levelUp();
    if (navigator.vibrate && save.opts.haptics) navigator.vibrate(18);
  }

  /** Compact icon row of what you already have — the modal hides the HUD. */
  renderBuildStrip(host) {
    const g = this.g;
    host.innerHTML = '';
    const add = (def, lv, max, evo) => {
      const d = el('div', 'lo' + (lv >= max ? ' max' : '') + (evo ? ' evo' : ''));
      d.appendChild(iconCanvas(def.icon, 17));
      d.appendChild(el('em', null, evo ? '★' : String(lv)));
      d.title = L(def.name);
      host.appendChild(d);
    };
    for (const w of g.weapons) add(w.def, w.lv, w.def.max, !!w.def.evoOf);
    for (const p of g.passives) add(p.def, p.lv, p.def.max, false);
  }

  renderChoices() {
    const g = this.g;
    const box = $('luCards');
    box.innerHTML = '';
    for (const c of this.choices) {
      const info = cardInfo(g, c);
      const card = el('button', 'ucard r-' + info.rarity);
      const ic = el('div', 'ic');
      ic.appendChild(iconCanvas(info.icon, 34));
      card.appendChild(ic);
      const tx = el('div', 'tx');
      const h = el('h3', null, info.title);
      if (info.lvl) h.appendChild(el('span', 'lvl', info.lvl));
      if (info.tag) h.appendChild(el('span', 'tag ' + info.tag, info.tag === 'evo' ? t('evolveReady') : 'NEW'));
      tx.appendChild(h);
      tx.appendChild(el('p', null, info.sub));
      card.appendChild(tx);
      click(card, () => this.pick(c), true);
      box.appendChild(card);
    }
    $('rerollN').textContent = g.rerolls;
    $('banishN').textContent = g.banishes;
    $('btnReroll').disabled = g.rerolls <= 0;
    $('btnBanish').disabled = g.banishes <= 0;
    $('btnBanish').classList.toggle('primary', this.banish);
  }

  pick(c) {
    const g = this.g;
    if (this.banish) {
      this.banish = false;
      g.banishes--;
      g.banned.add(c.id);
      this.choices = buildChoices(g, this.choices.length);
      this.renderChoices();
      sound.ui(2);
      return;
    }
    sound.chest();
    applyChoice(g, c);
    this.closeLevelUp();
  }

  reroll() {
    const g = this.g;
    if (g.rerolls <= 0) return;
    g.rerolls--;
    this.choices = buildChoices(g, this.choices.length);
    this.renderChoices();
  }
  banishMode() {
    if (this.g.banishes <= 0) return;
    this.banish = !this.banish;
    $('btnBanish').classList.toggle('primary', this.banish);
    this.toast(this.banish ? (lang === 'ja' ? '除外するカードを選択' : 'Tap a card to banish') : '');
  }

  closeLevelUp() {
    this.close();
    this.api.afterModal();
  }

  /* ----------------------------------------------------------------- chest */
  openChest() {
    const g = this.g;
    const n = 1 + (g.rng.f() < 0.35 + g.st.luck * 0.5 ? 1 : 0) + (g.rng.f() < 0.12 + g.st.luck * 0.3 ? 1 : 0);
    const picks = [];
    for (let i = 0; i < n; i++) {
      const c = buildChoices(g, 1)[0];
      if (!c) break;
      applyChoice(g, c);
      picks.push(cardInfo(g, c));
    }
    $('chestTitle').textContent = n > 2 ? '★★★' : n > 1 ? '★★' : '★';
    const list = $('chestList');
    list.innerHTML = '';
    for (const info of picks) {
      const row = el('div', 'chest-row');
      row.appendChild(iconCanvas(info.icon, 28));
      row.appendChild(el('div', 't', info.title));
      row.appendChild(el('div', 'v', info.lvl || 'NEW'));
      list.appendChild(row);
    }
    this.show('chest');
  }
  closeChest() {
    this.close();
    this.api.afterModal();
  }

  /* ----------------------------------------------------------------- pause */
  openPause() {
    this.buildView($('pauseBuild'));
    this.show('pause');
  }

  buildView(host) {
    const g = this.g;
    host.innerHTML = '';
    const mk = (title, items) => {
      if (!items.length) return;
      const s = el('div', 'bv-sec');
      s.appendChild(el('h4', null, title));
      const box = el('div', 'bv-items');
      for (const it of items) {
        const d = el('div', 'bv-item' + (it.evo ? ' evo' : ''));
        d.appendChild(iconCanvas(it.icon, 20));
        d.appendChild(el('span', null, it.name));
        d.appendChild(el('em', null, it.lv));
        box.appendChild(d);
      }
      s.appendChild(box);
      host.appendChild(s);
    };
    mk(t('weapons'), g.weapons.map((w) => ({
      icon: w.def.icon, name: L(w.def.name), lv: w.def.evoOf ? '★' : `${w.lv}/${w.def.max}`, evo: !!w.def.evoOf,
    })));
    mk(t('passives'), g.passives.map((p) => ({
      icon: p.def.icon, name: L(p.def.name), lv: `${p.lv}/${p.def.max}`, evo: false,
    })));

    const st = g.st;
    let dps = 0;
    for (const w of g.weapons) dps += estimateDps(g, w);
    const s = el('div', 'bv-sec');
    s.appendChild(el('h4', null, t('stats')));
    const grid = el('div', 'bv-stats');
    const add = (k, v) => grid.appendChild(el('i', null, `<span>${k}</span><b>${v}</b>`));
    add(t('dps'), fmtNum(dps));
    add(t('hpStat'), Math.round(st.maxHp));
    add(t('armorStat'), st.armor.toFixed(0));
    add(t('spdStat'), Math.round(st.spd));
    add(t('critStat'), Math.round(st.crit * 100) + '%');
    add(t('hasteStat'), '+' + Math.round(st.haste * 100) + '%');
    add(t('areaStat'), '+' + Math.round(st.areaMul * 100) + '%');
    add(t('magnetStat'), Math.round(st.magnet));
    add(t('growth'), '+' + Math.round((st.xpMul - 1) * 100) + '%');
    add(t('regenStat'), st.regen.toFixed(1) + '/s');
    s.appendChild(grid);
    host.appendChild(s);
  }

  /* --------------------------------------------------------------- results */
  openResults(res) {
    const won = res.won;
    $('resTitle').textContent = won ? t('victory') : t('defeat');
    $('resTitle').classList.toggle('win', won);
    const box = $('resStats');
    box.innerHTML = '';
    const add = (label, val, cls) => {
      const d = el('div', 'rs ' + (cls || ''));
      d.appendChild(el('em', null, label));
      d.appendChild(el('b', null, val));
      box.appendChild(d);
    };
    add(t('time'), fmtTime(res.time), 'cy');
    add(t('level'), res.level);
    add(t('kills'), fmtNum(res.kills));
    add(t('damage'), fmtNum(res.dmg));
    add(t('shardsEarned'), '+' + res.shards, 'gold');
    this.buildView($('resBuild'));

    const un = $('resUnlocks');
    un.innerHTML = '';
    if (res.record) {
      const n = el('div', 'unlock-note');
      n.innerHTML = `<h4>${t('newRecord')}</h4>${t('time')} ${fmtTime(res.time)}`;
      un.appendChild(n);
    }
    for (const u of res.unlocks) {
      const n = el('div', 'unlock-note');
      n.innerHTML = `<h4>${t('unlockedTitle')}</h4>${u}`;
      un.appendChild(n);
    }
    this.show('results');
  }

  toast(msg) {
    if (!msg) return;
    this.hud.alert(msg, 'warn');
  }
}
