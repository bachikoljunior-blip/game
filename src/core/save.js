/**
 * Persistent profile. localStorage may be unavailable (private mode / file://),
 * in which case everything still works for the session, just not across reloads.
 */
const KEY = 'lumina.save.v1';

const DEFAULTS = () => ({
  v: 1,
  shards: 0,
  meta: {},                 // metaUpgradeId -> level
  unlocked: ['lumina'],     // character ids
  chosen: 'lumina',
  best: { time: 0, kills: 0, level: 0, dmg: 0 },
  bestByChar: {},          // pilot id -> best survival time
  runs: 0,
  wins: 0,
  seenWeapons: [],
  seenEnemies: [],
  evolved: [],
  endlessUnlocked: false,
  opts: { lang: null, sfx: 0.8, mus: 0.5, haptics: true, quality: 'auto' },
});

/**
 * Merge stored data over the defaults, keeping the defaults' shape so a save
 * from an older build still loads.
 *
 * An empty object in the defaults means "free-form map" (meta upgrade levels,
 * per-pilot records): those keys are not known up front, so they are copied
 * across wholesale — walking the *defaults* alone would silently drop them.
 */
export function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  if (Object.keys(base).length === 0) {
    // Every free-form map in this save holds plain numeric/boolean values;
    // anything else is corrupt input and is dropped rather than trusted.
    for (const k in patch) {
      const v = patch[k];
      if ((typeof v === 'number' && isFinite(v)) || typeof v === 'boolean') base[k] = v;
    }
    return base;
  }
  for (const k in base) {
    if (!(k in patch)) continue;
    const b = base[k], p = patch[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = deepMerge(b, p);
    else if (Array.isArray(b)) base[k] = Array.isArray(p) ? p : b;
    else if (p !== null && p !== undefined && typeof p === typeof b) base[k] = p;
    else if (b === null) base[k] = p;
  }
  return base;
}

class Save {
  constructor() {
    this.data = DEFAULTS();
    this.ok = true;
    this._pending = false;
    this.load();
    this._bindLifecycle();
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) deepMerge(this.data, JSON.parse(raw));
    } catch (e) { this.ok = false; }
  }
  /** Debounced write — called from gameplay events. */
  flush() {
    if (this._pending) return;
    this._pending = true;
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => this.flushNow(), { timeout: 400 });
    else setTimeout(() => this.flushNow(), 120);
  }

  /** Immediate write. Used when the page may be about to go away. */
  flushNow() {
    this._pending = false;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { this.ok = false; }
  }

  /**
   * Mobile browsers discard backgrounded tabs without running unload handlers,
   * so commit on the last event we are actually guaranteed to see.
   */
  _bindLifecycle() {
    if (typeof document === 'undefined') return;
    const commit = () => { if (this._pending) this.flushNow(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) commit(); });
    window.addEventListener('pagehide', commit);
    window.addEventListener('blur', commit);
  }
  reset() {
    this.data = DEFAULTS();
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  get shards() { return this.data.shards; }
  addShards(n) { this.data.shards = Math.max(0, Math.round(this.data.shards + n)); this.flush(); }
  metaLevel(id) { return this.data.meta[id] | 0; }
  setMetaLevel(id, lv) { this.data.meta[id] = lv; this.flush(); }
  isUnlocked(id) { return this.data.unlocked.includes(id); }
  unlock(id) {
    if (this.isUnlocked(id)) return false;
    this.data.unlocked.push(id); this.flush(); return true;
  }
  see(list, id) {
    const arr = this.data[list];
    if (arr && !arr.includes(id)) { arr.push(id); this.flush(); }
  }
  get opts() { return this.data.opts; }
  setOpt(k, v) { this.data.opts[k] = v; this.flush(); }
}

export const save = new Save();
