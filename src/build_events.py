# -*- coding: utf-8 -*-
"""나우칼 빌드 에디터 응답 → 공식 가이드에 없는 이벤트 무기를 weapons.json 에 추가.

공식 몬헌 나우 가이드는 이벤트 무기를 싣지 않아서 나우칼 데이터로 보강한다.
나우칼은 최대 등급 Lv5 스탯만 주므로 Lv1~4 는 공식 무기에서 뽑은 레벨 배율로 역산한다.
"""
import glob, json, os, re, unicodedata

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
OUT = BASE + 'data/'

_cands = sorted(glob.glob(BASE + 'sources/나우칼*.txt') + glob.glob(BASE + '나우칼*.txt'), key=os.path.getmtime, reverse=True)
SRC = next((f for f in _cands if 'BUILD_EDITOR_BOOTSTRAP' in open(f, encoding='utf-8').read(200000)), _cands[0])
print('소스:', os.path.basename(SRC))

s = open(SRC, encoding='utf-8').read()
i = s.index('window.BUILD_EDITOR_BOOTSTRAP'); st = s.index('{', i); d = 0
for n, ch in enumerate(s[st:], st):
    if ch == '{': d += 1
    elif ch == '}':
        d -= 1
        if d == 0: en = n + 1; break
B = json.loads(s[st:en])

W = json.load(open(OUT + 'weapons.json', encoding='utf-8'))
SK = json.load(open(OUT + 'skills.json', encoding='utf-8'))
MON = json.load(open(OUT + 'monsters.json', encoding='utf-8'))

W = [w for w in W if not w.get('event')]        # 이전 실행분 제거 (재실행 안전)

TYPE = {'SwordAndShield': 'SWORD_SHIELD', 'DualBlades': 'DUAL_BLADES', 'GreatSword': 'GREAT_SWORD',
        'LongSword': 'LONG_SWORD', 'Hammer': 'HAMMER', 'HuntingHorn': 'HUNTING_HORN',
        'Lance': 'LANCE', 'Gunlance': 'GUNLANCE', 'SwitchAxe': 'SWITCH_AXE',
        'ChargeBlade': 'CHARGE_BLADE', 'LightBowgun': 'LIGHT_BOWGUN', 'HeavyBowgun': 'HEAVY_BOWGUN',
        'Bow': 'BOW', 'InsectGlaive': 'INSECT_GLAIVE'}
CATNAME = {'GREAT_SWORD': '대검', 'SWORD_SHIELD': '한손검', 'DUAL_BLADES': '쌍검', 'LONG_SWORD': '태도',
           'HAMMER': '해머', 'HUNTING_HORN': '수렵피리', 'LANCE': '랜스', 'GUNLANCE': '건랜스',
           'SWITCH_AXE': '슬래시액스', 'CHARGE_BLADE': '차지액스', 'INSECT_GLAIVE': '조충곤',
           'BOW': '활', 'HEAVY_BOWGUN': '헤비보우건', 'LIGHT_BOWGUN': '라이트보우건'}
ELEM = {'None': 'no', 'Fire': 'fire', 'Water': 'water', 'Thunder': 'thunder', 'Ice': 'ice',
        'Dragon': 'dragon', 'Poison': 'poison', 'Paralysis': 'paralysis', 'Sleep': 'sleep', 'Blast': 'blast'}
STATUS = {'poison', 'paralysis', 'sleep', 'blast'}

# 공식 무기에서 뽑은 등급 내 Lv1~5 배율
R_ATK = [0.8347, 0.8760, 0.9174, 0.9587, 1.0]
R_ELE = [0.8046, 0.8532, 0.9020, 0.9512, 1.0]
R_STA = [0.9612, 0.9709, 0.9806, 0.9903, 1.0]   # 상태이상 축적치

norm = lambda x: re.sub(r'[\s\[\]【】［］·・\-+]', '', unicodedata.normalize('NFKC', str(x)))
n2k = {norm(v['name']): k for k, v in SK.items()}

# ── 기존 무기 색인 ────────────────────────────────────────
# 이벤트 무기는 일반 무기와 스탯이 겹치는 경우가 많아 "이름"으로만 중복 판정한다.
by_name = {norm(w['final']) for w in W} | {norm(w['base']) for w in W} \
        | {norm(g['name']) for w in W for g in w['g']}
by_name.discard('')
# 새 장비는 나우칼에 한국어 이름이 한동안 비어 있어 이름만으로는 중복을 못 잡는다.
# → "시리즈 이름 + 무기 종류" 로도 본다. (공식 시리즈 '브라키 세트' ↔ 나우칼 '브라키')
by_series_cat = {(norm(re.sub(r'세트$', '', w['series'])), w['cat']) for w in W}

