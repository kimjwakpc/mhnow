# -*- coding: utf-8 -*-
"""공식 가이드 응답(HTML) + 엑셀 → 사이트용 JSON 생성"""
import html, json, os, re, unicodedata
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
OUT = BASE + 'data/'
os.makedirs(OUT, exist_ok=True)

def props(path, comp):
    s = open(path, encoding='utf-8').read()
    i = s.index('component="%s"' % comp); j = s.index('props="', i) + 7; k = s.index('"', j)
    return json.loads(html.unescape(s[j:k]))

def src(name):
    """원본 응답 파일 — sources/ (update.py 가 받은 최신본) 우선, 없으면 폴더 루트"""
    for p in (BASE + 'sources/' + name, BASE + name):
        if os.path.exists(p): return p
    raise FileNotFoundError(name)

W = props(src('weapons_full.txt'), 'SortableWeaponList')
A = props(src('방어구페이지 응답.txt'), 'SortableArmorList')
S = props(src('스킬페이지 응답1.txt'), 'SortableSkillList')
print('원본:', ', '.join(os.path.relpath(src(n), BASE) for n in ('weapons_full.txt', '방어구페이지 응답.txt', '스킬페이지 응답1.txt')))
tw, ta, ts = W['guideTranslations'], A['guideTranslations'], S['guideTranslations']

# ───────── 스킬 ─────────
skills = {}
for kind, v in S['skills'].items():
    lv = []
    for l in v['levels']:
        d = ts.get(l['description'], l['description'])
        for n, x in enumerate(l['effectAmount'], 1): d = d.replace('{effect_amount_%d}' % n, str(x))
        for n, x in enumerate(l['conditionAmount'], 1): d = d.replace('{condition_amount_%d}' % n, str(x))
        lv.append({'lv': l['level'], 'eff': l['effectAmount'], 'cond': l['conditionAmount'], 'desc': d})
    skills[kind] = {'kind': kind, 'id': v['skillId'], 'name': ts.get(v['name'], v['name']),
                    'cat': v['category'], 'max': v['maxLevel'], 'levels': lv, 'sort': v['sortOrder']}

# 가이드에 빠진 스킬 보강
EXTRA_SKILLS = {
    'HEAVY_BLOW': '더블임팩트',
    'HAPPY_NEW_YEAR_2024': '해피 뉴 이어[2024]',
    'HOT_SUMMER_2025': '핫 서머[2025]',
    'PUMPKIN_TEAMWORK': '단결력 [가을의 호박 사냥]',
}
for k, n in EXTRA_SKILLS.items():
    if k in skills: continue
    skills[k] = {'kind': k, 'id': -1, 'name': n, 'cat': 'OTHERS', 'max': 5, 'unknown': True, 'sort': 99999,
                 'levels': [{'lv': i, 'eff': [], 'cond': [], 'desc': '수치 미공개'} for i in range(1, 6)]}

# ───────── 표류석: 색깔별 스킬 풀 ─────────
COLOR_ORDER = ['적색', '황색', '청색', '하늘색', '흑색', '백색', '보라색']
pools, pure = {}, {}
for k, v in S['driftstones'].items():
    nm = ts.get('DRIFTSTONE_NAME_' + k, k)
    m = re.search(r'표류석【(.+?)】', nm)
    if m: pools[m.group(1)] = [x['skillKind'] for x in v['skills']]
    else:
        m2 = re.search(r'표류순석【(.+?)】', nm)
        if m2: pure[v['skills'][0]['skillKind']] = nm
sets = {c: set(v) for c, v in pools.items()}
common = sorted(set.intersection(*sets.values()), key=lambda k: skills.get(k, {}).get('sort', 0)) if sets else []
# 색상 풀에 없고 표류순석만 존재 → 보라색 (반사/돌파구/체인지부스트/앙갚음/더블임팩트/적정거리)
allpool = set().union(*sets.values()) if sets else set()
purple = sorted(set(pure) - allpool, key=lambda k: skills.get(k, {}).get('sort', 0))
if purple: pools['보라색'] = purple + list(common)
drift = []
for c in COLOR_ORDER:
    if c not in pools: continue
    only = sorted(set(pools[c]) - set(common), key=lambda k: skills.get(k, {}).get('sort', 0))
    drift.append({'color': c, 'own': only, 'common': common})

# ───────── 몬스터 ─────────
monsters = {}
for k, v in A['monsters'].items():
    monsters[k] = {'id': k, 'name': ta.get('MONSTER_NAME_' + k.upper(), k), 'weak': v['weakness'],
                   'elem': v['element'], 'species': v['species'], 'minGrade': v['minGrade'],
                   'habitat': v['habitat'], 'icon': v.get('fieldIconUrl'), 'sort': v.get('sortOrder', 99999)}
