/**
 * Unified input: floating virtual joystick (touch/mouse) + keyboard fallback.
 *
 * Touch model — thumb-friendly:
 *  - Press anywhere in the play area to plant a joystick at that point.
 *  - Drag: direction + magnitude (dead zone, then linear to max radius).
 *  - Past max radius the base follows the finger, so the stick never "runs out".
 *  - A second finger tapping the play area fires Burst (so the thumb never leaves the stick).
 */
const MAXR = 46;      // px at 1x css scale — stick travel for full speed
const DEAD = 5;

export class Input {
  constructor(el) {
    this.el = el;
    this.mx = 0; this.my = 0;      // move vector (-1..1, len<=1)
    this.mag = 0;                  // 0..1
    this.stick = { on: false, bx: 0, by: 0, tx: 0, ty: 0 }; // base + tip in css px
    this.burstQueued = false;
    this.onPause = null;
    this.enabled = false;
    this.keys = new Set();
    this._id = -1;
    this._bind();
  }

  _bind() {
    const el = this.el;
    const opt = { passive: false };
    el.addEventListener('pointerdown', (e) => this._down(e), opt);
    el.addEventListener('pointermove', (e) => this._move(e), opt);
    el.addEventListener('pointerup', (e) => this._up(e), opt);
    el.addEventListener('pointercancel', (e) => this._up(e), opt);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.release());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'p') { this.onPause && this.onPause(); e.preventDefault(); return; }
      if (k === ' ' || k === 'k' || k === 'j') { this.burstQueued = true; e.preventDefault(); return; }
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  /** Ignore presses that land on interactive HUD chrome. */
  _blocked(e) {
    const t = e.target;
    return !!(t && t.closest && t.closest('button,input,a,.sheet-body,#overlay .screen.show'));
  }

  _down(e) {
    if (!this.enabled || this._blocked(e)) return;
    e.preventDefault();
    if (this._id === -1) {
      this._id = e.pointerId;
      const s = this.stick;
      s.on = true; s.bx = e.clientX; s.by = e.clientY; s.tx = e.clientX; s.ty = e.clientY;
      this.mx = this.my = this.mag = 0;
    } else if (e.pointerId !== this._id) {
      this.burstQueued = true;   // second finger = burst
    }
  }

  _move(e) {
    if (e.pointerId !== this._id || !this.stick.on) return;
    e.preventDefault();
    const s = this.stick;
    s.tx = e.clientX; s.ty = e.clientY;
    let dx = s.tx - s.bx, dy = s.ty - s.by;
    const len = Math.hypot(dx, dy);
    if (len > MAXR) {                 // drag the base along
      const k = (len - MAXR) / len;
      s.bx += dx * k; s.by += dy * k;
      dx = s.tx - s.bx; dy = s.ty - s.by;
    }
    const l2 = Math.hypot(dx, dy);
    if (l2 <= DEAD) { this.mx = this.my = this.mag = 0; return; }
    const m = Math.min(1, (l2 - DEAD) / (MAXR - DEAD));
    this.mx = (dx / l2) * m; this.my = (dy / l2) * m; this.mag = m;
  }

  _up(e) {
    if (e.pointerId !== this._id) return;
    this.release();
  }

  release() {
    this._id = -1;
    this.stick.on = false;
    this.mx = this.my = this.mag = 0;
    this.keys.clear();
  }

  /** Call once per frame before using mx/my — folds keyboard into the same vector. */
  sample() {
    if (this.keys.size) {
      let kx = 0, ky = 0;
      const K = this.keys;
      if (K.has('a') || K.has('arrowleft')) kx -= 1;
      if (K.has('d') || K.has('arrowright')) kx += 1;
      if (K.has('w') || K.has('arrowup')) ky -= 1;
      if (K.has('s') || K.has('arrowdown')) ky += 1;
      if (kx || ky) {
        const l = Math.hypot(kx, ky);
        this.mx = kx / l; this.my = ky / l; this.mag = 1;
        return;
      }
      if (!this.stick.on) { this.mx = this.my = this.mag = 0; }
    }
  }

  takeBurst() {
    if (!this.burstQueued) return false;
    this.burstQueued = false;
    return true;
  }
}
