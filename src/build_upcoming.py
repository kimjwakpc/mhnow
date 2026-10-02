# -*- coding: utf-8 -*-
"""data/upcoming.json (패치 예정 몬스터) → weapons / armor / skills 에 합치기.

수치가 아직 공개되지 않은 신규 몬스터를 미리 넣어 장비 조합만 구상할 수 있게 한다.
공격력·속성값은 0 이며, 사이트에서 직접 입력할 수 있다.
정식 출시 후 공식 데이터에 들어오면 upcoming.json 에서 지우기만 하면 된다.
"""
import json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
OUT = BASE + 'data/'
UP = OUT + 'upcoming.json'
if not os.path.exists(UP):
    print('upcoming.json 없음 — 건너뜀'); raise SystemExit

U = json.load(open(UP, encoding='utf-8'))
W = json.load(open(OUT + 'weapons.json', encoding='utf-8'))
A = json.load(open(OUT + 'armor.json', encoding='utf-8'))
SK = json.load(open(OUT + 'skills.json', encoding='utf-8'))
MON = json.load(open(OUT + 'monsters.json', encoding='utf-8'))

# 재실행 안전 — 이전 결과 제거
W = [x for x in W if not x.get('pending')]
A = [x for x in A if not x.get('pending')]
MON = {k: v for k, v in MON.items() if not v.get('pending')}

WORDER = U['_무기종류키']
CATKEY = {'대검': 'GREAT_SWORD', '한손검': 'SWORD_SHIELD', '쌍검': 'DUAL_BLADES', '태도': 'LONG_SWORD',
          '해머': 'HAMMER', '수렵피리': 'HUNTING_HORN', '랜스': 'LANCE', '건랜스': 'GUNLANCE',
          '슬래시액스': 'SWITCH_AXE', '차지액스': 'CHARGE_BLADE', '조충곤': 'INSECT_GLAIVE',
          '활': 'BOW', '라이트보우건': 'LIGHT_BOWGUN', '헤비보우건': 'HEAVY_BOWGUN'}
PARTS = ['HEAD', 'CHEST', 'ARMS', 'TORSO', 'LEGS']
PARTNAME = {'HEAD': '머리', 'CHEST': '몸', 'ARMS': '팔', 'TORSO': '허리', 'LEGS': '다리'}
SSORT_BASE = 940000000          # 기존 세트 뒤, 이벤트 앞

# ── 미공개 스킬 보강 ──────────────────────────────────────
added_sk = []
for s in U.get('skills', []):
    if s['kind'] in SK: continue
    mx = s.get('max', 5)
    SK[s['kind']] = {'kind': s['kind'], 'id': -1, 'name': s['name'], 'cat': s.get('cat', 'OTHERS'),
                     'max': mx, 'unknown': True, 'pending': True, 'sort': 99800,
                     'levels': [{'lv': i, 'eff': [], 'cond': [], 'desc': '패치 예정 · 수치 미공개'}
                                for i in range(1, mx + 1)]}
    added_sk.append(s['name'])

new_w, new_a = [], []
for m in U.get('monsters', []):
    mid, series = m['id'], m['series']
    MON[mid] = {'id': mid, 'name': m['name'], 'weak': [], 'elem': [m.get('elem', 'no')],
                'species': 'UNKNOWN', 'minGrade': 5, 'habitat': [], 'icon': None,
                'sort': m.get('sort', 9000), 'pending': True}

    cats = WORDER if m.get('weapons') == 'ALL' else m['weapons']
    for c in cats:
        base = m['weaponSkills']
        sk = m.get('weaponSkillsByCat', {}).get(c, base)
        nm = f"{m['name']} {c}"
        new_w.append({
            'id': f'PENDING_{mid}_{CATKEY[c]}', 'cat': CATKEY[c], 'catName': c,
            'elem': m.get('weaponElem', 'no'), 'sid': 9400, 'skey': 'PENDING_' + mid,
            'series': series, 'mon': mid, 'icon': None,
            'ssort': SSORT_BASE + m.get('sort', 0), 'pending': True,
            'base': nm, 'final': nm, 'img': None,
            'skAll': sorted({x[0] for x in sk}),
            'g': [{'gr': 10, 'name': nm, 'lv': [[0, 0, 0]] * 5,
                   'sk': [list(x) for x in sk], 'sp': None}],
        })

    for p in PARTS:
        sk = m['armor'].get(p, [])
        new_a.append({
            'id': f'PENDING_{mid}_{p}', 'cat': p, 'catName': PARTNAME[p],
            'sid': 9400, 'skey': 'PENDING_' + mid, 'series': series,
            'mon': mid, 'icon': None, 'ssort': SSORT_BASE + m.get('sort', 0),
            'name': m['name'], 'event': False, 'pending': True,
            'skAll': sorted({x[0] for x in sk}),
            'g': [{'gr': 10, 'slot': 1, 'sk': [list(x) for x in sk], 'def': [197] * 5}],
        })

# ── 표류석 보정 ───────────────────────────────────────────
# 나우칼에 아직 안 올라온 신규 표류석 스킬을 색깔별로 끼워 넣는다 (올라오면 중복 없이 그대로 유지).
DR = OUT + 'driftstones.json'
drift_added = []
if U.get('driftstones') and os.path.exists(DR):
    D = json.load(open(DR, encoding='utf-8'))
    by_color = {x['color']: x for x in D}
    for color, kinds in U['driftstones'].items():
        if color.startswith('_'): continue
        row = by_color.get(color)
        if not row: print(f'   표류석 색 "{color}" 없음 — 건너뜀'); continue
        for k in kinds:
            if k in row['own'] or k in row['common']: continue
            if k not in SK: print(f'   표류석 스킬 {k} 가 skills.json 에 없음 — 건너뜀'); continue
            row['own'].append(k)
            drift_added.append(f"{color} {SK[k]['name']}")
    if drift_added:
        json.dump(D, open(DR, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

W += new_w
A += new_a
W.sort(key=lambda x: (WORDER.index(x['catName']), x['ssort'], x['series'], x['base']))
A.sort(key=lambda x: (bool(x.get('event')), x['ssort'], PARTS.index(x['cat'])))

for n, d in [('weapons', W), ('armor', A), ('skills', SK), ('monsters', MON)]:
    json.dump(d, open(OUT + n + '.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

print(f"예정 몬스터 {len(U.get('monsters', []))}종 → 무기 {len(new_w)} · 방어구 {len(new_a)} 추가")
for m in U.get('monsters', []):
    n = len(WORDER) if m.get('weapons') == 'ALL' else len(m['weapons'])
    print(f"   {m['name']:16s} {m['series']:14s} 무기 {n}종 · 방어구 5부위")
print('추가 스킬:', added_sk or '없음')
print('표류석 보정:', ', '.join(drift_added) or '없음')
