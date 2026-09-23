/* 오프라인 캐시 — 버전이 바뀌면 옛 캐시를 지운다 */
const V = 'mhnow-55b869dc29';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
                './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== location.origin) return;        // 몬스터 아이콘 등 바깥 주소는 그대로
  e.respondWith(
    fetch(r).then(res => {
      const copy = res.clone();
      caches.open(V).then(c => c.put(r, copy));
      return res;
    }).catch(() => caches.match(r).then(m => m || caches.match('./index.html')))
  );
});
