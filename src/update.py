# -*- coding: utf-8 -*-
"""최신 데이터 받기 → 빌드 5단계 → 변경 리포트

    python3 src/update.py             # 공식 가이드 + 나우칼 받기 → 빌드 → 리포트
    python3 src/update.py --offline   # 받지 않고 지금 있는 원본으로 빌드 → 리포트

받은 원본은 sources/ 에 저장되고, 빌드 스크립트는 sources/ 를 폴더 루트보다 우선해서 읽는다.
리포트는 콘솔과 `업데이트_리포트.md` 로 남는다.
"""
import json, os, re, subprocess, sys, time
from collections import OrderedDict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
OUT, SRC = BASE + 'data/', BASE + 'sources/'

SOURCES = [  # (저장 이름, 주소, 정상 응답에 반드시 있어야 하는 표식)
    ('weapons_full.txt', 'https://monsterhunternow.com/ko/weapons', 'component="SortableWeaponList"'),
    ('방어구페이지 응답.txt', 'https://monsterhunternow.com/ko/armor', 'component="SortableArmorList"'),
    ('스킬페이지 응답1.txt', 'https://monsterhunternow.com/ko/skills', 'component="SortableSkillList"'),
    ('나우칼 빌드에디터.txt', 'https://mhnowcalc.com/calc/build_editor.php?lang=ko', 'window.BUILD_EDITOR_BOOTSTRAP'),
]
STEPS = ['build_data', 'build_events', 'build_nowcalc', 'build_upcoming', 'build_mhnquest', 'build',
         'make_deploy']   # make_deploy: GitHub Pages 로 올릴 docs/ 폴더 갱신
MHNQ = 'https://mhn.quest/'        # 공식·나우칼에 없는 세트(신규 몬스터)를 채우는 커뮤니티 DB
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36',
           'Accept-Language': 'ko-KR,ko;q=0.9'}


def fetch(url):
    try:
        import requests
        r = requests.get(url, headers=HEADERS, timeout=90)
        r.raise_for_status(); r.encoding = 'utf-8'
        return r.text
    except ImportError:
        import urllib.request
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=90) as r:
            return r.read().decode('utf-8')


def download():
    os.makedirs(SRC, exist_ok=True)
    got = []
    for name, url, marker in SOURCES:
        t0 = time.time()
        try:
            text = fetch(url)
        except Exception as e:
            sys.exit(f'받기 실패: {url}\n  {e}\n  (네트워크 허용 목록에 도메인이 있는지 확인하세요 — 기존 원본은 그대로 둡니다)')
        if marker not in text:
            sys.exit(f'응답 형식이 달라졌습니다: {url} 에 "{marker}" 가 없습니다 ({len(text):,}자). 기존 원본은 그대로 둡니다.')
        got.append((name, text))
        print(f'  받음  {name:22s} {len(text.encode()):>11,} bytes  {time.time() - t0:4.1f}s  ← {url}')
    for name, text in got:                      # 전부 성공했을 때만 교체
        tmp = SRC + name + '.tmp'
        open(tmp, 'w', encoding='utf-8').write(text)
        os.replace(tmp, SRC + name)


