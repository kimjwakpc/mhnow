/* =========================================================================
   딜 계산 엔진 — 딜계산_메크로버젼.xlsm '계산' 시트 로직 이식
   -------------------------------------------------------------------------
   검증 벡터 (엑셀 캐시값):
     공 3233 / 속 0 / 회 -0.4, 흉회심 Lv1
     → 총회 -0.5, 일반 1616.5, 흉회심 727.425, 역회심 848.6625, 최종딜 3192.5875
   ========================================================================= */

/* 그룹 정의
   A  물리 곱연산   : 총공 = 무기공 × (1 + ΣA) + ΣB
   B  물리 가산
   F  물리 최종추가 : 총공 × (1 + ΣF)
   C  속성 곱연산   : 총속 = 속성 × (1 + ΣC) + ΣD
   D  속성 가산
   E  속성 최종곱   : 총속 × (1 + ΣE)
   G  최종 곱연산   : 최종딜 = 합계 × (1 + ΣG)
   CRIT       회심률 가산
   CRIT_MULT  슈퍼회심 (회심 배율 가산)
   BRUTAL     흉회심 (배율 + 회심률 감소)
   CRIT_ELEM  회심격【속성】 (회심 분기 속성 곱연산에만 적용)
*/

// kind → { g:그룹, i:effectAmount 인덱스, s:배율(0.01=%), corr:기본 보정계수, also:[추가효과] }
const SKILL_CFG = {
  // ---- A : 물리 곱연산 ----
  BURST:                      { g:'A', i:2, s:0.01, corr:1 },      // 연격
  BURST_SECRET:               { g:'A', i:0, s:0.01, corr:1 },      // 연격·경지
  JUST_CHARGE:                { g:'A', i:0, s:0.01, corr:1 },      // 저스트 모으기 해방

  // ---- B : 물리 가산 ----
  ATTACK_BOOST:               { g:'B', i:0, s:1, corr:1 },         // 공격
  ATTACK_BOOST_SECRET:        { g:'B', i:0, s:1, corr:1 },         // 공격·경지
  BRAVERY:                    { g:'B', i:0, s:1, corr:0.6 },       // 용맹
  ATTACK_UP_CRITICAL_DOWN:    { g:'B', i:0, s:1, corr:1,           // 전심전력
                                also:[{ g:'CRIT', i:2, s:-0.01, corr:1 }] },
  MULTI_ATTACK_BOOST:         { g:'B', i:0, s:1, corr:1 },         // 그룹 사냥 강화【공격】
  OFFENSIVE_GUARD:            { g:'A', i:0, s:0.01, corr:1 },      // 공격적인 방어
  FORTIFY:                    { g:'A', i:0, s:0.01, corr:1 },      // 불굴
  POWERHOUSE:                 { g:'F', i:0, s:0.01, corr:1 },      // 공격 활성 (물리 최종곱)

  // ---- D : 속성 가산 ----
  FIRE_ATTACK:                { g:'D', i:0, s:1, corr:1, elem:'fire' },
  WATER_ATTACK:               { g:'D', i:0, s:1, corr:1, elem:'water' },
  THUNDER_ATTACK:             { g:'D', i:0, s:1, corr:1, elem:'thunder' },
  ICE_ATTACK:                 { g:'D', i:0, s:1, corr:1, elem:'ice' },
  DRAGON_ATTACK:              { g:'D', i:0, s:1, corr:1, elem:'dragon' },
  WATER_ATTACK_BOOST_SECRET:  { g:'D', i:1, s:1, corr:1, elem:'water' },
  THUNDER_ATTACK_BOOST_SECRET:{ g:'D', i:1, s:1, corr:1, elem:'thunder' },
  ICE_ATTACK_BOOST_SECRET:    { g:'D', i:1, s:1, corr:1, elem:'ice' },
  DRAGON_ATTACK_BOOST_SECRET: { g:'D', i:1, s:1, corr:1, elem:'dragon' },
  // 하이 차지 = eff[1] × (110 + 체력증강값)  ← 엑셀 R10: 220+체증×2
  HIGH_PERFORMANCE_FIRE:      { g:'D', i:1, s:1, corr:1, hicharge:true, elem:'fire' },
  HIGH_PERFORMANCE_WATER:     { g:'D', i:1, s:1, corr:1, hicharge:true, elem:'water' },
  HIGH_PERFORMANCE_THUNDER:   { g:'D', i:1, s:1, corr:1, hicharge:true, elem:'thunder' },
  HIGH_PERFORMANCE_ICE:       { g:'D', i:1, s:1, corr:1, hicharge:true, elem:'ice' },
  HIGH_PERFORMANCE_DRAGON:    { g:'D', i:1, s:1, corr:1, hicharge:true, elem:'dragon' },

  // ---- E : 속성 최종곱 ----
  CHARGE_MASTER:              { g:'C', i:0, s:0.01, corr:0.3 },    // 차지 마스터

  // ---- 회심격【속성】: 회심 분기 속성 곱연산 ----
  CRITICAL_ELEMENT:           { g:'CRIT_ELEM', i:0, s:0.01, corr:1 },

  // ---- 회심률 ----
  CRITICAL_EYE:               { g:'CRIT', i:0, s:0.01, corr:1 },   // 간파
  WEAKNESS_EXPLOIT:           { g:'CRIT', i:0, s:0.01, corr:1 },   // 약점 특효
  LATENT_POWER:               { g:'CRIT', i:0, s:0.01, corr:1 },   // 힘의 해방
  DEATHGARON:                 { g:'CRIT', i:0, s:0.01, corr:0.7 }, // 견인불발
  MORPH_ATTACK_BOOST:         { g:'G', i:0, s:0.01, corr:1,        // 변형 공격 강화
                                also:[{ g:'CRIT', i:1, s:0.01, corr:1 }] },
  POWERHOUSE_CRITICAL:        { g:'CRIT', i:0, s:0.01, corr:1 },   // 공격 증강【회심】

  // ---- 회심 배율 ----
  CRITICAL_BOOST:             { g:'CRIT_MULT', i:0, s:0.01, corr:1 },  // 슈퍼회심
  BRUTAL_STRIKE:              { g:'BRUTAL',    i:2, s:0.01, corr:1,    // 흉회심
                                also:[{ g:'CRIT', i:0, s:-0.01, corr:1 }] },

  // ---- G : 최종 곱연산 ----
  RESUSCITATE:                { g:'G', i:0, s:0.01, corr:0.7 },    // 돌파구
  COALESCENCE:                { g:'G', i:0, s:0.01, corr:0.7 },    // 전화위복
  BREAK_ATTACK_BOOST:         { g:'G', i:0, s:0.01, corr:0.6 },    // 추격
  FIGHTING_SPIRIT:            { g:'G', i:0, s:0.01, corr:0.53 },   // 투기 활성
  AIRBORNE:                   { g:'G', i:0, s:0.01, corr:0.4 },    // 비연
  POWER_BURST:                { g:'G', i:0, s:0.01, corr:1 },      // 진가 발휘
  MOVE_FORWARD_STRENGTHEN:    { g:'G', i:0, s:0.01, corr:1 },      // 매진
  MORPH_BOOST:                { g:'G', i:1, s:0.01, corr:1 },      // 체인지 부스트
  BURST_DODGER:               { g:'G', i:0, s:0.01, corr:1 },      // 저스트 교격【지속】
  PERFECT_EVADE_ATTACK_BOOST: { g:'G', i:0, s:0.01, corr:1 },      // 저스트 교격
  CRITICAL_RANGE_BOOST:       { g:'G', i:0, s:0.01, corr:1 },      // 적정 거리 위력 UP
  DISABLE_PERFECT_EVADE:      { g:'G', i:0, s:0.01, corr:1 },      // 과감
  BLOODBLIGHT_CLOAK:          { g:'G', i:0, s:0.01, corr:0.7 },    // 겁혈 망토

  // ---- 추가 매핑 (공식 스킬 설명 기준) ----
  // "공격력이 N 상승" → B(가산) / "공격력이 N% 상승" → A(곱연산) / "주는 대미지가 N% 증가" → G(최종곱)
  PEAK_PERFORMANCE:           { g:'B', i:0, s:1, corr:1 },         // 완전 충전
  RISING_TIDE:                { g:'B', i:0, s:1, corr:1 },         // 후발 주자
  HELLFIRE_CLOAK:             { g:'B', i:0, s:1, corr:0.5 },       // 귀화 망토
  HEROICS:                    { g:'A', i:0, s:0.01, corr:0.9 },    // 재난대처능력
  RESENTMENT:                 { g:'A', i:1, s:0.01, corr:0.85 },   // 앙심
  SNEAK_ATTACK:               { g:'G', i:0, s:0.01, corr:0.75 },   // 기습
  SP_UNDERCURRENT:            { g:'G', i:0, s:0.01, corr:0.8 },    // 무심
  HEAD_ON_FIGHT:              { g:'G', i:0, s:0.01, corr:0.5 },    // 불퇴전
  PURSUIT_POISON:             { g:'G', i:0, s:0.01, corr:0.27 },   // 추가 공격【독】
  PURSUIT_PARALYSIS:          { g:'G', i:0, s:0.01, corr:0.20 },   // 추가 공격【마비】
  PURSUIT_BLAST:              { g:'B', i:0, s:1, corr:1,        // 추가 공격【폭파】 — 폭파가 터질 때마다 공격력 +N (물리 가산)
                                rate:4, onv:10, cond:true },   // 발동률 = 한 전투에서 터지는 횟수. 평소 4회, 최대 10회
  BUILDUP_BOOST:              { g:'G', i:0, s:0.01, corr:0.33,     // 상태 이상 축적 시 위력 UP
                                rate:'ailment' },              // 발동률 = 축적 확률 (ailmentChance, 평소 기준). 상태 이상 무기가 아니면 0
  SPECIAL_BOOST:              { g:'G', i:0, s:0.01, corr:0 },      // 특수 스킬 위력 상승 (특수기 전용)
  SP_MOVE_BOOST_SECRET:       { g:'G', i:0, s:0.01, corr:1,        // 특수 스킬 위력 UP·경지
                                req:{ kind:'SPECIAL_BOOST', lv:5 } },  // 이름이 기초 스킬과 달라 선행 조건을 직접 지정
  SLEEP_ENHANCEMENT:          { g:'G', i:0, s:0.01, corr:0 },      // 각성의 일격
  ELDER_DRAGON_RESONANCE:     { g:'G', i:1, s:0.01, corr:0, cond:true },   // 사냥꾼의 결속 — 동료 수에 따라 달라짐
  NERGIGANTE_GREED:           { g:'G', i:0, s:0.01, corr:0, cond:false },  // 멸진룡의 갈망 — 상시 발동이라 조건부 아님
  ARTILLERY:                  { g:'G', i:0, s:0.01, corr:0 },      // 포술 (건랜스/차지액스)
  ARTILLERY_SECRET:           { g:'G', i:0, s:0.01, corr:1, rate:0 },   // 포술·경지 (선행 조건은 이름으로 자동 판별)
  ENDING_SHOT:                { g:'G', i:0, s:0.01, corr:0.25 },   // 라스트 샷
  ENHANCEMENT_SLICING_AMMO:   { g:'G', i:0, s:0.01, corr:0.4 },    // 참렬탄 강화
  ENHANCEMENT_NORMAL_AMMO:    { g:'G', i:0, s:0.01, corr:1 },      // 통상탄·속성 통상탄 강화
  CHARGE_UP:                  { g:'G', i:0, s:0.01, corr:0.2 },    // 유타·향음 강화
  CHARGE_STOCK:               { g:'G', i:0, s:0.01, corr:1 },      // 차지 스톡 (Lv1 은 수치 없음 → 0)
  // 속성 곱연산
  KUSHALA_BLESS:              { g:'E', i:0, s:0.01, corr:1, elem:'ice' , cond:true },      // 강룡의 얼음바람
  KIRIN_ROBE:                 { g:'E', i:0, s:0.01, corr:1, elem:'thunder' , cond:true },  // 환수의 벼락
  NAMIELLE_WAVE:              { g:'E', i:0, s:0.01, corr:1, elem:'water' , cond:true },    // 명룡의 파뢰
  MALZENO_BLOOD:              { g:'E', i:0, s:0.01, corr:1, elem:'dragon' , cond:true },   // 은작룡의 홍혈
  VELKHANA_ARMOR:             { g:'E', i:0, s:0.01, corr:1, elem:'ice' , cond:true },      // 빙룡의 얼음 갑옷
  SP_OVERDRIVE:               { g:'C', i:0, s:0.01, corr:0.5 },                // 속성 공격 증강【SP】
  // 상태이상 스킬(독/마비/수면/폭파 강화)은 축적치라 딜 계산에 넣지 않음

  // ---- 보조 ----
  HEALTH_BOOST:               { g:'HP', i:0, s:1, corr:1 },        // 체력 증강 (하이차지 연동)
};

