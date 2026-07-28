/**
 * Service worker: precache the whole game (it is only a few tens of KB) so it
 * launches instantly and plays with no network at all.
 * Strategy: cache-first for known assets, network-first for navigations with a
 * cached fallback, and a version bump wipes old caches.
 */
const VERSION = 'lumina-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-180.png',
  './src/main.js',
  './src/core/audio.js',
  './src/core/grid.js',
  './src/core/i18n.js',
  './src/core/input.js',
  './src/core/loop.js',
  './src/core/pool.js',
  './src/core/render.js',
  './src/core/rng.js',
  './src/core/save.js',
  './src/core/util.js',
  './src/data/characters.js',
  './src/data/enemies.js',
  './src/data/meta.js',
  './src/data/passives.js',
  './src/data/weapons.js',
  './src/game/boss.js',
  './src/game/enemies.js',
  './src/game/entities.js',
  './src/game/game.js',
  './src/game/particles.js',
  './src/game/upgrades.js',
  './src/game/waves.js',
  './src/ui/hud.js',
  './src/ui/icons.js',
  './src/ui/screens.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
