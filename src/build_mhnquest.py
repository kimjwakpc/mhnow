# -*- coding: utf-8 -*-
"""mhn.quest 데이터로 「패치 예정」 장비의 실제 수치를 채운다.

공식 가이드·나우칼에 아직 올라오지 않은 세트(브라키디오스 등)는 build_upcoming.py 가
0 짜리 뼈대만 넣어 둔다. 이 스크립트는 mhn.quest(커뮤니티 DB)에 같은 세트가 있으면
등급별 공격·속성·회심, 부위별 스킬, 표류석 칸, 방어력, 무기 고유 정보를 채워 넣고
`alt: "mhn.quest"` 로 표시한다. mhn.quest 에 없는 세트는 예정 상태 그대로 둔다.

입력: sources/mhnquest/mhnquest.json  (src/mhnquest_to_json.mjs 가 만든다)
"""
import json, os, re, unicodedata

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
OUT = BASE + 'data/'
SRC = BASE + 'sources/mhnquest/mhnquest.json'
if not os.path.exists(SRC):
    print('mhnquest.json 없음 — 건너뜀 (node src/mhnquest_to_json.mjs 로 만듭니다)')
    raise SystemExit

Q = json.load(open(SRC, encoding='utf-8'))
W = json.load(open(OUT + 'weapons.json', encoding='utf-8'))
A = json.load(open(OUT + 'armor.json', encoding='utf-8'))
SK = json.load(open(OUT + 'skills.json', encoding='utf-8'))
MON = json.load(open(OUT + 'monsters.json', encoding='utf-8'))

norm = lambda s: re.sub(r'[\s·・\-\[\]【】／/]', '', unicodedata.normalize('NFKC', str(s)))

# ── 이름 → 우리 키 ───────────────────────────────────────
mon_by_name = {norm(v['name']): k for k, v in MON.items()}
sk_by_name = {norm(v['name']): k for k, v in SK.items()}
KO = Q['ko']
zh2kind, zh2ko = {}, KO['skill-name']
for zh, ko in zh2ko.items():
    k = sk_by_name.get(norm(ko))
    if k: zh2kind[zh] = k
# 번역 표기가 조금 달라 자동으로 못 붙는 것들
ALIAS = {'攻擊活化': '공격 활성', '真本領': '진가 발휘', '完美巧擊': '저스트 교격',
         '完美巧擊【狀態異常】': '저스트 교격【상태 이상】', '完美巧擊【持續】': '저스트 교격【지속】',
         '攻擊．境界': '공격·경지', '會心擊【屬性】': '회심격【속성】', '以牙還牙': '앙갚음',
         '鋼龍的凍風': '강룡의 얼음바람', '冰呪龍的冰纏': '빙룡의 얼음 갑옷', '鬼火纏身': '귀화 망토',
         '毒屬性強化': '독속성 강화', '麻痺屬性強化': '마비속성 강화', '睡眠攻擊強化': '수면속성 강화',
         '攻擊增強【會心】': '공격 강화【회심】', 'SP計量表加速【防禦】': '특수 게이지 가속【가드】',
         '跳躍鐵人': '점프 철인'}
for zh, ko in ALIAS.items():
    if zh not in zh2kind and norm(ko) in sk_by_name: zh2kind[zh] = sk_by_name[norm(ko)]

WCAT = {'shield-sword': '한손검', 'great-sword': '대검', 'hammer': '해머', 'long-sword': '태도',
        'dual-blades': '쌍검', 'lance': '랜스', 'charge-blade': '차지액스', 'gunlance': '건랜스',
        'switch-axe': '슬래시액스', 'hunting-horn': '수렵피리', 'insect-glaive': '조충곤',
        'bow': '활', 'light-gun': '라이트보우건', 'heavy-gun': '헤비보우건'}
CAT2Q = {v: k for k, v in WCAT.items()}
PIECE = {'HEAD': 'helm', 'CHEST': 'mail', 'ARMS': 'gloves', 'TORSO': 'belt', 'LEGS': 'greaves'}
ELEM = {'white': 'no', 'fire': 'fire', 'water': 'water', 'thunder': 'thunder', 'ice': 'ice',
        'dragon': 'dragon', 'poison': 'poison', 'paralysis': 'paralysis', 'sleep': 'sleep', 'blast': 'blast'}
RECOIL = ['소', '중', '대', '특대', '용격']
RELOAD = ['빠름', '보통', '조금 느림', '느림']
KIN_TYPE = {'共鬥': '공투형', '飛翔': '비상형', '粉塵': '가루형'}
KIN_PERF = {'迅速': '퀵', '耐力': '스태미나', '力量': '파워'}
KIN_ATK = {'打擊': '타격', '切斷': '절단'}

at = lambda arr, gr, lv: (arr[(gr - 1) * 5 + (lv - 1)] if arr else 0)


def skills_at(entries, gr):
    """[{unlock, skill, lv}] → 그 등급에서의 [[kind, lv], …]"""
    out = {}
    for e in entries or []:
        us = e['unlock'] if isinstance(e['unlock'], list) else [e['unlock']]
        lvs = e['lv'] if isinstance(e['lv'], list) else [e['lv']]
        val = 0
        for u, l in zip(us, lvs):
            if gr >= u: val = l
        k = zh2kind.get(e['skill'])
        if val and k: out[k] = out.get(k, 0) + val
    return [[k, v] for k, v in out.items()]


