/**
 * Vector glyphs. Every icon in the game (cards, HUD, shop, pilots) is drawn
 * here — no image files anywhere.
 * Each glyph is authored in a -1..1 box and scaled to fit.
 */
import { TAU } from '../core/util.js';

const COLORS = {
  bolt: '#7fe8ff', orbit: '#63f4ff', nova: '#8affe0', lance: '#ffe98a', arc: '#a6d8ff',
  rang: '#ff9ad5', ember: '#ff7a4d', sentry: '#b6ff6b',
  power: '#ff8a8a', haste: '#ffd45c', area: '#8affe0', multishot: '#a6d8ff', swift: '#7dffb0',
  vitality: '#ff6b8a', armor: '#8fe8ff', magnet: '#63f4ff', insight: '#c7a2ff', focus: '#ffd45c',
  regen: '#7dffb0', luck: '#ffcf5c', overdrive: '#63f4ff',
  heart: '#ff6b8a', shard: '#63f4ff', reroll: '#c7a2ff', banish: '#ff6b8a',
  headstart: '#ffd45c', revive: '#7dffb0',
  c_lumina: '#63f4ff', c_nova: '#8affe0', c_sigma: '#ffe98a', c_echo: '#c7a2ff', c_vex: '#a6d8ff',
};

export const iconColor = (key) => COLORS[key] || '#eaf6ff';