/* ── 「경지」 계열 선행 조건 ─────────────────────────────
   공격·경지 는 공격 이 만렙(5)일 때만 발동한다. 연격·경지, 각 속성 강화·경지 도 동일.
   스킬 이름이 "○○·경지" 이면 "○○" 를 찾아 그 만렙을 자동으로 선행 조건으로 잡는다.
   → 새 경지 스킬이 추가돼도 별도 등록 없이 동작한다.
   SKILL_CFG 에 req:{kind, lv} 를 직접 넣으면 그 값이 우선한다. */
let _REQ_CACHE = null;
function secretReqs(S) {
  if (_REQ_CACHE && _REQ_CACHE.__src === S) return _REQ_CACHE;
  const flat = n => String(n).replace(/[\s·・]/g, '');
  const byName = {};
  Object.values(S).forEach(v => { byName[flat(v.name)] = v; });
  const req = { __src: S };
  Object.values(S).forEach(v => {
    const m = flat(v.name).match(/^(.+?)경지$/);
    if (!m) return;
    const base = byName[m[1]];
    if (base && base.kind !== v.kind) req[v.kind] = { kind: base.kind, lv: base.max };
  });
  _REQ_CACHE = req;
  return req;
}

/* 같은 그룹끼리 서로 곱해지는 그룹 (나머지는 합산)
   예) 강룡의 얼음바람 10% + 빙룡의 얼음 갑옷 10%
       → 1.20 이 아니라 1.10 × 1.10 = 1.21 */
