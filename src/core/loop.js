/**
 * Fixed-timestep loop with a scaled clock.
 * Logic always advances in exact 1/60 s steps (deterministic, stable physics),
 * while `timeScale` lets the game do hit-stop, slow-motion and pausing without
 * touching any system code.
 */
export const STEP = 1 / 60;
const MAX_STEPS = 5;              // never simulate more than this per frame

export class Loop {
  /**
   * @param {(dt:number)=>void} update  fixed-step logic
   * @param {(rt:number)=>void} draw    called once per animation frame
   */
  constructor(update, draw) {
    this.update = update;
    this.draw = draw;
    this.timeScale = 1;
    this.running = false;
    this.last = 0;
    this.acc = 0;
    this.frameMs = 16.7;
    this._tick = this._tick.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this._raf = requestAnimationFrame(this._tick);
  }
  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }
  _tick(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);
    let real = (now - this.last) / 1000;
    this.last = now;
    if (real > 0.25) real = STEP;           // returned from a background tab
    this.realDt = real;

    this.acc += real * this.timeScale;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;   // shed backlog instead of spiralling

    const t0 = performance.now();
    this.draw(real);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0 + (t0 - now)) * 0.1;
  }
}
