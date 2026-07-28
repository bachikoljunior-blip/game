/**
 * Object pool with a dense `live` array.
 * Entities are plain objects reused forever — no GC churn in the hot loop.
 * Mark `o.alive = false` during update, then call `sweep()` once per frame.
 */
export class Pool {
  /** @param {() => object} factory */
  constructor(factory, prealloc = 0) {
    this.factory = factory;
    this.live = [];
    this.free = [];
    for (let i = 0; i < prealloc; i++) this.free.push(factory());
  }
  get count() { return this.live.length; }
  spawn() {
    const o = this.free.length ? this.free.pop() : this.factory();
    o.alive = true;
    this.live.push(o);
    return o;
  }
  /** Compacts the live array (swap-remove) and recycles dead entities. */
  sweep() {
    const L = this.live;
    for (let i = L.length - 1; i >= 0; i--) {
      const o = L[i];
      if (!o.alive) {
        L[i] = L[L.length - 1];
        L.pop();
        this.free.push(o);
      }
    }
  }
  clear() {
    const L = this.live;
    for (let i = 0; i < L.length; i++) { L[i].alive = false; this.free.push(L[i]); }
    L.length = 0;
  }
  /** Drop the oldest `n` live entities (used to cap particle counts). */
  trim(max) {
    const L = this.live;
    if (L.length <= max) return;
    const over = L.length - max;
    for (let i = 0; i < over; i++) L[i].alive = false;
  }
}
