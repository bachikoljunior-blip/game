/**
 * In-run HUD. DOM based (crisp text, real accessibility) and diffed against
 * cached values so a frame that changes nothing touches no layout.
 */
import { fmtTime, clamp } from '../core/util.js';
import { iconCanvas } from './icons.js';
import { L, t } from '../core/i18n.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.hpFill = $('hpFill'); this.hpText = $('hpText');
    this.xpFill = $('xpFill'); this.xpText = $('xpText');
    this.clock = $('clock'); this.kills = $('kills'); this.shards = $('shards');
    this.loadout = $('loadout'); this.alerts = $('alerts');
    this.burst = $('btnBurst'); this.burstCd = $('burstCd');
    this.burstRing = this.burst.querySelector('.burst-ring circle');
    this.vig = $('vignette');
    this.flash = $('fxflash');
    this.cache = {};
    this.loadoutKey = '';

    this.bossWrap = document.createElement('div');
    this.bossWrap.className = 'bossbar hidden';
    this.bossWrap.innerHTML = '<span class="bn"></span><div class="bb"><i></i></div>';
    this.el.appendChild(this.bossWrap);
    this.bossFill = this.bossWrap.querySelector('.bb i');
    this.bossName = this.bossWrap.querySelector('.bn');
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    this.el.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (!on) { this.alerts.innerHTML = ''; this.bossWrap.classList.add('hidden'); }
  }

  update(g) {
    const c = this.cache;
    const hpK = clamp(g.p.hp / g.p.maxHp, 0, 1);
    if (Math.abs((c.hpK || 0) - hpK) > 0.001) {
      c.hpK = hpK;
      this.hpFill.style.transform = `scaleX(${hpK})`;
      this.hpText.textContent = `${Math.ceil(Math.max(0, g.p.hp))}/${Math.round(g.p.maxHp)}`;
      this.vig.classList.toggle('low', hpK < 0.3);
    }
    const xpK = clamp(g.xp / g.xpNeed, 0, 1);
    if (Math.abs((c.xpK || 0) - xpK) > 0.002) {
      c.xpK = xpK;
      this.xpFill.style.transform = `scaleX(${xpK})`;
    }
    if (c.lv !== g.level) { c.lv = g.level; this.xpText.textContent = `Lv.${g.level}`; }

    const sec = Math.floor(g.time);
    if (c.sec !== sec) { c.sec = sec; this.clock.textContent = fmtTime(g.time); }
    if (c.kills !== g.kills) { c.kills = g.kills; this.kills.textContent = g.kills; }
    const sh = Math.round(g.runShards);
    if (c.shards !== sh) { c.shards = sh; this.shards.textContent = sh; }

    // burst
    const cd = g.st.burstCd || 1;
    const k = clamp(1 - g.burstT / cd, 0, 1);
    if (Math.abs((c.burst || 0) - k) > 0.004) {
      c.burst = k;
      this.burstRing.style.strokeDashoffset = (126 * (1 - k)).toFixed(1);
      const ready = g.burstT <= 0;
      this.burst.classList.toggle('ready', ready);
      this.burst.classList.toggle('cooling', !ready);
      this.burstCd.textContent = ready ? '' : Math.ceil(g.burstT);
    }

    // loadout row
    let key = '';
    for (const w of g.weapons) key += w.def.id + w.lv + ',';
    for (const p of g.passives) key += p.def.id + p.lv + ',';
    if (key !== this.loadoutKey) {
      this.loadoutKey = key;
      this.renderLoadout(g);
    }

    // boss bar
    const b = g.bossRef;
    if (b && b.alive) {
      if (this.bossWrap.classList.contains('hidden')) {
        this.bossWrap.classList.remove('hidden');
        this.bossName.textContent = t('bossName');
      }
      this.bossFill.style.transform = `scaleX(${clamp(b.hp / b.maxHp, 0, 1)})`;
    } else if (!this.bossWrap.classList.contains('hidden')) {
      this.bossWrap.classList.add('hidden');
    }
  }

  renderLoadout(g) {
    const frag = document.createDocumentFragment();
    const add = (def, lv, maxed, evo) => {
      const d = document.createElement('div');
      d.className = 'lo' + (maxed ? ' max' : '') + (evo ? ' evo' : '');
      d.appendChild(iconCanvas(def.icon, 18));
      const em = document.createElement('em');
      em.textContent = evo ? '★' : lv;
      d.appendChild(em);
      d.title = L(def.name);
      frag.appendChild(d);
    };
    for (const w of g.weapons) add(w.def, w.lv, w.lv >= w.def.max, !!w.def.evoOf);
    for (const p of g.passives) add(p.def, p.lv, p.lv >= p.def.max, false);
    this.loadout.innerHTML = '';
    this.loadout.appendChild(frag);
  }

  alert(text, cls) {
    while (this.alerts.children.length >= 2) this.alerts.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'alert ' + (cls || '');
    d.textContent = text;
    this.alerts.appendChild(d);
    setTimeout(() => d.remove(), 2200);
  }

  hurtFlash() {
    this.vig.classList.add('hurt');
    setTimeout(() => this.vig.classList.remove('hurt'), 170);
  }
  whiteFlash(strength = 0.5) {
    this.flash.style.opacity = strength;
    this.flash.classList.add('on');
    requestAnimationFrame(() => {
      this.flash.classList.remove('on');
      this.flash.style.opacity = 0;
    });
  }
}