const MULT_GROUPS = new Set(['E', 'F']);

/* 그룹 표시용 라벨 */
const GROUP_LABEL = {
  '': '딜 미반영', A: 'A 물리 곱연산(합)', B: 'B 물리 가산', F: 'F 물리 최종곱(곱)',
  C: 'C 속성 곱연산(합)', D: 'D 속성 가산', E: 'E 속성 최종곱(곱)', G: 'G 최종 곱연산(합)',
  CRIT: '회심률 가산', CRIT_MULT: '슈퍼회심', BRUTAL: '흉회심 배율',
  CRIT_ELEM: '회심격【속성】', HP: '체력 증강(보조)',
};

const ELEM_ORDER = ['fire','water','thunder','ice','dragon','poison','paralysis','sleep','blast','no'];

/* ── 스타일 강화 ───────────────────────────────────────────
   Lv0~20. Lv10/15/20 에서 물리(Attack)/속성(Element)/회심(Critical) 중 택1.
   무기별 레벨당 수치가 다르며 공식 가이드에는 공개되지 않음.
   STYLE_TABLE 에 무기 id(또는 무기 종류)별 표를 넣으면 자동 계산되고,
   없으면 사용자가 값을 직접 입력한다.
   표 형식: { <무기id 또는 catName>: { atk:[lv1..lv20], ele:[...], crit:[...],
              milestone:{ Attack:n, Element:n, Critical:n } } }
*/
function styleProfile(weaponId) {
  const T = (typeof window !== 'undefined' && window.__STYLES__) || null;
  if (!T || !weaponId) return null;
  return T.profiles[T.weapon[weaponId]] || null;
}
function styleBonus(st, weaponId) {
  if (!st) return { atk: 0, ele: 0, crit: 0, prof: null };
  const t = styleProfile(weaponId);
  if (!t) return { atk: +st.atk || 0, ele: +st.ele || 0, crit: (+st.crit || 0) / 100, prof: null };
  const lv = Math.max(0, Math.min(t.max || 20, st.lv | 0));
  const at = arr => lv ? (arr?.[lv - 1] ?? 0) : 0;
  let atk = at(t.atk), ele = at(t.ele), crit = at(t.crit);
  [['m10', 10], ['m15', 15], ['m20', 20]].forEach(([k, need]) => {
    if (lv < need || !st[k]) return;
    const v = (t.milestone || {})[st[k]] || 0;
    if (st[k] === 'Attack') atk += v; else if (st[k] === 'Element') ele += v; else crit += v;
  });
  return { atk, ele, crit: crit / 100, prof: t };
}