norm_m = {re.sub(r'[^a-z]', '', k.lower()): k for k in monsters}
def monster_of(series_key):
    return norm_m.get(re.sub(r'[^a-z]', '', series_key.replace('SERIES_', '').lower()))

SSORT = {}
for _src in (A.get('series') or {}), (W.get('series') or {}):
    for _k, _v in _src.items(): SSORT.setdefault(_k, _v.get('sortOrder', 999999999))
def ssort_of(series_key, monster_key):
    if series_key in SSORT: return SSORT[series_key]
    m = monsters.get(monster_key or '')
    return 900000000 + (m['sort'] if m else 99999)

SERIES_FIX = {'SERIES_BONEWEAPON': '본 시리즈', 'SERIES_ORE': '광석 시리즈'}
for x in ['BONEINSECTGLAIVE', 'GUNLANCE', 'HEAVYBOWGUN', 'HUNTINGHORN', 'SWITCHAXE']:
    SERIES_FIX['SERIES_BONEWEAPON' + x] = '본 시리즈'

# ───────── 무기 ─────────
WCAT = {'GREAT_SWORD': '대검', 'SWORD_SHIELD': '한손검', 'DUAL_BLADES': '쌍검', 'LONG_SWORD': '태도',
        'HAMMER': '해머', 'HUNTING_HORN': '수렵피리', 'LANCE': '랜스', 'GUNLANCE': '건랜스',
        'SWITCH_AXE': '슬래시액스', 'CHARGE_BLADE': '차지액스', 'INSECT_GLAIVE': '조충곤',
        'BOW': '활', 'HEAVY_BOWGUN': '헤비보우건', 'LIGHT_BOWGUN': '라이트보우건'}
WORDER = ['대검', '한손검', '쌍검', '태도', '해머', '수렵피리', '랜스', '건랜스',
          '슬래시액스', '차지액스', '조충곤', '활', '라이트보우건', '헤비보우건']
strip_num = lambda n: (re.match(r'^(.*?)\s*\d+$', n) or [None, n])[1]

# ───────── 무기 종류별 고유 정보 ─────────
AMMO_NAME = {  # (탄종, 속성) → 한글명
    'NORMAL': '통상탄', 'PIERCING': '관통탄', 'SPREAD': '산탄', 'CLUSTER': '확산탄',
    'STICKY': '철갑유탄', 'SLICING': '참렬탄', 'WYVERN': '용격탄',
}
AMMO_ELEM = {'FIRE': '화염', 'WATER': '수냉', 'THUNDER': '전격', 'ICE': '빙결', 'DRAGON': '멸룡',
             'POISON': '독', 'PARALYSIS': '마비', 'SLEEP': '수면'}
# *_LARGE_2 는 공식 번역이 없는 헤비보우건 전용 키. mhn.quest 는 이 둘을 각각 '대'·'조금 느림' 과
# 같은 단계로 취급하므로 같은 이름으로 표기한다.
RECOIL = {'RECOIL_SMALL': '소', 'RECOIL_MEDIUM': '중', 'RECOIL_LARGE': '대', 'RECOIL_LARGE_2': '대',
          'RECOIL_EXTRA_LARGE': '특대', 'RECOIL_WYVERN': '용격'}
RELOAD = {'RELOAD_SMALL': '빠름', 'RELOAD_MEDIUM': '보통',
          'RELOAD_LARGE': '조금 느림', 'RELOAD_LARGE_2': '조금 느림', 'RELOAD_EXTRA_LARGE': '느림'}

# 게임 내 정식 명칭이 확인된 조합만 이름을 바꾸고, 나머지는 "기본탄종 · 속성" 으로 표기
AMMO_EXACT = {
    ('NORMAL', 'FIRE'): '화염탄', ('NORMAL', 'WATER'): '수냉탄', ('NORMAL', 'THUNDER'): '전격탄',
    ('NORMAL', 'ICE'): '빙결탄', ('NORMAL', 'DRAGON'): '멸룡탄',
    ('NORMAL', 'POISON'): '독탄', ('NORMAL', 'PARALYSIS'): '마비탄', ('NORMAL', 'SLEEP'): '수면탄',
    ('SLICING', 'FIRE'): '참렬화염탄', ('SLICING', 'WATER'): '참렬수냉탄',
    ('SLICING', 'THUNDER'): '참렬뇌격탄', ('SLICING', 'ICE'): '참렬빙결탄',
    ('SLICING', 'DRAGON'): '참렬멸룡탄',
}
def ammo_name(t):
    # 공식 번역(AMMO_NAME_<id>)이 있으면 그대로 사용 — 예: 관통수냉탄, 참렬전격탄, LV1 통상탄
    if t.get('id') is not None and ('AMMO_NAME_%d' % t['id']) in tw:
        return tw['AMMO_NAME_%d' % t['id']]
    ty, el = t.get('type'), t.get('element')
    if (ty, el) in AMMO_EXACT: return AMMO_EXACT[(ty, el)]
    base = AMMO_NAME.get(ty, ty)
    e = AMMO_ELEM.get(el)
    return f'{base} · {e}' if e else base

