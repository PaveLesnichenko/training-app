// Офлайн-кэш: оболочка приложения кэшируется при установке, дальше сеть только для обновлений.
const VERSION = 'v15';
const CACHE = `training-${VERSION}`;
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'src/app.js', 'src/router.js', 'src/ui.js', 'src/store.js', 'src/engine.js', 'src/exercises.js', 'src/session.js', 'src/nutrition.js', 'src/art.js', 'src/controls.js', 'src/ai.js', 'src/report.js',
  'src/data/program.js', 'src/data/tables.js', 'src/data/foods.js', 'src/data/notes.js',
  'src/pages/today.js', 'src/pages/plan.js', 'src/pages/day.js', 'src/pages/pm.js', 'src/pages/food.js', 'src/pages/weight.js', 'src/pages/more.js', 'src/pages/ai.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// stale-while-revalidate: сразу отдаём кэш, в фоне обновляем его для следующего запуска
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