function star(ctx, n, r1, r2, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const r = i & 1 ? r2 : r1;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
function poly(ctx, n, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
function chevron(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y - s * 0.6);
  ctx.lineTo(x + s * 0.45, y);
  ctx.lineTo(x - s * 0.5, y + s * 0.6);
  ctx.stroke();
}

/** Draw glyph `key` centred at (0,0) with radius ~1 in the current transform. */
export function glyph(ctx, key, color) {
  const c = color || iconColor(key);
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = 0.17;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (key) {
    /* ---------------- weapons ---------------- */
    case 'bolt':
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 1 - i * 0.28;
        chevron(ctx, -0.45 + i * 0.45, 0, 0.85);
      }
      ctx.globalAlpha = 1;
      break;
    case 'orbit':
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 0.9, 0.55, 0.5, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, 0.24, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5;
        ctx.save();
        ctx.translate(Math.cos(a) * 0.9 * 0.86, Math.sin(a) * 0.72);
        ctx.beginPath(); ctx.arc(0, 0, 0.17, 0, TAU); ctx.fill();
        ctx.restore();
      }
      break;
    case 'nova':
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 1 - i * 0.26;
        ctx.beginPath(); ctx.arc(0, 0, 0.3 + i * 0.31, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, 0.16, 0, TAU); ctx.fill();
      break;
    case 'lance':
      ctx.beginPath();
      ctx.moveTo(0.95, -0.35); ctx.lineTo(-0.25, 0.35); ctx.lineTo(-0.5, 0.15);
      ctx.lineTo(0.62, -0.62); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.45, 0.3); ctx.lineTo(-0.9, 0.85); ctx.stroke();
      break;
    case 'arc':
      ctx.beginPath();
      ctx.moveTo(0.2, -0.95); ctx.lineTo(-0.5, 0.05); ctx.lineTo(0.02, 0.05);
      ctx.lineTo(-0.2, 0.95); ctx.lineTo(0.55, -0.15); ctx.lineTo(0.02, -0.15);
      ctx.closePath(); ctx.fill();
      break;
    case 'rang':
      ctx.lineWidth = 0.26;
      ctx.beginPath(); ctx.arc(0, 0, 0.72, -2.5, 0.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.72, 0.9, 3.4); ctx.stroke();
      break;
    case 'ember':
      ctx.beginPath();
      ctx.moveTo(0, -0.95);
      ctx.bezierCurveTo(0.62, -0.3, 0.72, 0.3, 0.28, 0.72);
      ctx.bezierCurveTo(0.4, 0.2, 0.05, 0.1, 0.06, -0.2);
      ctx.bezierCurveTo(-0.1, 0.1, -0.5, 0.15, -0.36, 0.62);
      ctx.bezierCurveTo(-0.8, 0.15, -0.5, -0.4, 0, -0.95);
      ctx.fill();
      break;
    case 'sentry':
      poly(ctx, 6, 0.62, 0.52); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 0.72, Math.sin(a) * 0.72);
        ctx.lineTo(Math.cos(a) * 0.98, Math.sin(a) * 0.98);
        ctx.stroke();
      }
      break;

    /* ---------------- passives ---------------- */
    case 'power':
      ctx.beginPath();
      ctx.moveTo(0.18, -0.95); ctx.lineTo(-0.55, 0.1); ctx.lineTo(-0.05, 0.1);
      ctx.lineTo(-0.18, 0.95); ctx.lineTo(0.58, -0.15); ctx.lineTo(0.06, -0.15);
      ctx.closePath(); ctx.fill();
      break;
    case 'haste':
      for (let i = 0; i < 2; i++) chevron(ctx, -0.3 + i * 0.55, 0, 0.95);
      break;
    case 'area':
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.78;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 0.52, Math.sin(a) * 0.52);
        ctx.lineTo(Math.cos(a) * 0.82, Math.sin(a) * 0.82);
        ctx.stroke();
      }
      break;
    case 'multishot':
      for (let i = -1; i <= 1; i++) {
        ctx.save();
        ctx.rotate(i * 0.42);
        ctx.beginPath(); ctx.moveTo(-0.75, 0); ctx.lineTo(0.5, 0); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0.9, 0); ctx.lineTo(0.42, -0.26); ctx.lineTo(0.42, 0.26);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    case 'swift':
      ctx.beginPath();
      ctx.moveTo(0.85, -0.6); ctx.lineTo(-0.1, -0.6); ctx.moveTo(0.85, 0); ctx.lineTo(-0.55, 0);
      ctx.moveTo(0.85, 0.6); ctx.lineTo(-0.25, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.85, -0.62); ctx.lineTo(-0.45, -0.62);
      ctx.stroke();
      break;
    case 'vitality':
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, 0.82);
      ctx.bezierCurveTo(-1.45, -0.25, -0.55, -1.1, 0, -0.32);
      ctx.bezierCurveTo(0.55, -1.1, 1.45, -0.25, 0, 0.82);
      ctx.fill();
      break;
    case 'armor':
      ctx.beginPath();
      ctx.moveTo(0, -0.92);
      ctx.lineTo(0.78, -0.55); ctx.lineTo(0.72, 0.28);
      ctx.quadraticCurveTo(0.5, 0.85, 0, 0.98);
      ctx.quadraticCurveTo(-0.5, 0.85, -0.72, 0.28);
      ctx.lineTo(-0.78, -0.55);
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
      break;
    case 'magnet':
      ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.arc(0, 0.12, 0.62, Math.PI, 0); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.62, 0.12); ctx.lineTo(-0.62, 0.72);
      ctx.moveTo(0.62, 0.12); ctx.lineTo(0.62, 0.72);
      ctx.stroke();
      break;
    case 'insight':
      star(ctx, 4, 0.98, 0.3, -Math.PI / 2); ctx.fill();
      break;
    case 'focus':
      ctx.beginPath(); ctx.arc(0, 0, 0.62, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -0.98); ctx.lineTo(0, -0.72);
      ctx.moveTo(0, 0.98); ctx.lineTo(0, 0.72);
      ctx.moveTo(-0.98, 0); ctx.lineTo(-0.72, 0);
      ctx.moveTo(0.98, 0); ctx.lineTo(0.72, 0);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.18, 0, TAU); ctx.fill();
      break;
    case 'regen':
      ctx.beginPath(); ctx.arc(0, 0, 0.68, 0.6, 5.4); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.62, 0.05); ctx.lineTo(0.42, 0.6); ctx.lineTo(0.95, 0.5);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.28, 0); ctx.lineTo(0.28, 0); ctx.moveTo(0, -0.28); ctx.lineTo(0, 0.28);
      ctx.lineWidth = 0.2; ctx.stroke();
      break;
    case 'luck':
      star(ctx, 5, 0.98, 0.42, -Math.PI / 2); ctx.fill();
      break;
    case 'overdrive':
      star(ctx, 8, 0.98, 0.34, 0);
      ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, 0.2, 0, TAU);
      ctx.fillStyle = '#04070f'; ctx.fill();
      break;

    /* ---------------- misc ---------------- */
    case 'shard':
      star(ctx, 3, 0.92, 0.34, -Math.PI / 2); ctx.fill();
      break;
    case 'reroll':
      ctx.beginPath(); ctx.arc(0, 0, 0.66, 0.9, 5.6); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.28, -0.72); ctx.lineTo(0.86, -0.5); ctx.lineTo(0.36, -0.02);
      ctx.closePath(); ctx.fill();
      break;
    case 'banish':
      ctx.beginPath(); ctx.arc(0, 0, 0.78, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.5, -0.5); ctx.lineTo(0.5, 0.5);
      ctx.stroke();
      break;
    case 'headstart':
      ctx.beginPath();
      ctx.moveTo(-0.7, 0.8); ctx.lineTo(-0.7, -0.85); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.62, -0.8); ctx.lineTo(0.8, -0.42); ctx.lineTo(-0.62, -0.02);
      ctx.closePath(); ctx.fill();
      break;
    case 'revive':
      ctx.beginPath(); ctx.arc(0, 0, 0.62, 0, TAU); ctx.stroke();
      ctx.lineWidth = 0.26;
      ctx.beginPath();
      ctx.moveTo(-0.34, 0); ctx.lineTo(0.34, 0);
      ctx.moveTo(0, -0.34); ctx.lineTo(0, 0.34);
      ctx.stroke();
      break;

    /* ---------------- pilots ---------------- */
    case 'c_lumina':
      ship(ctx, c, 0);
      break;
    case 'c_nova':
      ship(ctx, c, 1);
      break;
    case 'c_sigma':
      ship(ctx, c, 2);
      break;
    case 'c_echo':
      ship(ctx, c, 3);
      break;
    case 'c_vex':
      ship(ctx, c, 4);
      break;
    default:
      poly(ctx, 6, 0.8, 0); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function ship(ctx, c, variant) {
  ctx.save();
  ctx.rotate(-Math.PI / 2);
  ctx.lineWidth = 0.13;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + variant;
    ctx.beginPath(); ctx.arc(0, 0, 0.95, a, a + 1.2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  switch (variant) {
    case 1:  // bulwark: wide hexagonal nose
      ctx.moveTo(0.72, 0); ctx.lineTo(0.16, 0.62); ctx.lineTo(-0.6, 0.46);
      ctx.lineTo(-0.36, 0); ctx.lineTo(-0.6, -0.46); ctx.lineTo(0.16, -0.62);
      break;
    case 2:  // glass cannon: long dart
      ctx.moveTo(0.95, 0); ctx.lineTo(-0.5, 0.38); ctx.lineTo(-0.26, 0); ctx.lineTo(-0.5, -0.38);
      break;
    case 3:  // harvester: rounded scoop
      ctx.moveTo(0.66, 0); ctx.lineTo(0.1, 0.66); ctx.lineTo(-0.55, 0.34);
      ctx.lineTo(-0.2, 0); ctx.lineTo(-0.55, -0.34); ctx.lineTo(0.1, -0.66);
      break;
    case 4:  // conduit: forked
      ctx.moveTo(0.8, 0); ctx.lineTo(0.05, 0.5); ctx.lineTo(-0.55, 0.66);
      ctx.lineTo(-0.28, 0); ctx.lineTo(-0.55, -0.66); ctx.lineTo(0.05, -0.5);
      break;
    default: // balanced
      ctx.moveTo(0.82, 0); ctx.lineTo(-0.45, 0.56); ctx.lineTo(-0.22, 0); ctx.lineTo(-0.45, -0.56);
  }
  ctx.closePath();
  ctx.fillStyle = '#eafcff';
  ctx.fill();
  ctx.strokeStyle = c;
  ctx.lineWidth = 0.1;
  ctx.stroke();
  ctx.restore();
}

/** Render an icon into a fresh canvas element sized for the DOM. */
export function iconCanvas(key, size, color) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
  cv.style.width = size + 'px'; cv.style.height = size + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(size / 2, size / 2);
  ctx.scale(size * 0.44, size * 0.44);
  glyph(ctx, key, color);
  return cv;
}