def spec_of(v, tw):
    """무기 종류별 고유 정보 → {kind, text|list|rows}"""
    T = lambda k: tw.get(k, k)
    if v.get('gunlanceSpec'):
        return {'kind': 'SHELL', 'label': '포격 타입', 'text': T(v['gunlanceSpec']['shellingType'])}
    if v.get('chargeBladeSpec'):
        ph = v['chargeBladeSpec']['phialType']
        # 차지액스 속성병(PHIAL_ELEMENT_FIRE 등)은 번역 키가 없음 → 강속성병
        return {'kind': 'PHIAL', 'label': '병 타입',
                'text': '강속성병' if ph.startswith('PHIAL_ELEMENT_') and ph not in tw else T(ph)}
    if v.get('switchAxeSpec'):
        sa = v['switchAxeSpec']
        ex = sa.get('swordModeElementAttack')
        return {'kind': 'PHIAL', 'label': '병 타입',
                'text': T(sa['phialType']) + (f" · 검 모드 속성 +{ex}" if ex else '')}
    if v.get('huntingHornSpec'):
        return {'kind': 'MELODY', 'label': '선율 효과',
                'list': [T(x) for x in v['huntingHornSpec'].get('melody', [])]}
    if v.get('bowSpec'):
        return {'kind': 'ARROW', 'label': '화살 타입',
                'list': [T(x) for x in v['bowSpec'].get('arrows', [])]}
    if v.get('insectGlaiveSpec'):
        ig = v['insectGlaiveSpec']
        parts = [T('ATTACK_TYPE_' + ig['attackType']) if ig.get('attackType') else None,
                 T(ig.get('parameterType')) if ig.get('parameterType') else None,
                 T(ig.get('attackAttribute')) if ig.get('attackAttribute') else None]
        return {'kind': 'KINSECT', 'label': '사냥벌레', 'text': ' · '.join(x for x in parts if x)}
    if v.get('bowgunSpec'):
        rows = []
        for a in v['bowgunSpec'].get('ammo', []):
            rows.append({'n': ammo_name(a.get('type', {})), 'c': a.get('capacity', ''),
                         'r': RECOIL.get(a.get('recoil'), ''), 'l': RELOAD.get(a.get('reload'), ''),
                         'color': (a.get('type') or {}).get('color')})
        return {'kind': 'AMMO', 'label': '탄종', 'rows': rows}
    return None

weapons = []
for wid, v in W['weapons'].items():
    g = v['grades']
    base, final = strip_num(tw[g[0]['name']]), strip_num(tw[g[-1]['name']])
    mk = monster_of(v['series'])
    weapons.append({
        'id': wid, 'cat': v['category'], 'catName': WCAT[v['category']],
        'elem': re.sub(r'_?element$', '', (v['element'] or 'no').lower()) or 'no',
        'sid': v['seriesId'], 'skey': v['series'],
        'series': tw.get('SERIES_NAME_%d' % v['seriesId'], SERIES_FIX.get(v['series'], v['series'])),
        'mon': mk, 'icon': monsters[mk]['icon'] if mk else None,
        'ssort': ssort_of(v['series'], mk),
        'spec': spec_of(v, tw),
        'base': base, 'final': final, 'img': g[-1].get('imageUrl'),
        'skAll': sorted({s['kind'] for x in g for s in x.get('skills', [])}),
        'g': [{'gr': x['grade'],
               'name': (base + ' ' + str(x['grade'] - g[0]['grade'] + 1)) if x['grade'] <= 5 else (final + ' ' + str(x['grade'] - 5)),
               'lv': [[l['attack'], l['elementAttack'], l['critical']] for l in x['levels']],
               'sk': [[s['kind'], s['level']] for s in x.get('skills', [])],
               'sp': (x.get('specialSkill') or {}).get('kind')} for x in g]})
weapons.sort(key=lambda x: (WORDER.index(x['catName']), x['ssort'], x['base']))