def download_mhnquest():
    """mhn.quest 번들에서 데이터 모듈을 받아 sources/mhnquest/ 에 저장하고 JSON 으로 변환.
    주소에 빌드 해시가 붙어 있다. 첫 페이지에는 진입 스크립트만 있고 데이터 모듈 주소는
    그 스크립트 안에 들어 있어서, 첫 페이지 → /assets/*.js → 그 안의 data-*.js 순으로 찾는다.
    node 가 없으면 기존 JSON 을 그대로 쓴다."""
    import shutil, subprocess
    d = SRC + 'mhnquest/'
    os.makedirs(d, exist_ok=True)
    WANT = (('mhnq_data.js', r'data-[A-Za-z0-9_\-]+\.js'),
            ('mhnq_lang_ko.js', r'lang-ko-[A-Za-z0-9_\-]+\.js'))
    try:
        idx = fetch(MHNQ)
        # 찾을 곳: 첫 페이지 → 첫 페이지가 부르는 /assets/*.js (필요한 만큼만)
        texts = [idx]
        found = {}

        def scan():
            for name, pat in WANT:
                if name in found: continue
                for t in texts:
                    m = re.search(pat, t)
                    if m: found[name] = '/assets/' + m.group(0); break

        scan()
        if len(found) < len(WANT):
            entries = list(dict.fromkeys(re.findall(r'/assets/[A-Za-z0-9._\-]+\.js', idx)))
            for u in entries:
                if len(found) == len(WANT): break
                try:
                    texts.append(fetch(MHNQ.rstrip('/') + u))
                except Exception:
                    continue
                scan()
        missing = [n for n, _ in WANT if n not in found]
        if missing:
            print('  mhn.quest: %s 주소를 못 찾음 — 기존 데이터 유지 (사이트 구조가 바뀌었을 수 있습니다)'
                  % ', '.join(missing)); return
        got = {name: (found[name], fetch(MHNQ.rstrip('/') + found[name])) for name, _ in WANT}
        for name, (u, text) in got.items():
            open(d + name, 'w', encoding='utf-8').write(text)
            print(f'  받음  {name:22s} {len(text.encode()):>11,} bytes  ← {u}')
    except Exception as e:
        msg = str(e)
        if '403' in msg or 'Forbidden' in msg or 'connect_rejected' in msg:
            print('  mhn.quest 는 네트워크 허용 목록에 없어 건너뜁니다 — 기존 데이터를 그대로 씁니다.')
            print('  (공식·나우칼에 없는 세트를 새로 넣을 때만 필요합니다. 도메인을 허용 목록에 추가하면 자동으로 받습니다.)')
        else:
            print('  mhn.quest 받기 실패 — 기존 데이터 유지:', msg[:200])
        return
    if not shutil.which('node'):
        print('  node 가 없어 변환은 건너뜁니다 (기존 mhnquest.json 사용)'); return
    r = subprocess.run(['node', BASE + 'src/mhnquest_to_json.mjs'], capture_output=True, text=True, encoding='utf-8')
    print('  ' + (r.stdout.strip() or r.stderr.strip()))


def load(n):
    p = OUT + n + '.json'
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None