def spec_of(S, cat):
    """무기 종류별 고유 정보 — build_data.py 와 같은 형식"""
    if cat == '건랜스' and S.get('shelling'):
        return {'kind': 'SHELL', 'label': '포격 타입', 'text': KO['shelling'].get(S['shelling'], S['shelling'])}
    if cat == '차지액스' and S.get('phial'):
        return {'kind': 'PHIAL', 'label': '병 타입', 'text': KO['phial'].get(S['phial'], S['phial'])}
    if cat == '슬래시액스' and S.get('sa-phial'):
        return {'kind': 'PHIAL', 'label': '병 타입', 'text': KO['sa-phial'].get(S['sa-phial'], S['sa-phial'])}
    if cat == '수렵피리' and S.get('songs'):
        return {'kind': 'MELODY', 'label': '선율 효과',
                'list': [KO['songs'].get(v, [v])[0] for v in S['songs'].values()]}
    if cat == '활' and S.get('arrow'):
        return {'kind': 'ARROW', 'label': '화살 타입',
                'list': [f"{KO['arrow'].get(t, t)}화살 Lv{n}" for t, n in S['arrow']]}
    if cat == '조충곤' and S.get('kinsect'):
        k = S['kinsect']
        parts = [KIN_TYPE.get(k.get('type')), KIN_PERF.get(k.get('performance')), KIN_ATK.get(k.get('attack'))]
        return {'kind': 'KINSECT', 'label': '사냥벌레', 'text': ' · '.join(x for x in parts if x)}
    if cat in ('라이트보우건', '헤비보우건'):
        rows = S.get('ammo') if cat == '라이트보우건' else S.get('heavy-ammo')
        if not rows: return None
        out = []
        for r in rows:
            t, cap = r[0], r[1]
            rc = RECOIL[r[2]] if len(r) > 2 and r[2] is not None and r[2] < len(RECOIL) else ''
            rl = RELOAD[r[3]] if len(r) > 3 and r[3] is not None and r[3] < len(RELOAD) else ''
            out.append({'n': KO['ammo'].get(t, t), 'c': str(cap), 'r': rc, 'l': rl, 'color': None})
        return {'kind': 'AMMO', 'label': '탄종', 'rows': out}
    return None


# ── mhn.quest 세트 ↔ 우리 몬스터 ─────────────────────────
q_by_mon = {}
for qk, ko in KO['monster-name'].items():
    m = mon_by_name.get(norm(ko))
    if m and qk in Q['set'] and qk in Q['eq']: q_by_mon[m] = qk

pend_mons = sorted({x['mon'] for x in W + A if x.get('pending') and x.get('mon')})
filled_w = filled_a = 0
done, skipped, new_sk = [], [], []

for mon in pend_mons:
    qk = q_by_mon.get(mon)
    if not qk:
        skipped.append(MON.get(mon, {}).get('name', mon)); continue
    S, E = Q['set'][qk], Q['eq'][qk]
    grades = list(range(S.get('unlock', 5), 11))

    for w in [x for x in W if x.get('pending') and x['mon'] == mon]:
        qcat = CAT2Q.get(w['catName'])
        effk = (S.get('eff') or {}).get(qcat) or (S.get('eff') or {}).get('all')
        eff = S.get(effk) or {}
        if not eff.get('base'): continue
        atk, ele, crit = (Q['weaponVal'].get(eff.get(x)) for x in ('base', 'ele', 'crit'))
        wsk = E.get(qcat) or E.get('weapon')
        nm = w['g'][-1]['name']
        w['elem'] = ELEM.get(effk, w.get('elem', 'no'))
        w['spec'] = spec_of(S, w['catName'])
        w['g'] = [{'gr': gr, 'name': nm,
                   'lv': [[at(atk, gr, l), at(ele, gr, l), at(crit, gr, l)] for l in range(1, 6)],
                   'sk': skills_at(wsk, gr), 'sp': None} for gr in grades]
        w['skAll'] = sorted({s[0] for g in w['g'] for s in g['sk']})
        w.pop('pending', None); w['alt'] = 'mhn.quest'
        filled_w += 1

    for a in [x for x in A if x.get('pending') and x['mon'] == mon]:
        piece = PIECE[a['cat']]
        slots = (E.get('slot') or {}).get(piece, [])
        a['g'] = [{'gr': gr, 'slot': sum(1 for u in slots if gr >= u),
                   'sk': skills_at(E.get(piece), gr),
                   'def': [at(Q['armorVal'], gr, l) for l in range(1, 6)]} for gr in grades]
        a['skAll'] = sorted({s[0] for g in a['g'] for s in g['sk']})
        a.pop('pending', None); a['alt'] = 'mhn.quest'
        filled_a += 1

    # 스킬 설명 보강 — mhn.quest 한국어 설명이 있으면 「수치 미공개」 대신 넣는다
    used = {e['skill'] for p, lst in E.items() if p != 'slot' for e in lst}
    for zh in used:
        k = zh2kind.get(zh)
        if not k or k not in SK: continue
        desc = KO['skill'].get(zh)
        if not desc or not SK[k].get('unknown'): continue
        SK[k]['levels'] = [{'lv': i + 1, 'eff': [], 'cond': [], 'desc': d} for i, d in enumerate(desc)]
        SK[k]['max'] = len(desc)
        SK[k]['unknown'] = False
        SK[k]['alt'] = 'mhn.quest'
        new_sk.append(SK[k]['name'])
    done.append(MON.get(mon, {}).get('name', mon))

for n, d in [('weapons', W), ('armor', A), ('skills', SK)]:
    json.dump(d, open(OUT + n + '.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

print(f'mhn.quest 로 채운 세트 {len(done)}종 — 무기 {filled_w} · 방어구 {filled_a}  ({", ".join(done) or "없음"})')
if new_sk: print('스킬 설명 보강:', ', '.join(sorted(set(new_sk))))
if skipped: print('mhn.quest 에도 없어 예정 상태 유지:', ', '.join(skipped))
print('스킬 이름 매핑', len(zh2kind), '/', len(zh2ko))
