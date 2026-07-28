/** Small math / misc helpers used everywhere. Keep allocation-free. */
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** Frame-rate independent exponential smoothing. `rate` = how fast (per second). */
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);

/** Shortest signed angle from a to b. */
export function angDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function angTo(a, b, max) {
  const d = angDelta(a, b);
  return a + clamp(d, -max, max);
}

export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Smoothstep 0..1 */
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;
export const easeOutBack = (t) => { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

/** mm:ss */
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = (sec / 60) | 0, s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
/** 12345 -> "12.3K" */
export function fmtNum(n) {
  n = Math.round(n);
  if (n < 1000) return '' + n;
  if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0) + 'K';
  return (n / 1e6).toFixed(1) + 'M';
}
export const pct = (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';

/** #rrggbb -> "r,g,b" (cached) */
const rgbCache = new Map();
export function rgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  v = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  rgbCache.set(hex, v);
  return v;
}
export const rgba = (hex, a) => `rgba(${rgb(hex)},${a})`;

/** Mix two hex colors, t in 0..1 -> css rgb string */
export function mix(h1, h2, t) {
  const a = rgb(h1).split(','), b = rgb(h2).split(',');
  return `rgb(${Math.round(lerp(+a[0], +b[0], t))},${Math.round(lerp(+a[1], +b[1], t))},${Math.round(lerp(+a[2], +b[2], t))})`;
}