/**
 * @param {object} p
 *   p.attack   무기 공격력
 *   p.element  무기 속성값
 *   p.critical 무기 회심률 (0.3 = 30%, -0.4 = -40%)
 *   p.weaponElem  무기 속성 (fire/water/...)
 *   p.skills   { KIND: level }
 *   p.corr     { KIND: 보정계수 }  (미지정 시 기본값)
 *   p.style    { lv, m10, m15, m20, atk, ele, crit }  스타일 강화
 *   p.motion   모션값(%) — 0이면 미적용
 *   p.SKILLS   skills.json
 */
function calcDamage(p) {
  const S = p.SKILLS, sk = p.skills || {}, corrOv = p.corr || {};
  const acc = { A:0, B:0, C:0, D:0, E:0, F:0, G:0, CRIT:0, CRIT_MULT:0, BRUTAL:0, CRIT_ELEM:0, HP:0 };
  const mul = { E:1, F:1 };   // 곱연산 그룹 누적
  const contrib = [];         // 기여 내역 (UI 표시용)
  const blocked = [];         // 선행 조건 미충족으로 빠진 스킬
  const REQ = secretReqs(S);

  const hpLv = sk.HEALTH_BOOST || 0;
  const hpVal = hpLv ? S.HEALTH_BOOST.levels[hpLv-1].eff[0] : 0;
  acc.HP = hpVal;

  const CFG = (typeof window !== 'undefined' && window.__CFG__) || SKILL_CFG;

  function apply(kind, lv, cfg) {
    const def = S[kind];
    if (!def || lv < 1) return;
    const L = def.levels[Math.min(lv, def.max) - 1];
    if (!L) return;
    let raw = (L.eff[cfg.i] ?? 0) * cfg.s;
    if (cfg.hicharge) raw = (L.eff[1] ?? 0) * (110 + hpVal);
    // 속성 특화 스킬은 무기 속성이 일치할 때만
    if (cfg.elem && cfg.elem !== p.weaponElem) return;
    const c = corrOv[kind] ?? cfg.corr;
    const val = raw * c;
    if (MULT_GROUPS.has(cfg.g)) mul[cfg.g] *= (1 + val);   // 같은 군끼리 곱연산
    else acc[cfg.g] += val;
    contrib.push({ kind, name: def.name, lv, group: cfg.g, raw, corr: c, val,
                   mult: MULT_GROUPS.has(cfg.g) });
  }

  for (const [kind, lv] of Object.entries(sk)) {
    if (!lv) continue;
    const cfg = CFG[kind];
    // 「경지」류 선행 조건 — 딜 반영 여부와 무관하게 먼저 확인해 안내한다
    const need = (cfg && cfg.req) || REQ[kind];
    if (need && (sk[need.kind] || 0) < need.lv) {
      blocked.push({ kind, name: S[kind]?.name || kind, lv,
                     needKind: need.kind, needName: S[need.kind]?.name || need.kind,
                     needLv: need.lv, have: sk[need.kind] || 0 });
      continue;
    }
    if (!cfg || !cfg.g) continue;
    apply(kind, lv, cfg);
    (cfg.also || []).forEach(sub => apply(kind, lv, sub));
  }

  // 스타일 강화
  const stb = styleBonus(p.style, p.weaponId);
  acc.B += stb.atk; acc.D += stb.ele; acc.CRIT += stb.crit;

  // 곱연산 그룹 → 표시·계산용 실효 증가율로 환산  (1.10×1.10 → 0.21)
  acc.E = mul.E - 1;
  acc.F = mul.F - 1;

  const atk = Number(p.attack) || 0;
  const ele = Number(p.element) || 0;

  // 총회심률
  const critTotal = (Number(p.critical) || 0) + acc.CRIT;

  const totalAtk = (atk + atk * acc.A + acc.B) * (1 + acc.F);
  const totalEleBase = (c_extra) => (ele + ele * (acc.C + c_extra) + acc.D) * (1 + acc.E);

  const branch = (eleExtra, mult) => (totalAtk + totalEleBase(eleExtra)) * mult;

  // 회심 분기별 가중치 × 배율 (엑셀 C20/E20/G20/I20)
  const superCrit = acc.CRIT_MULT;         // 슈퍼회심
  const brutal    = acc.BRUTAL;            // 흉회심 배율 가산
  const w = {
    normal: critTotal >= 0 ? (1 - critTotal) : (1 + critTotal),
    crit:   critTotal >= 0 ? critTotal * (1.25 + superCrit) : 0,
    brutal: critTotal < 0 ? (-critTotal) * 0.3 * (1 + brutal) : 0,
    negCrit:critTotal < 0 ? (-critTotal) * 0.7 * 0.75 : 0,
  };

  const parts = {
    normal:  branch(0, w.normal),
    crit:    branch(acc.CRIT_ELEM, w.crit),
    brutal:  branch(0, w.brutal),
    negCrit: branch(0, w.negCrit),
  };

  const sum = parts.normal + parts.crit + parts.brutal + parts.negCrit;
  const finalDmg = sum * (1 + acc.G);
  const motion = Number(p.motion) || 0;

  return {
    acc, mul, contrib, blocked, critTotal, style: stb,
    base: { atk, ele, crit: Number(p.critical) || 0 },
    totalAtk,
    totalEle: totalEleBase(0),
    totalEleCrit: totalEleBase(acc.CRIT_ELEM),
    weights: w,
    parts,
    sum,
    finalDmg,
    motionDmg: motion ? finalDmg * motion / 100 : null,
  };
}

