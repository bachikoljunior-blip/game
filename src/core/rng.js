/** Deterministic, fast PRNG (mulberry32). Seeded so runs are reproducible for tests. */
export class Rng {
  constructor(seed = 1) { this.seed(seed); }
  seed(s) { this.s = (s >>> 0) || 1; return this; }
  /** float in [0,1) */
  f() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** float in [a,b) */
  range(a, b) { return a + (b - a) * this.f(); }
  /** integer in [0,n) */
  int(n) { return (this.f() * n) | 0; }
  /** integer in [a,b] inclusive */
  ints(a, b) { return a + ((this.f() * (b - a + 1)) | 0); }
  bool(p = 0.5) { return this.f() < p; }
  sign() { return this.f() < 0.5 ? -1 : 1; }
  angle() { return this.f() * Math.PI * 2; }
  pick(arr) { return arr[(this.f() * arr.length) | 0]; }
  /** Weighted pick. weightOf(item) -> number. Returns null for empty/zero-weight input. */
  weighted(arr, weightOf) {
    let total = 0;
    for (let i = 0; i < arr.length; i++) total += Math.max(0, weightOf(arr[i]));
    if (total <= 0) return null;
    let r = this.f() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= Math.max(0, weightOf(arr[i]));
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
  /** Fisher-Yates, in place. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (this.f() * (i + 1)) | 0;
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  /** Sample `n` distinct items without mutating the source. */
  sample(arr, n) {
    const copy = arr.slice();
    this.shuffle(copy);
    return copy.slice(0, Math.min(n, copy.length));
  }
}

export const rand = new Rng((Math.random() * 0xffffffff) >>> 0);