# ───────────────────────── 변경 리포트 ─────────────────────────
def report(old, new):
    SK = new['skills'] or {}
    sk = lambda k: (SK.get(k) or (old['skills'] or {}).get(k) or {}).get('name', k)
    lines = []
    add = lines.append

    def grp_add(bucket, key, cat):
        bucket.setdefault(key, []).append(cat)

    def gear_diff(o, n, kind):
        """장비 하나의 달라진 점 → 짧은 문장 목록"""
        out = []
        og, ng = {g['gr']: g for g in o['g']}, {g['gr']: g for g in n['g']}
        if set(og) != set(ng):
            out.append(f"등급 {min(og)}~{max(og)} → {min(ng)}~{max(ng)}")
        for gr in sorted(set(og) & set(ng)):
            a, b = dict(map(tuple, og[gr]['sk'])), dict(map(tuple, ng[gr]['sk']))
            if a != b:
                ch = [f"+{sk(k)} {v}" for k, v in b.items() if k not in a] \
                   + [f"−{sk(k)} {v}" for k, v in a.items() if k not in b] \
                   + [f"{sk(k)} {a[k]}→{v}" for k, v in b.items() if k in a and a[k] != v]
                out.append(f"G{gr} 스킬 " + ', '.join(ch))
            if kind == 'w' and og[gr]['lv'] != ng[gr]['lv']:
                x, y = og[gr]['lv'][4], ng[gr]['lv'][4]
                out.append(f"G{gr} Lv5 공/속/회 {x[0]}/{x[1]}/{x[2]} → {y[0]}/{y[1]}/{y[2]}")
            if kind == 'a':
                if og[gr]['slot'] != ng[gr]['slot']: out.append(f"G{gr} 표류석 {og[gr]['slot']}→{ng[gr]['slot']}칸")
                if og[gr]['def'] != ng[gr]['def']: out.append(f"G{gr} 방어 {og[gr]['def'][-1]}→{ng[gr]['def'][-1]}")
        if kind == 'w' and o.get('spec') != n.get('spec'): out.append('고유 정보 변경')
        # 여러 등급에 같은 변화 → "G8~G10 …" 한 줄로 합치기
        merged, seen = [], OrderedDict()
        for s in out:
            head, _, rest = s.partition(' ')
            if head[:1] == 'G' and head[1:].isdigit(): seen.setdefault(rest, []).append(int(head[1:]))
            else: merged.append(s)
        return [(f"G{g[0]}" if len(g) == 1 else f"G{g[0]}~G{g[-1]}") + ' ' + r for r, g in seen.items()] + merged

    def section(title, olds, news, kind, label, catkey):
        om, nm = {x['id']: x for x in olds}, {x['id']: x for x in news}
        added = [nm[i] for i in nm if i not in om]
        removed = [om[i] for i in om if i not in nm]
        changed = OrderedDict()
        for i in nm:
            if i in om and om[i] != nm[i]:
                d = gear_diff(om[i], nm[i], kind)
                if d: grp_add(changed, (nm[i]['series'], ' / '.join(d)), nm[i][catkey])
        add(f"\n## {title} — 추가 {len(added)} · 삭제 {len(removed)} · 변경 {sum(len(v) for v in changed.values())}")
        for tag, items in (('추가', added), ('삭제', removed)):
            bucket = OrderedDict()
            for x in items: grp_add(bucket, x['series'], label(x))
            for s, names in bucket.items(): add(f"- {tag} **{s}** — {', '.join(names)}")
        for (s, d), cats in changed.items():
            add(f"- 변경 **{s}** ({', '.join(cats)}) — {d}")

    add('# 데이터 업데이트 리포트')
    add(time.strftime('%Y-%m-%d %H:%M'))
    if not old['weapons']:
        add('\n이전 데이터가 없어 비교를 건너뜁니다.'); return '\n'.join(lines)

    section('무기', old['weapons'], new['weapons'], 'w', lambda x: f"{x['final']}({x['catName']})", 'catName')
    section('방어구', old['armor'], new['armor'], 'a', lambda x: x['catName'], 'catName')

    os_, ns_ = old['skills'] or {}, new['skills'] or {}
    sa = [k for k in ns_ if k not in os_]
    sr = [k for k in os_ if k not in ns_]
    sc = [k for k in ns_ if k in os_ and (os_[k]['levels'] != ns_[k]['levels'] or os_[k]['max'] != ns_[k]['max'] or os_[k]['name'] != ns_[k]['name'])]
    add(f"\n## 스킬 — 추가 {len(sa)} · 삭제 {len(sr)} · 변경 {len(sc)}")
    for k in sa: add(f"- 추가 **{ns_[k]['name']}** (최대 Lv{ns_[k]['max']})" + (' — 수치 미공개' if ns_[k].get('unknown') else ''))
    for k in sr: add(f"- 삭제 **{os_[k]['name']}**")
    for k in sc:
        o, n = os_[k], ns_[k]
        why = []
        if o['name'] != n['name']: why.append(f"이름 {o['name']}→{n['name']}")
        if o['max'] != n['max']: why.append(f"최대 Lv{o['max']}→{n['max']}")
        if o.get('unknown') and not n.get('unknown'): why.append('수치 공개됨')
        elif o['levels'] != n['levels']:
            oe = [l.get('eff') for l in o['levels']]; ne = [l.get('eff') for l in n['levels']]
            why.append(f"수치 {oe}→{ne}" if oe != ne else '설명 문구')
        add(f"- 변경 **{n['name']}** — {', '.join(why)}")

    om, nm = old['monsters'] or {}, new['monsters'] or {}
    ma = [v['name'] for k, v in nm.items() if k not in om]
    if ma: add(f"\n## 몬스터 추가 {len(ma)} — {', '.join(ma)}")
    ost, nst = old['styles'] or {'weapon': {}, 'profiles': {}}, new['styles'] or {'weapon': {}, 'profiles': {}}
    add(f"\n## 스타일 강화 — 연결 무기 {len(ost['weapon'])} → {len(nst['weapon'])} · 프로필 {len(ost['profiles'])} → {len(nst['profiles'])}")
    if ost['profiles'] != nst['profiles']:
        ch = [k for k in nst['profiles'] if ost['profiles'].get(k) != nst['profiles'][k]]
        if ch: add(f"- 수치가 바뀐 프로필: {', '.join(ch)}")
    if old.get('rates') != new.get('rates'): add('- 무기 종류별 발동률 변경됨')
    if old.get('driftstones') != new.get('driftstones'): add('- 표류석 색상/스킬 구성 변경됨')
    return '\n'.join(lines)


def main():
    offline = '--offline' in sys.argv
    names = ['weapons', 'armor', 'skills', 'monsters', 'styles', 'rates', 'driftstones']
    old = {n: load(n) for n in names}
    if offline: print('── 받기 건너뜀 (--offline)')
    else:
        print('── 최신 원본 받기'); download()
        print('── mhn.quest'); download_mhnquest()
    for st in STEPS:
        print(f'── {st}')
        r = subprocess.run([sys.executable, '-W', 'ignore', BASE + 'src/' + st + '.py'], capture_output=True, text=True, encoding='utf-8')
        print('   ' + (r.stdout.strip().replace('\n', '\n   ') or '(출력 없음)'))
        if r.returncode:
            print(r.stderr); sys.exit(f'{st} 실패 — 이후 단계 중단')
    new = {n: load(n) for n in names}
    rep = report(old, new)
    open(BASE + '업데이트_리포트.md', 'w', encoding='utf-8').write(rep + '\n')
    print('\n' + rep)


if __name__ == '__main__':
    main()