/* ---- 상태 이상 축적 확률 ----
   독·마비·수면·폭파 무기가 맞혔을 때 축적이 일어날 확률.
     기본                         1/3
     고룡 버프 (속성이 맞을 때)   Lv 당 1/9  (최대 Lv3 → 1/3)   염왕룡의 폭발가루 = 폭파, 하룡의 독 안개 = 독
     추가 공격【폭파】 (폭파 무기) Lv 당 1/15 (최대 Lv5 → 1/3)
     기습【상태 이상】 (뒤에서만)  Lv 당 2/15 (최대 Lv5 → 2/3)
   합계는 1(100%)을 넘지 않는다. */
const AILMENT_ELEMS = ['poison', 'paralysis', 'sleep', 'blast'];
const AILMENT_CHANCE = [
  { kind: 'TEOSTRA_BLESS',    per: 1 / 9,  frac: '1/9',  elem: 'blast' },
  { kind: 'CHAMELEOS_POISON', per: 1 / 9,  frac: '1/9',  elem: 'poison' },
  { kind: 'PURSUIT_BLAST',    per: 1 / 15, frac: '1/15', elem: 'blast' },
];
const AILMENT_SNEAK = { kind: 'ABNORMAL_STATUS_ENHANCEMENT', per: 2 / 15, frac: '2/15' };
function ailmentChance(elem, skills) {
  if (!AILMENT_ELEMS.includes(elem)) return null;
  const sk = skills || {}, base = 1 / 3;
  const parts = AILMENT_CHANCE.filter(c => c.elem === elem && sk[c.kind] > 0)
    .map(c => ({ kind: c.kind, lv: sk[c.kind], frac: c.frac, v: sk[c.kind] * c.per }));
  const normal = Math.min(1, base + parts.reduce((a, b) => a + b.v, 0));
  const sLv = sk[AILMENT_SNEAK.kind] || 0;
  const sneak = sLv ? { kind: AILMENT_SNEAK.kind, lv: sLv, frac: AILMENT_SNEAK.frac, v: sLv * AILMENT_SNEAK.per } : null;
  return { base, parts, normal, sneak, back: Math.min(1, normal + (sneak ? sneak.v : 0)) };
}

