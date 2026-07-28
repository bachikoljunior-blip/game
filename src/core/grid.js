/**
 * Uniform spatial hash for broad-phase queries on an unbounded plane.
 * Rebuilt every frame: clear() -> insert() xN -> query().
 * Cell buckets are reused between frames so steady-state allocation is zero.
 */
export class SpatialGrid {
  constructor(cellSize = 56) {
    this.cs = cellSize;
    this.inv = 1 / cellSize;
    this.cells = new Map();   // key -> array of entities
    this.used = [];           // buckets touched this frame
  }
  key(cx, cy) { return (cx + 0x8000) * 0x10000 + (cy + 0x8000); }

  clear() {
    const u = this.used;
    for (let i = 0; i < u.length; i++) u[i].length = 0;
    u.length = 0;
  }

  insert(e) {
    const cx = Math.floor(e.x * this.inv), cy = Math.floor(e.y * this.inv);
    const k = this.key(cx, cy);
    let b = this.cells.get(k);
    if (b === undefined) { b = []; this.cells.set(k, b); }
    if (b.length === 0) this.used.push(b);
    b.push(e);
  }

  /**
   * Visit every entity whose cell overlaps the circle (x,y,r).
   * Callback receives candidates — do the exact distance test yourself.
   */
  query(x, y, r, fn) {
    const inv = this.inv;
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.cells.get(this.key(cx, cy));
        if (b === undefined || b.length === 0) continue;
        for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }

  /**
   * Nearest entity to (x,y) within maxR, expanding ring by ring so we can stop early.
   * `filter` is optional: (e) => boolean.
   */
  nearest(x, y, maxR, filter) {
    const inv = this.inv, cs = this.cs;
    const ccx = Math.floor(x * inv), ccy = Math.floor(y * inv);
    const rings = Math.max(1, Math.ceil(maxR * inv));
    let best = null, bestD = maxR * maxR;
    for (let ring = 0; ring <= rings; ring++) {
      // Once the closest possible entity in this ring is farther than our best, stop.
      if (best && (ring - 1) * cs * ((ring - 1) * cs) > bestD) break;
      const x0 = ccx - ring, x1 = ccx + ring, y0 = ccy - ring, y1 = ccy + ring;
      for (let cy = y0; cy <= y1; cy++) {
        const edgeRow = cy === y0 || cy === y1;
        for (let cx = x0; cx <= x1; cx++) {
          if (!edgeRow && cx !== x0 && cx !== x1) continue; // interior already scanned
          const b = this.cells.get(this.key(cx, cy));
          if (b === undefined || b.length === 0) continue;
          for (let i = 0; i < b.length; i++) {
            const e = b[i];
            if (filter !== undefined && !filter(e)) continue;
            const dx = e.x - x, dy = e.y - y;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = e; }
          }
        }
      }
    }
    return best;
  }

  /** Up to `n` nearest entities (unsorted beyond the cap). Allocates a small array. */
  nearestMany(x, y, maxR, n, filter, out) {
    out = out || [];
    out.length = 0;
    const found = [];
    this.query(x, y, maxR, (e) => {
      if (filter !== undefined && !filter(e)) return;
      const dx = e.x - x, dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d <= maxR * maxR) found.push(e, d);
    });
    // simple selection of n smallest over flat [entity, dist] pairs
    const cnt = found.length >> 1;
    const take = Math.min(n, cnt);
    for (let k = 0; k < take; k++) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < found.length; i += 2) {
        if (found[i] === null) continue;
        if (found[i + 1] < bd) { bd = found[i + 1]; bi = i; }
      }
      if (bi < 0) break;
      out.push(found[bi]);
      found[bi] = null;
    }
    return out;
  }
}
