# -*- coding: utf-8 -*-
"""mhnowcalc.com 빌드 에디터 응답 → 스타일 강화 / 무기종류별 발동률 / 표류석 색상 추출"""
import json, os, re, unicodedata

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
OUT = BASE + 'data/'
# 가장 최신 나우칼 빌드 에디터 응답을 사용
import glob
_cands = sorted(glob.glob(BASE + 'sources/나우칼*.txt') + glob.glob(BASE + '나우칼*.txt'), key=os.path.getmtime, reverse=True)
SRC = next((f for f in _cands if 'BUILD_EDITOR_BOOTSTRAP' in open(f, encoding='utf-8').read(200000)), _cands[0])
print('소스:', os.path.basename(SRC))

s = open(SRC, encoding='utf-8').read()
i = s.index('window.BUILD_EDITOR_BOOTSTRAP')
st = s.index('{', i); d = 0
for n, ch in enumerate(s[st:], st):
    if ch == '{': d += 1
    elif ch == '}':
        d -= 1
        if d == 0: en = n + 1; break
B = json.loads(s[st:en])

SK = json.load(open(OUT + 'skills.json', encoding='utf-8'))
WP = json.load(open(OUT + 'weapons.json', encoding='utf-8'))

norm = lambda x: re.sub(r'[\s\[\]【】［］·・]', '', unicodedata.normalize('NFKC', str(x)))
n2k = {norm(v['name']): k for k, v in SK.items()}

# ── 나우칼 skill_key → 공식 kind ──────────────────────────
skmap, unmapped = {}, []
srcskills = {x['skill_key']: x['label_ko'] for x in B['editableSkills']}
srcskills.update({x['skill_key']: x['label_ko'] for x in B['driftSkills']})
EXTRA = {'Retaliation': 'COUNTER_ATTACK_STRENGTH'}   # 즉시 반격 = 앙갚음
for key, ko in srcskills.items():
    k = n2k.get(norm(ko)) or EXTRA.get(key)
    if k: skmap[key] = k
    else: unmapped.append((key, ko))

# ── 무기 종류별 발동률 ────────────────────────────────────
TYPE = {'SwordAndShield': 'SWORD_SHIELD', 'DualBlades': 'DUAL_BLADES', 'GreatSword': 'GREAT_SWORD',
        'LongSword': 'LONG_SWORD', 'Hammer': 'HAMMER', 'HuntingHorn': 'HUNTING_HORN',
        'Lance': 'LANCE', 'Gunlance': 'GUNLANCE', 'SwitchAxe': 'SWITCH_AXE',
        'ChargeBlade': 'CHARGE_BLADE', 'LightBowgun': 'LIGHT_BOWGUN', 'HeavyBowgun': 'HEAVY_BOWGUN',
        'Bow': 'BOW', 'InsectGlaive': 'INSECT_GLAIVE'}
rates = {}
for t, m in B['weaponRatesByType'].items():
    cat = TYPE[t]
    rates[cat] = {skmap[k]: v / 100 for k, v in m.items() if k in skmap}
default_rates = {skmap[k]: v / 100 for k, v in B['defaultRatesBySkillKey'].items() if k in skmap}

# ── 표류석 색상 ──────────────────────────────────────────
COLOR = {'Red': '적색', 'Yellow': '황색', 'Blue': '청색', 'Sky': '하늘색',
         'Black': '흑색', 'White': '백색', 'Nazo': '보라색', 'All': '공용'}
ORDER = ['적색', '황색', '청색', '하늘색', '흑색', '백색', '보라색']
byc = {}
for x in B['driftSkills']:
    k = skmap.get(x['skill_key'])
    if not k: continue
    byc.setdefault(COLOR.get(x['group'], x['group']), []).append((x.get('order', 0), k))
common = [k for _, k in sorted(byc.get('공용', []))]
drift = [{'color': c, 'own': [k for _, k in sorted(byc.get(c, []))], 'common': common}
         for c in ORDER if c in byc]