/* ---- 보우건 반동 · 리로드 — 반동 경감 / 장전 속도 스킬 (mhn.quest 와 같은 규칙) ----
   단계  반동: 0 소 · 1 중 · 2 대 · 3 특대 · 4 용격     리로드: 0 빠름 · 1 보통 · 2 조금 느림 · 3 느림
   스킬 Lv(최대 3)를 더한 점수로 새 단계를 찾는다:
     점수 = [10, 9, 7, 4, 0][단계] + 스킬Lv  →  [4,4,4,4,3,3,3,2,2,1,0,0,0,0][점수]
     예) 대(2) → Lv1 대 · Lv2 중 · Lv3 소        특대(3) → Lv3 에서 대
   헤비보우건 예외: 대/조금 느림(2) 에서 Lv3 일 때 확산탄 · 철갑유탄 · 관통탄, 용격탄(장전 2 이상),
   산탄(장전 7 이상), 참렬탄(리로드만) 은 소/빠름(0) 이 아니라 중/보통(1) 까지만 내려간다. */
const RECOIL_STEPS = ['소', '중', '대', '특대', '용격'];
const RELOAD_STEPS = ['빠름', '보통', '조금 느림', '느림'];
function bowgunStep(level, skillLv, kind, heavy, ammoCat, num) {
  const e = Math.max(0, Math.min(3, skillLv | 0));
  if (e === 0 || level == null || level < 0) return level;
  if (heavy && level === 2 && e === 3 && (['cluster', 'sticky', 'pierce'].includes(ammoCat)
      || (ammoCat === 'wyvern' && num >= 2) || (ammoCat === 'spread' && num >= 7)
      || (ammoCat === 'slicing' && kind === 'reload'))) return 1;
  return [4, 4, 4, 4, 3, 3, 3, 2, 2, 1, 0, 0, 0, 0][[10, 9, 7, 4, 0][level] + e];
}
/* 스킬 Lv 0~3 에서 단계가 바뀌는 지점만 — [{ lv, step }] (첫 칸은 Lv0 = 원래 단계) */
function bowgunLadder(level, kind, heavy, ammoCat, num) {
  const out = [{ lv: 0, step: level }];
  for (let e = 1; e <= 3; e++) {
    const st = bowgunStep(level, e, kind, heavy, ammoCat, num);
    if (st !== out[out.length - 1].step) out.push({ lv: e, step: st });
  }
  return out;
}

/* ---- 자체 검증 ---- */
function _selfTest(SKILLS) {
  const r = calcDamage({
    attack: 3233, element: 0, critical: -0.4, weaponElem: 'no',
    skills: { BRUTAL_STRIKE: 1 }, SKILLS,
  });
  const exp = { critTotal: -0.5, normal: 1616.5, brutal: 727.425, negCrit: 848.6625, final: 3192.5875 };
  const ok = (a, b) => Math.abs(a - b) < 1e-6;
  const pass = ok(r.critTotal, exp.critTotal) && ok(r.parts.normal, exp.normal)
    && ok(r.parts.brutal, exp.brutal) && ok(r.parts.negCrit, exp.negCrit)
    && ok(r.finalDmg, exp.final);
  return { pass, got: { critTotal: r.critTotal, ...r.parts, final: r.finalDmg }, exp };
}

if (typeof module !== 'undefined') module.exports = { calcDamage, ailmentChance, bowgunStep, bowgunLadder, RECOIL_STEPS, RELOAD_STEPS, SKILL_CFG, GROUP_LABEL, MULT_GROUPS, secretReqs, styleBonus, styleProfile, _selfTest };