# ───────── 방어구 ─────────
ACAT = {'HEAD': '머리', 'CHEST': '몸', 'ARMS': '팔', 'TORSO': '허리', 'LEGS': '다리'}
armor = []
for aid, v in A['armor'].items():
    g = v['grades']; mk = monster_of(v['series'])
    armor.append({'id': aid, 'cat': v['category'], 'catName': ACAT[v['category']],
                  'sid': v['seriesId'], 'skey': v['series'],
                  'series': ta.get('SERIES_NAME_%d' % v['seriesId'], v['series']),
                  'mon': mk, 'icon': monsters[mk]['icon'] if mk else None,
                  'ssort': ssort_of(v['series'], mk),
                  'name': strip_num(ta[g[0]['name']]), 'event': False,
                  'skAll': sorted({s['kind'] for x in g for s in x['skills']}),
                  'g': [{'gr': x['grade'], 'slot': x['driftsmeltSlots'],
                         'sk': [[s['kind'], s['level']] for s in x['skills']],
                         'def': x['defense']} for x in g]})

# 이벤트 세트 (엑셀에서 보강) — 엑셀을 못 읽으면 지난번에 뽑아 둔 data/event_armor.json 사용
EVENT_CACHE = OUT + 'event_armor.json'
n_before = len(armor)
try:
    import openpyxl
    wb = openpyxl.load_workbook(BASE + '딜계산_메크로버젼.xlsm')
    ws = wb['장비세팅']
    norm = lambda s: re.sub(r'[\s\[\]【】［］]', '', unicodedata.normalize('NFKC', str(s)))
    n2k = {norm(v['name']): k for k, v in skills.items()}
    EVENTS = {'설2024', '할로윈', '해피뉴이어', '2024카니발', '이스터에그', '2025썸머'}
    starts = [r for r in range(13, 305) if ws.cell(r, 1).value] + [305]
    cols = [(1, 'HEAD'), (5, 'CHEST'), (9, 'ARMS'), (13, 'TORSO'), (17, 'LEGS')]
    for i in range(len(starts) - 1):
        r0, r1 = starts[i], starts[i + 1]; nm = ws.cell(r0, 1).value
        if nm not in EVENTS: continue
        for col, cat in cols:
            rows = [(ws.cell(r, col + 2).value, ws.cell(r, col + 3).value) for r in range(r0, r1) if ws.cell(r, col + 2).value]
            if not rows: continue
            sk, slots = [], 0
            for sn, sl in rows:
                if str(sn).strip() == 'O': slots += 1; continue
                k = n2k.get(norm(sn))
                if k: sk.append([k, int(sl or 1)])
            armor.append({'id': 'EVENT_%s_%s' % (nm, cat), 'cat': cat, 'catName': ACAT[cat],
                          'sid': 9000 + i, 'skey': 'EVENT_' + nm, 'series': nm + ' 세트',
                          'mon': None, 'icon': None, 'ssort': 990000000 + i, 'name': nm, 'event': True,
                          'skAll': sorted({s[0] for s in sk}),
                          'g': [{'gr': 10, 'slot': slots, 'sk': sk, 'def': [0] * 5}]})
    ev = armor[n_before:]
    if ev: json.dump(ev, open(EVENT_CACHE, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    else: raise ValueError('엑셀에서 이벤트 세트를 찾지 못함')
except Exception as e:
    del armor[n_before:]
    if os.path.exists(EVENT_CACHE):
        armor += json.load(open(EVENT_CACHE, encoding='utf-8'))
        print('이벤트 세트: 엑셀 대신 data/event_armor.json 사용 (%s)' % e)
    else:
        print('이벤트 세트 스킵:', e)
armor.sort(key=lambda x: (x['event'], x['ssort'], ['HEAD', 'CHEST', 'ARMS', 'TORSO', 'LEGS'].index(x['cat'])))

# ───────── meta ─────────
meta = {
    'weaponCategories': WORDER,
    'weaponCatKey': {v: k for k, v in WCAT.items()},
    'armorCategories': ['HEAD', 'CHEST', 'ARMS', 'TORSO', 'LEGS'],
    'armorCatNames': ACAT,
    'skillCategories': S['skillCategories'],
    'skillCatNames': {c: ts.get(c, c) for c in S['skillCategories']},
    'elements': ['no', 'fire', 'water', 'thunder', 'ice', 'dragon', 'poison', 'paralysis', 'sleep', 'blast'],
    'elementNames': {k.replace('ELEMENT_', '').lower(): v for k, v in tw.items() if re.fullmatch(r'ELEMENT_[A-Z]+', k)},
    'driftColors': COLOR_ORDER,
}

for n, d in [('skills', skills), ('driftstones', drift), ('armor', armor),
             ('monsters', monsters), ('weapons', weapons), ('meta', meta)]:
    json.dump(d, open(OUT + n + '.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{n:12s} {len(d):5d}  {os.path.getsize(OUT + n + ".json"):>9,}')
print('표류석 색:', [d['color'] for d in drift], '| 공용', len(common))
print('몬스터 아이콘 연결: 무기', sum(1 for x in weapons if x['icon']), '/', len(weapons),
      '| 방어구', sum(1 for x in armor if x['icon']), '/', len(armor))