# ── 스타일 강화 ──────────────────────────────────────────
PROF_KO = {
    'Element_1': '속성 무기 1', 'Element_2': '속성 무기 2 (레이기에나·리오레우스)',
    'Element_3': '속성 무기 3 (이블죠)', 'Element_4': '속성 무기 4 (진오우거)',
    'Element_5': '속성 무기 5 (울크스스)',
    'None_Element_1': '무속성 1 (볼보로스)', 'None_Element_2': '무속성 2 (디아블로스·무속성 보우건)',
    'None_Element_3': '무속성 3 (호프)', 'None_Element_4': '무속성 4 (버프바로)',
    'None_Element_5': '무속성 5 (로즈어썰트)',
    'Ailment_4': '상태이상 무기 1 (독·폭파)', 'Ailment_5': '상태이상 무기 2',
    'Ailment_6': '상태이상 무기 3 (바젤기우스)',
    'Element_6': '속성 무기 6 (타마미츠네)',
}
ed = B['equipDetails']
profiles = {}
for v in ed.values():
    cs = v.get('custom_style')
    if not cs or not cs.get('enabled'): continue
    p = cs['profile_key']
    if p in profiles: continue
    # 레벨별 누적값 (1~20)
    add = {'atk': [0] * 21, 'ele': [0] * 21, 'crit': [0] * 21}
    for r in cs['level_rules']:
        L = r['level_no']
        if 1 <= L <= 20:
            add['atk'][L] += r.get('attack_add', 0) or 0
            add['ele'][L] += r.get('element_add', 0) or 0
            add['crit'][L] += r.get('affinity_add', 0) or 0
    cum = {k: [] for k in add}
    for k in add:
        t = 0
        for L in range(1, 21): t += add[k][L]; cum[k].append(t)
    profiles[p] = {'key': p, 'name': PROF_KO.get(p, cs.get('profile_name_en', p)), 'max': cs.get('max_level', 20),
                   'atk': cum['atk'], 'ele': cum['ele'], 'crit': cum['crit'],
                   'milestone': {c['key']: c['value'] for c in cs.get('choices', [])}}

# 무기 매핑: (종류, 공격, 속성, 회심) 최대등급 Lv5 기준
off = {}
for w in WP:
    L = w['g'][-1]['lv'][4]
    off.setdefault((w['cat'], L[0], L[1], L[2]), []).append(w)
nm2 = lambda x: re.sub(r'[\s\-+·【】\[\]]', '', str(x))
wstyle, hit, miss = {}, 0, 0
for v in ed.values():
    if v['category'] != 'Weapon': continue
    cs = v.get('custom_style')
    if not cs or not cs.get('enabled'): continue
    cat = TYPE.get(v['weapon_type'])
    c = off.get((cat, v['attack'], v['element_value'], v['affinity']), [])
    if len(c) > 1:
        c = [x for x in c if nm2(x['final']) == nm2(v['equip_name_ko']) or nm2(x['base']) == nm2(v['equip_name_ko'])] or c
    if not c:   # 나우칼 수치가 공식과 달라 스탯으로 못 찾으면 같은 종류에서 이름으로
        c = [x for x in WP if x['cat'] == cat and nm2(v['equip_name_ko']) in (nm2(x['final']), nm2(x['base']))]
    if len(c) == 1: wstyle[c[0]['id']] = cs['profile_key']; hit += 1
    else: miss += 1

# ── 나우칼에 아직 안 올라온 무기 보정 ─────────────────────
# 스타일 강화 수치는 같은 세트 안에서 속성이 같으면 같다. 세트에 연결된 무기가 하나라도 있는데
# 일부 무기만 빠져 있으면(나우칼 미등재) 같은 세트·같은 속성 무기의 프로필을 물려받는다.
# 세트 전체가 비어 있으면 그 세트는 실제로 스타일 강화가 없는 것이므로 건드리지 않는다.
from collections import Counter, defaultdict
by_series = defaultdict(list)
for w in WP:
    if not w.get('event') and not w.get('pending'): by_series[w['series']].append(w)
inferred = []
for ser, ws in by_series.items():
    known = [w for w in ws if w['id'] in wstyle]
    if not known: continue                       # 세트 전체가 스타일 없음 → 그대로 둔다
    by_elem = defaultdict(Counter)
    for w in known: by_elem[w['elem']][wstyle[w['id']]] += 1
    allp = Counter(wstyle[w['id']] for w in known)
    for w in ws:
        if w['id'] in wstyle: continue
        src = by_elem.get(w['elem']) or allp      # 같은 속성 우선, 없으면 세트에서 가장 흔한 것
        wstyle[w['id']] = src.most_common(1)[0][0]
        inferred.append((w['id'], ser, w['catName'], w['final'], w['elem'], wstyle[w['id']]))

styles = {'profiles': profiles, 'weapon': wstyle, 'inferred': [i[0] for i in inferred]}

json.dump(styles, open(OUT + 'styles.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump({'byType': rates, 'default': default_rates},
          open(OUT + 'rates.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(drift, open(OUT + 'driftstones.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

print('스킬 매핑', len(skmap), '| 미매칭', unmapped or '없음')
print('발동률: 무기종류', len(rates), '× 스킬', len(next(iter(rates.values()))))
print('표류석 색', [d['color'] for d in drift], '| 공용', len(common))
print('스타일 프로필', len(profiles), '| 무기 연결', hit, '| 실패', miss,
      '| 같은 세트에서 물려받음', len(inferred))
for _id, ser, cat, nmk, el, pk in inferred:
    print(f'   물려받음  {ser} {cat} {nmk} ({el}) ← {pk}')
for k, p in profiles.items():
    print(f"   {k:16s} Lv20 공+{p['atk'][19]:>4} 속+{p['ele'][19]:>4} 회+{p['crit'][19]:>3}  마일스톤 {p['milestone']}")
