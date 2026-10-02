# -*- coding: utf-8 -*-
"""빌드된 단일 HTML → GitHub Pages 로 올릴 docs/ 폴더 만들기.

    python3 src/make_deploy.py

docs/ 안에 들어가는 것
    index.html              빌드 결과 + 폰용 메타(홈 화면 추가, 오프라인) 삽입본
    manifest.webmanifest    홈 화면에 추가했을 때의 이름·아이콘·색
    sw.js                   서비스 워커 — 한 번 열면 오프라인에서도 열린다
    icon-192.png / icon-512.png / apple-touch-icon.png
    .nojekyll               GitHub Pages 가 파일을 건드리지 않게
    (배포는 저장소 푸시로 — GitHub Pages: main / docs)

원본 `몬헌나우_장비세팅.html` 은 그대로 두고 복사본만 손댄다.
"""
import hashlib, os, re, shutil

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
SRC = BASE + '몬헌나우_장비세팅.html'
OUT = BASE + 'docs/'
NAME = '몬헌 나우 장비 세팅'
BG, FG = '#0e1116', '#f0a93b'

os.makedirs(OUT, exist_ok=True)
html = open(SRC, encoding='utf-8').read()
ver = hashlib.sha1(html.encode()).hexdigest()[:10]

# ── 아이콘 (단순 도형 — 어두운 타일 + 주황 육각형) ──────────
def icon(px):
    from PIL import Image, ImageDraw
    import math
    S = px * 4                                  # 4배로 그린 뒤 줄여서 계단 없애기
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    cx = cy = S / 2
    def hexagon(r, rot=math.pi / 6):
        return [(cx + r * math.cos(rot + i * math.pi / 3), cy + r * math.sin(rot + i * math.pi / 3))
                for i in range(6)]
    d.polygon(hexagon(S * 0.33), fill=FG)
    d.polygon(hexagon(S * 0.175), fill=BG)
    d.rectangle([cx - S * 0.045, cy - S * 0.30, cx + S * 0.045, cy + S * 0.30], fill=BG)
    return im.resize((px, px), Image.LANCZOS)

try:
    icon(192).save(OUT + 'icon-192.png')
    icon(512).save(OUT + 'icon-512.png')
    icon(180).save(OUT + 'apple-touch-icon.png')
    icons_ok = True
except Exception as e:
    print('  아이콘 생성 건너뜀 (Pillow 필요):', e)
    icons_ok = any(os.path.exists(OUT + n) for n in ('icon-192.png',))

open(OUT + 'manifest.webmanifest', 'w', encoding='utf-8').write(
    '{"name":"%s","short_name":"장비 세팅","start_url":"./","scope":"./","display":"standalone",'
    '"background_color":"%s","theme_color":"%s","lang":"ko",'
    '"icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png"},'
    '{"src":"icon-512.png","sizes":"512x512","type":"image/png"},'
    '{"src":"icon-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]}' % (NAME, BG, FG))

# ── 서비스 워커 — 페이지 자체는 네트워크 우선, 실패하면 캐시 ──
open(OUT + 'sw.js', 'w', encoding='utf-8').write("""/* 오프라인 캐시 — 버전이 바뀌면 옛 캐시를 지운다 */
const V = 'mhnow-%s';
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
""" % ver)

# ── index.html — 폰용 메타와 서비스 워커 등록만 끼워 넣는다 ──
head_add = f'''
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" href="icon-192.png">
<meta name="theme-color" content="{BG}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="장비 세팅">
<meta name="mobile-web-app-capable" content="yes">
<meta name="robots" content="noindex">
'''
assert '</head>' in html, 'HTML 에 </head> 가 없습니다'
page = html.replace('</head>', head_add + '</head>', 1)
sw_reg = '''<script>
/* 서비스 워커 — https 로 열었을 때만. 파일로 직접 열면 아무 일도 하지 않는다. */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>
</body>'''
assert '</body>' in page, 'HTML 에 </body> 가 없습니다'
page = page.replace('</body>', sw_reg, 1)
open(OUT + 'index.html', 'w', encoding='utf-8').write(page)

open(OUT + '.nojekyll', 'w').write('')
open(OUT + 'README.md', 'w', encoding='utf-8').write(
    f'# {NAME}\n\n'
    '몬스터 헌터 나우 장비 조합·딜 계산기입니다. 이 폴더는 **배포본**이라 손으로 고치지 않습니다 — '
    '`src/make_deploy.py` 가 만들어 냅니다.\n\n'
    '- 만드는 곳: 저장소 루트 (`python3 src/update.py` → 데이터 최신화 + 빌드 + 이 폴더 갱신)\n'
    '- 게임 데이터 출처: monsterhunternow.com 공식 가이드 · mhnowcalc.com · mhn.quest\n')


total = sum(os.path.getsize(OUT + f) for f in os.listdir(OUT) if os.path.isfile(OUT + f))
print(f'docs/ 준비 완료 — {len(os.listdir(OUT))}개 파일 · {total:,} bytes · 버전 {ver}'
      + ('' if icons_ok else ' (아이콘 없음)'))