# ── 시리즈 한글명 ────────────────────────────────────────
series_ko = {}
for x in B['equipCatalog']:
    series_ko.setdefault(x['series_key'], x.get('series_name_ko') or x['series_key'])
SERIES_FIX = {'Carnival2024': '카니발 2024', 'MrBeast': 'Mr.Beast', 'Summer2026': '여름 축제 2026'}

# 시리즈 ↔ 몬스터(아이콘) 연결
norm_m = {re.sub(r'[^a-z]', '', k.lower()): k for k in MON}
def monster_of(series_key):
    return norm_m.get(re.sub(r'[^a-z]', '', series_key.lower()))

new_skills, events, skipped = {}, [], 0
for v in B['equipDetails'].values():
    if v['category'] != 'Weapon': continue
    cat = TYPE.get(v['weapon_type'])
    if not cat: continue
    # 한국어 이름이 아직 없으면 영어 → 일본어 순으로 대체한다 (새 장비는 번역이 늦게 붙는다)
    nm = next((v.get(k) or '' for k in ('equip_name_ko', 'equip_name_en', 'equip_name_ja') if (v.get(k) or '').strip()), '')
    skey0 = v['series_key']
    ser_ko = (SERIES_FIX.get(skey0) or series_ko.get(skey0) or skey0)
    if norm(nm) in by_name or (norm(ser_ko), cat) in by_series_cat:
        skipped += 1; continue

    elem = ELEM.get(v['element_type'], 'no')
    rele = R_STA if elem in STATUS else R_ELE
    atk, ele, crit = v['attack'], v['element_value'], v['affinity']
    levels = [[round(atk * R_ATK[i]), round(ele * rele[i]) if ele else 0, crit] for i in range(5)]

    sk = []
    for x in v.get('skills', []):
        k = n2k.get(norm(x['skill_name_ko']))
        if not k:                                    # 공식 스킬 목록에 없는 이벤트 전용 스킬
            k = 'EVENT_' + re.sub(r'[^A-Za-z0-9]', '', x.get('skill_name_en') or '') .upper()
            if not k.strip('EVENT_'): k = 'EVENT_' + str(abs(hash(x['skill_name_ko'])) % 99999)
            new_skills.setdefault(k, {'kind': k, 'id': -1, 'name': x['skill_name_ko'], 'cat': 'OTHERS',
                                      'max': x.get('max_level', 5) or 5, 'unknown': True, 'sort': 99900,
                                      'levels': [{'lv': i, 'eff': [], 'cond': [], 'desc': '이벤트 전용 스킬 · 수치 미공개'}
                                                 for i in range(1, (x.get('max_level', 5) or 5) + 1)]})
        sk.append([k, x.get('skill_level', 1) or 1])

    skey = v['series_key']
    mk = monster_of(skey)
    events.append({
        'id': 'EVENTW_' + v['equip_key'], 'cat': cat, 'catName': CATNAME[cat], 'elem': elem,
        'sid': 9500, 'skey': 'EVENT_' + skey,
        'series': ser_ko + ' (이벤트)',
        'mon': mk, 'icon': MON[mk]['icon'] if mk else None,
        'ssort': 950000000, 'event': True,
        'base': nm, 'final': nm, 'img': None,
        'skAll': sorted({x[0] for x in sk}),
        'g': [{'gr': 10, 'name': nm, 'lv': levels, 'sk': sk, 'sp': None}],
    })

# 스킬 보강 저장
if new_skills:
    SK.update({k: v for k, v in new_skills.items() if k not in SK})
    json.dump(SK, open(OUT + 'skills.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

WORDER = ['대검', '한손검', '쌍검', '태도', '해머', '수렵피리', '랜스', '건랜스',
          '슬래시액스', '차지액스', '조충곤', '활', '라이트보우건', '헤비보우건']
allw = W + events
allw.sort(key=lambda x: (WORDER.index(x['catName']), x['ssort'], x['series'], x['base']))
json.dump(allw, open(OUT + 'weapons.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

from collections import Counter
print(f'공식 무기 {len(W)} + 이벤트 {len(events)} = {len(allw)}  (기존과 중복이라 건너뜀 {skipped})')
print('이벤트 시리즈:', dict(Counter(e['series'] for e in events)))
if new_skills:
    print('이벤트 전용 스킬 추가:', [v['name'] for v in new_skills.values()])
