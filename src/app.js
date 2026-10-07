/* ============ 몬헌 나우 장비 세팅 — UI ============ */
const D = window.__DATA__;
const SKILLS = D.skills, WEAPONS = D.weapons, ARMOR = D.armor,
      DRIFT = D.driftstones, MONS = D.monsters, META = D.meta, RATES = D.rates;
window.__STYLES__ = D.styles;

/* ---- 스킬 매핑 오버라이드 (사용자가 고칠 수 있음) ---- */
const CFG_LS = 'mhnow_cfg_v1';
window.__CFG__ = JSON.parse(JSON.stringify(SKILL_CFG));
let CFG_OV = {};
try { CFG_OV = JSON.parse(localStorage.getItem(CFG_LS)) || {}; } catch (e) { }
function applyCfgOv() {
  window.__CFG__ = JSON.parse(JSON.stringify(SKILL_CFG));
  for (const [k, v] of Object.entries(CFG_OV)) {
    if (!v.g) { window.__CFG__[k] = { ...(window.__CFG__[k] || {}), g: '' }; continue; }
    window.__CFG__[k] = { ...(window.__CFG__[k] || { i: 0, s: 0.01, corr: 1 }), ...v };
  }
}
applyCfgOv();
const cfgOf = k => window.__CFG__[k];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = (n, d = 0) => (n == null || isNaN(n)) ? '—'
  : Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const PARTS = META.armorCategories, PARTNAME = META.armorCatNames;
const skName = k => SKILLS[k]?.name || k;
/* 출처·상태 뱃지 — 이벤트(나우칼) · 예정(손으로 적은 값) · 몬퀘(mhn.quest 수치) */
const badges = x => (x.event ? ' <span class="chip w">이벤트</span>' : '')
  + (x.pending ? ' <span class="chip a">예정</span>' : '')
  + (x.alt ? ' <span class="chip q" title="mhn.quest 데이터">몬퀘</span>' : '');

const ELEM_EMOJI = { no: '⚔️', fire: '🔥', water: '💧', thunder: '⚡', ice: '❄️',
  dragon: '🐉', poison: '☠️', paralysis: '⚡', sleep: '💤', blast: '💥' };

/* ---------- 상태 ---------- */
const S = {
  w: { id: null, gr: null, lv: 5, ovr: null },   // ovr = {atk, ele, crit} 직접 입력
  style: { lv: 0, m10: null, m15: null, m20: null, atk: 0, ele: 0, crit: 0 },
  a: {}, corr: {}, motion: 0,
  trig: {},   // 조건부 스킬: kind → 'on'(발동) | 'off'(미발동). 없으면 평균(발동률 그대로)
};
PARTS.forEach(p => S.a[p] = { id: null, gr: null, stones: [] });

/* ---------- 인덱스 ---------- */
const W_BY_ID = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
const A_BY_ID = Object.fromEntries(ARMOR.map(a => [a.id, a]));
const ARMOR_BY_PART = {};
PARTS.forEach(p => ARMOR_BY_PART[p] = ARMOR.filter(a => a.cat === p));
const DRIFT_BY_COLOR = Object.fromEntries(DRIFT.map(d => [d.color, d]));

// 세트(시리즈) 목록 — 몬스터 아이콘 포함
function seriesList(items) {
  const m = new Map();
  items.forEach(x => { if (!m.has(x.series)) m.set(x.series, { name: x.series, icon: x.icon, mon: x.mon, ssort: x.ssort ?? 9e9 }); });
  return [...m.values()].sort((a, b) => a.ssort - b.ssort);   // 게임 출시 순서
}
const W_SERIES = seriesList(WEAPONS), A_SERIES = seriesList(ARMOR);
// 딜 관련 스킬만 필터 후보로
const FILTER_SKILLS = Object.values(SKILLS).filter(s => !s.unknown).sort((a, b) => a.sort - b.sort);
/* 발동률 — 앞에 있는 것이 이긴다
     1. S.corr        이번 세팅에서 직접 고친 값 (집계 스킬 칸)
     2. CFG_OV.rate   스킬 매핑에서 저장한 값 (내보내기에 담긴다)
     3. SKILL_CFG.rate engine.js 에 박아 둔 값  ('ailment' = 지금 무기·스킬의 상태 이상 축적 확률에 연동)
     4. 나우칼 무기 종류별 표 → 공통 표
     5. SKILL_CFG.corr */
function defaultRateOf(k) {                    // S.corr 을 빼고 본 기본값
  const ov = CFG_OV[k];
  if (ov && ov.rate != null) return ov.rate;
  if (SKILL_CFG[k]?.rate === 'ailment') return linkedAilmentRate();
  if (SKILL_CFG[k]?.rate != null) return SKILL_CFG[k].rate;
  const ws = W_BY_ID[S.w.id];
  const byT = ws && RATES.byType[ws.cat];
  if (byT && byT[k] != null) return byT[k];
  if (RATES.default[k] != null) return RATES.default[k];
  return cfgOf(k)?.corr ?? 1;
}
/* 「상태 이상 축적 시 위력 UP」 발동률 — 축적이 일어나는 비율 = 평소 축적 확률 (뒤에서 공격은 빼고 본다).
   독·마비·수면·폭파 무기가 아니면 축적이 없으므로 0. 무기를 안 골랐으면 기본 1/3. */
function linkedAilmentRate() {
  const ws = weaponStats(); if (!ws) return 1 / 3;
  const a = ailmentChance(ws.elem, aggregate().capped);
  return a ? Math.round(a.normal * 1e4) / 1e4 : 0;
}
const isAilmentLinked = k => SKILL_CFG[k]?.rate === 'ailment' && CFG_OV[k]?.rate == null;
function baseCorrOf(k) {                       // 발동/미발동 버튼을 무시한 "평균" 값
  return S.corr[k] != null ? S.corr[k] : defaultRateOf(k);
}
/* 「발동」을 눌렀을 때 쓸 값 — 보통 1 이지만, 스택이 쌓이는 스킬은 최대 스택 수 */
const onValOf = k => CFG_OV[k]?.onv ?? SKILL_CFG[k]?.onv ?? 1;
/* 발동 / 미발동 / 평균 — 조건부 스킬만 대상. 'on'=항상 발동(1), 'off'=미발동(0), 없으면 평균 */
const TRIG = { ON: 'on', OFF: 'off' };
function corrOf(k) {
  const t = S.trig[k];
  if (t === TRIG.ON) return onValOf(k);
  if (t === TRIG.OFF) return 0;
  return baseCorrOf(k);
}
/* 「조건부」 판정 — 기본 발동률이 1이 아니면 조건부로 본다. 스킬 매핑에서 체크로 바꿀 수 있다. */
const RATE_NOT1 = (() => {
  const s = new Set();
  for (const [k, v] of Object.entries(RATES.default || {})) if (v !== 1) s.add(k);
  for (const m of Object.values(RATES.byType || {})) for (const [k, v] of Object.entries(m)) if (v !== 1) s.add(k);
  return s;
})();
const condDefault = k => (SKILL_CFG[k]?.cond != null)      // engine.js 에 적어 둔 값이 가장 우선
  ? !!SKILL_CFG[k].cond
  : (RATE_NOT1.has(k) || (SKILL_CFG[k]?.corr ?? 1) !== 1);
function condOf(k) {
  const ov = CFG_OV[k];
  return (ov && ov.cond != null) ? !!ov.cond : condDefault(k);
}

/* =========================================================
   모달 선택기
   ========================================================= */
let modalState = null;
/* 모달을 닫아도 검색·필터·스크롤 위치를 기억해 두었다가 다시 열면 복원한다 (새로고침 전까지) */
const MEMO = {};
let MODAL_SAVE = null;    // 닫힐 때 호출 — 필터·스크롤 저장
let MODAL_DIRTY = null;   // () => true 면 확인 안 한 선택이 있으므로 바깥 클릭·Esc 로 닫지 않음
function closeModal() {
  if (MODAL_SAVE) { try { MODAL_SAVE(); } catch (e) { } }
  MODAL_SAVE = MODAL_DIRTY = null;
  $('#modal-root').innerHTML = ''; modalState = null; document.body.style.overflow = '';
}
function softCloseModal() {            // 바깥 클릭 · Esc
  if (!$('#mo')) return;
  if (MODAL_DIRTY && MODAL_DIRTY()) { toast('확인하지 않은 선택이 있어 닫지 않았습니다 — ✕ 닫기로 닫으세요'); return; }
  closeModal();
}
function bindBackdrop() {
  // 입력칸에서 드래그하다 바깥에서 손을 떼는 경우는 닫지 않도록 — 누른 곳과 뗀 곳이 모두 바깥일 때만
  const mo = $('#mo'); let downOut = false;
  mo.onmousedown = e => { downOut = e.target === mo; };
  mo.onclick = e => { if (e.target === mo && downOut) softCloseModal(); downOut = false; };
}
const scrollOf = sel => { const e = $(sel); return e ? e.scrollTop : 0; };
const setScroll = (sel, y) => { const e = $(sel); if (e && y) e.scrollTop = y; };

function openPicker(cfg) {
  // cfg: { title, items, filters:[...], render(item), onPick(item), current }
  const f = { cat: null, series: null, elem: null, skill: '', q: '', qRaw: '', spec: [] };
  const mem = cfg.memo && MEMO[cfg.memo];
  if (mem) { Object.assign(f, mem.f); f.spec = (mem.f.spec || []).slice(); }
  modalState = f;
  document.body.style.overflow = 'hidden';
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal" id="mo">
    <div class="modal-in">
      <div class="modal-hd">
        <h3>${esc(cfg.title)}</h3>
        <span class="chip" id="mo-count"></span>
        <button class="btn gh" style="margin-left:auto" id="mo-x">✕ 닫기</button>
      </div>
      <div class="modal-bd">
        <div id="mo-filters"></div>
        <div class="fset"><div class="lbl">결과 <span class="clr" id="mo-clear">필터 전체 해제</span></div>
          <div class="plist" id="mo-list"></div></div>
      </div>
    </div></div>`;
  const fb = $('#mo-filters');

  const grid = (label, opts, key, big, parent) => {
    const d = document.createElement('div'); d.className = 'fset';
    d.innerHTML = `<div class="lbl">${label}</div><div class="igrid ${big ? 'lg' : ''}"></div>`;
    const g = d.querySelector('.igrid');
    opts.forEach(o => {
      const b = document.createElement('button');
      b.title = o.label;
      b.innerHTML = (o.icon ? `<img loading="lazy" src="${o.icon}" alt="">` : '')
        + (o.emoji ? `<span style="font-size:17px;line-height:1">${o.emoji}</span>` : '')
        + `<span>${esc(o.short ?? o.label)}</span>`;
      b.onclick = () => { f[key] = f[key] === o.value ? null : o.value; paintFilters(); draw(); };
      b.dataset.v = o.value;
      g.appendChild(b);
    });
    (parent || fb).appendChild(d);
  };

  if (cfg.filters.includes('wcat'))
    grid('무기 종류', META.weaponCategories.map(c => ({ value: c, label: c, short: c })), 'cat');
  // 속성·세트는 자리를 많이 먹어서 좁은 화면에서는 접어 둔다 (무기 종류는 그대로 보인다)
  const narrow = () => matchMedia('(max-width:700px)').matches;
  const moreLbl = [cfg.filters.includes('elem') && '속성', cfg.filters.includes('series') && '세트']
    .filter(Boolean).join(' · ');
  let more = null;
  if (moreLbl) {
    more = document.createElement('details');
    more.className = 'fset moredet';
    more.innerHTML = `<summary>${moreLbl}로 좁히기</summary>`;
    if (!narrow() || f.elem || f.series) more.open = true;
    fb.appendChild(more);
  }
  if (cfg.filters.includes('elem'))
    grid('속성', META.elements.map(e => ({ value: e, label: META.elementNames[e] || e,
      emoji: ELEM_EMOJI[e], short: (META.elementNames[e] || e).replace('속성', '') || '무' })), 'elem', false, more);
  // 세트 — 고른 무기 종류에 그 세트가 없으면 아예 보여 주지 않는다 (필터 영역이 짧아진다)
  const seriesBox = cfg.filters.includes('series') ? (more || fb).appendChild(document.createElement('div')) : null;
  function paintSeries() {
    if (!seriesBox) return;
    const src = f.cat ? seriesList(cfg.items.filter(x => x.catName === f.cat)) : (cfg.seriesSrc || W_SERIES);
    if (f.series && !src.some(x => x.name === f.series)) f.series = null;   // 안 보이는 세트 선택은 해제
    seriesBox.innerHTML = `<div class="fset"><div class="lbl">세트 (몬스터)
        <span class="note" style="font-weight:500;letter-spacing:0">${src.length}</span></div>
      <div class="igrid lg">${src.map(x => `<button title="${esc(x.name)}" data-v="${esc(x.name)}">${
        x.icon ? `<img loading="lazy" src="${esc(x.icon)}" alt="">` : ''
      }<span>${esc(x.name.replace(' 세트', ''))}</span></button>`).join('')}</div></div>`;
    seriesBox.querySelectorAll('button[data-v]').forEach(b => b.onclick = () => {
      f.series = f.series === b.dataset.v ? null : b.dataset.v; paintFilters(); draw();
    });
  }

  // 고유 정보(탄종·화살·사냥벌레) — 고른 무기 종류에 맞는 묶음만 다시 그린다
  const specBox = cfg.filters.includes('spec') ? fb.appendChild(document.createElement('div')) : null;
  function paintSpec() {
    if (!specBox) return;
    const groups = SPEC_GROUPS.filter(g => !f.cat || g.cats.includes(f.cat))
      .map(g => ({ ...g, opts: specOpts(g, f.cat) })).filter(g => g.opts.length);
    f.spec = f.spec.filter(t => groups.some(g => g.opts.includes(t)));   // 안 보이는 묶음의 선택은 해제
    // 값이 많은 묶음(선율 36종 등)은 접어 둔다 — 결과 목록이 화면 아래로 밀리지 않게
    const inner = groups.map(g => {
      const chips = `<div class="igrid txt specgrid">${g.opts.map(o =>
        `<button class="${f.spec.includes(o) ? 'on' : ''}" data-spec="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
      const picked = g.opts.filter(o => f.spec.includes(o));
      if (g.opts.length <= 12) return `<div class="fset"><div class="lbl">${esc(g.label)}</div>${chips}</div>`;
      return `<details class="fset specdet"${picked.length ? ' open' : ''}><summary>${esc(g.label)} ${g.opts.length}종${
        picked.length ? ` — <b style="color:var(--accent)">${esc(picked.join(', '))}</b>` : ''}</summary>${chips}</details>`;
    }).join('');
    // 무기 종류를 고르면 그 묶음만 바로 보여 주고, 아니면 접어 둔다 (결과가 아래로 밀리지 않게)
    specBox.innerHTML = f.cat ? inner
      : `<details class="fset specdet"${f.spec.length ? ' open' : ''}><summary>탄종 · 화살 · 사냥벌레 · 선율 · 포격 · 병으로 찾기</summary>${inner}</details>`;
    specBox.querySelectorAll('[data-spec]').forEach(b => b.onclick = () => {
      const t = b.dataset.spec, g = tagGroup(t);
      f.spec = f.spec.includes(t) ? f.spec.filter(x => x !== t)
        : f.spec.filter(x => tagGroup(x) === g).concat(t);   // 다른 묶음을 고르면 이전 선택은 비운다
      paintSpec(); draw();
    });
  }

  const d2 = document.createElement('div'); d2.className = 'fset';
  d2.innerHTML = `<div class="lbl">스킬 · 이름</div><div class="row">
    <div><select id="mo-skill"></select></div>
    <div><input type="text" id="mo-q" placeholder="이름 · 탄종 · 선율 검색"></div></div>`;
  fb.prepend(d2);          // 가장 많이 쓰는 칸이라 맨 위로 — 폰에서 아이콘 그리드에 묻히지 않게
  /* 스킬 목록은 「지금 고를 수 있는 것」만 — 무기는 72종만 가지고 있어서 전체 136종을 늘어놓으면
     절반 이상이 눌러도 0개가 나온다. 무기 종류를 고르면 거기에 있는 스킬로 한 번 더 좁힌다. */
  function paintSkillSel() {
    const sel = $('#mo-skill'); if (!sel) return;
    const pool = f.cat ? cfg.items.filter(x => x.catName === f.cat) : cfg.items;
    const cnt = {};
    pool.forEach(x => (x.skAll || []).forEach(k => { if (SKILLS[k]) cnt[k] = (cnt[k] || 0) + 1; }));
    const list = Object.keys(cnt).sort((a, b) => (SKILLS[a].sort ?? 0) - (SKILLS[b].sort ?? 0));
    if (f.skill && !cnt[f.skill]) f.skill = '';          // 지금 목록에 없는 스킬 선택은 해제
    sel.innerHTML = `<option value="">스킬 전체 (${list.length}종)</option>` + list.map(k =>
      `<option value="${k}">${esc(skName(k))} · ${cnt[k]}</option>`).join('');
    sel.value = f.skill || '';
  }
  // 기억한 세트가 이 목록에 없으면 paintSeries 가 해제한다
  $('#mo-q').value = f.qRaw || '';
  $('#mo-skill').onchange = e => { f.skill = e.target.value; draw(); };
  $('#mo-q').oninput = e => { f.qRaw = e.target.value; f.q = e.target.value.trim().toLowerCase(); draw(); };

  function paintFilters() {
    paintSeries(); paintSkillSel();
    if (more) {                                   // 접어 둔 줄에 지금 고른 값을 보여 준다
      const pick = [f.elem && (META.elementNames[f.elem] || f.elem), f.series].filter(Boolean).join(' · ');
      more.querySelector('summary').innerHTML = `${esc(moreLbl)}로 좁히기${
        pick ? ` — <b style="color:var(--accent)">${esc(pick)}</b>` : ''}`;
    }
    fb.querySelectorAll('.igrid:not(.specgrid)').forEach((g, i) => {
      const keys = cfg.filters.filter(x => x !== 'skill');
      g.querySelectorAll('button').forEach(b => {
        const k = keys[i] === 'wcat' ? 'cat' : keys[i];
        b.classList.toggle('on', f[k] === b.dataset.v);
      });
    });
    paintSpec();
  }
  function draw() {
    const list = cfg.items.filter(x => cfg.match(x, f));
    $('#mo-count').textContent = list.length + '개';
    $('#mo-list').innerHTML = list.slice(0, 300).map(cfg.render).join('')
      || '<div class="empty">조건에 맞는 항목이 없습니다.</div>';
    $('#mo-list').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
      cfg.onPick(b.dataset.pick); closeModal();
    });
  }
  $('#mo-x').onclick = closeModal;
  $('#mo-clear').onclick = () => { f.cat = f.series = f.elem = null; f.skill = ''; f.q = ''; f.qRaw = ''; f.spec = [];
    $('#mo-q').value = ''; paintFilters(); draw(); };
  bindBackdrop();
  if (cfg.memo) MODAL_SAVE = () => { MEMO[cfg.memo] = { f: { ...f }, y: scrollOf('#mo .modal-bd') }; };
  paintFilters(); draw();
  if (mem) setScroll('#mo .modal-bd', mem.y);
}

/* ── 무기 고유 정보 → 검색 태그 ─────────────────────────────
   탄종은 속성 차이를 무시하고 기본 탄종으로 묶는다.
     확산화염탄 → 확산탄 · 관통빙결탄 → 관통탄 · 빙결탄/수냉탄/멸룡탄 → 통상탄
   화살은 Lv 를 떼고(관통화살 Lv4 → 관통화살), 사냥벌레는 · 로 나눈다. */
const AMMO_ELEM = /화염|수냉|전격|빙결|멸룡/g;
function ammoBase(name) {
  const s = String(name).replace(/^LV\s*\d+/i, '').replace(/\s+/g, '').replace(AMMO_ELEM, '');
  return s === '탄' ? '통상탄' : s;
}
const SPEC_ORDER = {
  AMMO: ['통상탄', '관통탄', '산탄', '확산탄', '참렬탄', '철갑유탄', '용격탄', '독탄', '마비탄', '수면탄'],
  ARROW: ['연사화살', '관통화살', '확산화살'],
  KINSECT: ['비상형', '공투형', '가루형', '퀵', '스태미나', '파워', '절단', '타격'],
  SHELL: ['일반형', '방사형', '확산형'],
  PHIAL: ['강격병', '강속성병', '유탄병', '멸기병', '독병', '마비병', '멸룡병'],
};
/* 선율은 36가지라 목록을 손으로 적지 않고 종류별로 묶어 정렬한다 */
const MELODY_RANK = [/^공격력 ?UP/, /^속성치 ?UP/, /^회심률 ?UP/, /^특수 게이지/, /속성 공격력 ?UP$/,
                     /^고주충격파/, /^정령왕/, /^방어력 ?UP/, /내성 ?UP$/, /보호/, /무효/];
const melodyRank = t => { const i = MELODY_RANK.findIndex(r => r.test(t)); return i < 0 ? 98 : i; };
const ordIdx = (arr, t) => (arr.indexOf(t) + 1 || 99);
const _tagCache = new Map();
function specTags(w) {
  if (_tagCache.has(w.id)) return _tagCache.get(w.id);
  const sp = w.spec; let t = [];
  if (sp && sp.kind === 'AMMO') t = [...new Set((sp.rows || []).map(r => ammoBase(r.n)))];
  else if (sp && sp.kind === 'ARROW') t = [...new Set((sp.list || []).map(x => String(x).replace(/\s*Lv\s*\d+\s*$/i, '').trim()))];
  else if (sp && sp.kind === 'KINSECT') t = String(sp.text || '').split('·').map(x => x.trim()).filter(Boolean);
  else if (sp && sp.kind === 'MELODY') t = [...new Set((sp.list || []).map(x => String(x).trim()).filter(Boolean))];
  else if (sp && sp.kind === 'SHELL') t = [String(sp.text || '').trim()].filter(Boolean);
  // 병 타입은 뒤에 붙는 설명을 뗀다 — "독병 · 검 모드 속성 +571" → "독병"
  else if (sp && sp.kind === 'PHIAL') t = [String(sp.text || '').split('·')[0].trim()].filter(Boolean);
  t.sort(specCmp(sp && sp.kind));
  _tagCache.set(w.id, t);
  return t;
}
/* 묶음별 정렬 규칙 */
function specCmp(kind) {
  const ord = SPEC_ORDER[kind] || [];
  if (kind === 'MELODY') return (a, b) => melodyRank(a) - melodyRank(b) || a.localeCompare(b, 'ko');
  return (a, b) => ordIdx(ord, a) - ordIdx(ord, b) || a.localeCompare(b, 'ko');
}
/* 무기 종류별 묶음 — 고른 무기 종류에 맞는 것만 보여 준다 */
const SPEC_GROUPS = [
  { kind: 'AMMO', label: '탄종 (속성 구분 없음)', cats: ['라이트보우건', '헤비보우건'] },
  { kind: 'ARROW', label: '화살 타입', cats: ['활'] },
  { kind: 'KINSECT', label: '사냥벌레', cats: ['조충곤'] },
  { kind: 'MELODY', label: '선율 효과', cats: ['수렵피리'] },
  { kind: 'SHELL', label: '포격 타입', cats: ['건랜스'] },
  { kind: 'PHIAL', label: '병 타입', cats: ['슬래시액스', '차지액스'] },
];
/* 고를 수 있는 값은 「지금 고른 무기 종류」 기준으로 뽑는다 —
   슬래시액스를 골랐을 때 차지액스에만 있는 유탄병이 뜨지 않게 */
const _optCache = new Map();
function specOpts(g, cat) {
  const key = g.kind + '|' + (cat || '*');
  if (_optCache.has(key)) return _optCache.get(key);
  const set = new Set();
  WEAPONS.forEach(w => {
    if (!w.spec || w.spec.kind !== g.kind) return;
    if (cat ? w.catName !== cat : !g.cats.includes(w.catName)) return;
    specTags(w).forEach(t => set.add(t));
  });
  const out = [...set].sort(specCmp(g.kind));
  _optCache.set(key, out);
  return out;
}
const tagGroup = t => SPEC_GROUPS.find(g => specOpts(g, null).includes(t));

/* ---------- 무기 선택 ---------- */
function pickWeapon() {
  openPicker({
    title: '무기 선택', items: WEAPONS, filters: ['wcat', 'elem', 'series', 'spec'], seriesSrc: W_SERIES, memo: 'weapon',
    match: (w, f) => (!f.cat || w.catName === f.cat) && (!f.elem || w.elem === f.elem)
      && (!f.series || w.series === f.series) && (!f.skill || w.skAll.includes(f.skill))
      && (!f.spec.length || f.spec.some(t => specTags(w).includes(t)))   // 하나만 있어도 통과 (중복 검색)
      && (!f.q || (w.final + w.base + w.series + specTags(w).join(' ') + specShort(w)).toLowerCase().includes(f.q)),
    render: w => { const g = w.g[w.g.length - 1], L = g.lv[4];
      return `<button class="pitem ${S.w.id === w.id ? 'on' : ''}" data-pick="${w.id}" data-tip="w|${w.id}">
        <span class="ic">${w.img ? `<img loading="lazy" src="${w.img}">` : (w.icon ? `<img loading="lazy" src="${w.icon}">` : '')}</span>
        <span class="tx"><b>${esc(w.final)}${badges(w)}</b><em>${w.catName} · ${esc(w.series)} · ${META.elementNames[w.elem] || '무속성'}${specShort(w) ? ' · ' + esc(specShort(w)) : ''}</em></span>
        <span class="st"><b>${fmt(L[0])}</b>${L[1] ? '속 ' + fmt(L[1]) : ''}${L[2] ? ' 회 ' + L[2] + '%' : ''}</span>
      </button>`; },
    onPick: id => { S.w.id = id; S.w.gr = null; S.w.lv = 5;
      S.w.ovr = W_BY_ID[id]?.pending ? { atk: 0, ele: 0, crit: 0 } : null;
      renderWeapon(); render(); },
  });
}

function weaponStats() {
  const w = W_BY_ID[S.w.id]; if (!w) return null;
  const g = w.g.find(x => x.gr === S.w.gr) || w.g[w.g.length - 1];
  const L = g.lv[S.w.lv - 1] || g.lv[4];
  const o = S.w.ovr;
  return { w, g,
    atk: o ? (+o.atk || 0) : L[0],
    ele: o ? (+o.ele || 0) : L[1],
    crit: o ? (+o.crit || 0) / 100 : L[2] / 100,
    elem: w.elem, name: g.name, series: w.series, catName: w.catName, img: w.img, sk: g.sk };
}

function renderWeapon() {
  const w = W_BY_ID[S.w.id], slot = $('#slot-w'), ctl = $('#w-sub-ctl');
  if (!w) {
    slot.className = 'slot empty'; delete slot.dataset.tip;
    slot.innerHTML = `<span class="ico"><span class="ph">무기</span></span>
      <span class="tx"><b>무기를 선택하세요</b><em>종류 · 세트 · 속성 · 스킬로 찾기</em></span><span class="rt"></span>`;
    ctl.innerHTML = ''; $('#w-sub').textContent = ''; renderSpec(null); renderStyle(); return;
  }
  if (S.w.gr == null) S.w.gr = w.g[w.g.length - 1].gr;
  const st = weaponStats();
  slot.className = 'slot'; slot.dataset.tip = 'wsel';
  slot.innerHTML = `<span class="ico">${w.img ? `<img src="${w.img}">` : (w.icon ? `<img src="${w.icon}">` : '')}</span>
    <span class="tx"><b>${esc(st.name)}${badges(w)}</b><em>${w.catName} · ${esc(w.series)} · ${META.elementNames[w.elem] || '무속성'}</em></span>
    <span class="rt wrt">${weaponRtInner()}</span>`;
  ctl.innerHTML = `<span class="mini">등급</span>
    <select class="sm" id="w-gr" style="width:auto">${w.g.map(g => `<option value="${g.gr}"${g.gr === S.w.gr ? ' selected' : ''}>G${g.gr}</option>`).join('')}</select>
    <span class="mini">레벨</span>
    <select class="sm" id="w-lv" style="width:auto">${[1, 2, 3, 4, 5].map(i => `<option value="${i}"${i === S.w.lv ? ' selected' : ''}>Lv${i}</option>`).join('')}</select>
    ${st.sk.length ? st.sk.map(([k, l]) => `<span class="chip a">${esc(skName(k))} ${l}</span>`).join('') : ''}`;
  if (w.pending || S.w.ovr) {
    const o = S.w.ovr || { atk: st.atk, ele: st.ele, crit: st.crit * 100 };
    ctl.insertAdjacentHTML('beforeend',
      `<div style="flex-basis:100%;height:0"></div>
       <span class="mini">${w.pending ? '수치 미공개 — 직접 입력' : '스탯 직접 입력'}</span>
       <input class="sm" type="number" id="ov-atk" style="width:86px" placeholder="공격" value="${o.atk || ''}">
       <input class="sm" type="number" id="ov-ele" style="width:86px" placeholder="속성" value="${o.ele || ''}">
       <input class="sm" type="number" id="ov-crit" style="width:80px" placeholder="회심%" value="${o.crit || ''}">
       ${w.pending ? '' : '<button class="btn sm gh" id="ov-off">해제</button>'}`);
    ['atk', 'ele', 'crit'].forEach(k => $('#ov-' + k).oninput = e => {
      S.w.ovr = { ...(S.w.ovr || { atk: 0, ele: 0, crit: 0 }), [k]: Number(e.target.value) || 0 };
      render();   // render() 가 슬롯 오른쪽 수치도 갱신
    });
    const off = $('#ov-off'); if (off) off.onclick = () => { S.w.ovr = null; renderWeapon(); render(); };
  }
  $('#w-gr').onchange = e => { S.w.gr = Number(e.target.value); renderWeapon(); render(); };
  $('#w-lv').onchange = e => { S.w.lv = Number(e.target.value); renderWeapon(); render(); };
  $('#w-sub').textContent = `${w.catName} · G${S.w.gr} Lv${S.w.lv}` + (w.event ? ' · 이벤트 무기(나우칼 데이터)' : '')
    + (w.pending ? ' · 패치 예정 · 수치 미공개' : '') + (w.alt ? ' · 공식 미등재 · mhn.quest 수치' : '');
  renderSpec(w);
  renderStyle();
}

/* 무기 슬롯 오른쪽 — 무기 자체 수치 | 스타일 강화까지 더한 수치 */
function weaponRtInner() {
  const st = weaponStats(); if (!st) return '';
  const b = styleBonus(S.style, S.w.id), prof = styleProfile(S.w.id);
  const pct = x => (x * 100).toFixed(0) + '%';
  const d = (v, f = fmt) => v ? `<i class="dlt">${v > 0 ? '+' : '−'}${f(Math.abs(v))}</i>` : '';
  const line2 = (ele, crit, de, dc) => [ele || de ? `속 ${fmt(ele)}${d(de)}` : '', crit || dc ? `회 ${pct(crit)}${d(dc, pct)}` : '']
    .filter(Boolean).join(' ');
  const any = b.atk || b.ele || b.crit;
  const lbl = prof ? `스타일 Lv${Math.min(S.style.lv | 0, prof.max || 20)}` : '스타일 직접 입력';
  return `<span class="rc"><span class="rl">무기</span><b>${fmt(st.atk)}</b>${line2(st.ele, st.crit)}</span>
    <span class="rc sty${any ? '' : ' zero'}"><span class="rl">${lbl}</span><b>${fmt(st.atk + b.atk)}${d(b.atk)}</b>${
      line2(st.ele + b.ele, st.crit + b.crit, b.ele, b.crit)}</span>`;
}

/* ---------- 무기 종류별 고유 정보 (탄종 / 병 / 포격 / 선율 / 화살 / 사냥벌레) ---------- */
function specShort(w) {
  const s = w && w.spec; if (!s) return '';
  if (s.kind === 'AMMO') return s.rows.slice(0, 3).map(r => r.n).join(', ') + (s.rows.length > 3 ? ` 외 ${s.rows.length - 3}` : '');
  if (s.list) return s.list.join(', ');
  return s.text || '';
}
function renderSpec(w) {
  const box = $('#spec-box'), card = $('#card-spec');
  const s = w && w.spec;
  if (!s) { card.classList.add('hide'); return; }
  card.classList.remove('hide');
  $('#spec-label').textContent = s.label;
  if (s.kind === 'AMMO') {
    box.innerHTML = `<table><thead><tr><th>탄종</th><th class="n">장전수</th><th>반동</th><th>리로드</th></tr></thead>
      <tbody>${s.rows.map(r => `<tr>
        <td>${r.color ? `<span class="dot" style="background:${esc(r.color)};margin-right:6px"></span>` : ''}${esc(r.n)}</td>
        <td class="n">${esc(r.c)}</td><td>${esc(r.r)}</td><td>${esc(r.l)}</td></tr>`).join('')}</tbody></table>`;
  } else if (s.list) {
    box.innerHTML = s.list.length
      ? s.list.map(x => `<span class="chip a" style="margin:0 4px 4px 0">${esc(x)}</span>`).join('')
      : '<span class="muted">없음</span>';
  } else {
    box.innerHTML = `<div style="font-size:15px;font-weight:600">${esc(s.text || '—')}</div>`;
  }
}

/* ---------- 스타일 강화 ---------- */
const MSTONE = [['m10', 10], ['m15', 15], ['m20', 20]];
const MS_LABEL = { Attack: '물리', Element: '속성', Critical: '회심' };
function renderStyle() {
  const box = $('#stylebox'), w = W_BY_ID[S.w.id];
  if (!w) { $('#style-src').textContent = ''; box.innerHTML = '<div class="muted">무기를 먼저 선택하세요.</div>'; return; }
  const prof = styleProfile(S.w.id);
  const max = prof ? (prof.max || 20) : 20;
  const inferred = (D.styles.inferred || []).includes(w.id);
  $('#style-src').innerHTML = prof
    ? `<span style="color:var(--good)">가능</span>${inferred
        ? ' <span class="chip w" title="나우칼에 아직 이 무기가 없어 같은 세트·같은 속성 무기의 수치를 그대로 씁니다">세트 기준</span>' : ''}`
    : '불가능';
  if (S.style.lv > max) S.style.lv = max;
  const b = styleBonus(S.style, S.w.id);
  const choices = prof ? Object.keys(prof.milestone) : ['Attack', 'Element', 'Critical'];
  box.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:9px">
      <span class="reslabel">스타일 Lv</span>
      <strong style="font-size:23px">${S.style.lv}</strong>
      <span style="margin-left:auto;font-size:12px" class="note">
        공 <b style="color:var(--txt)">+${fmt(b.atk)}</b> ·
        속 <b style="color:var(--txt)">+${fmt(b.ele)}</b> ·
        회 <b style="color:var(--txt)">+${(b.crit * 100).toFixed(0)}%</b></span>
    </div>
    <input type="range" min="0" max="${max}" step="1" value="${S.style.lv}" id="st-lv">
    ${!choices.length ? '<p class="note">이 무기는 마일스톤 선택이 없습니다.</p>'
      : MSTONE.map(([k, need]) => `<div class="mstone">
        <span class="t">Lv${need}</span>
        <span class="opts">${choices.map(c =>
          `<button data-ms="${k}" data-c="${c}" class="${S.style[k] === c ? 'on' : ''}"
            ${S.style.lv < need ? 'disabled' : ''}>${MS_LABEL[c]}${prof ? ` +${prof.milestone[c]}` : ''}</button>`).join('')}</span>
      </div>`).join('')}
    ${prof ? '' : `<div class="row" style="margin-top:11px">
      <div><label class="f">공격 +</label><input class="sm" type="number" id="st-atk" value="${S.style.atk}"></div>
      <div><label class="f">속성 +</label><input class="sm" type="number" id="st-ele" value="${S.style.ele}"></div>
      <div><label class="f">회심 +%</label><input class="sm" type="number" id="st-crit" value="${S.style.crit}"></div>
    </div>
    <p class="note" style="margin:8px 0 0">이 무기는 스타일 강화 표가 없습니다. 값을 직접 넣으세요.</p>`}`;
  $('#st-lv').oninput = e => { S.style.lv = Number(e.target.value); renderStyle(); render(); };
  box.querySelectorAll('[data-ms]').forEach(b => b.onclick = e => {
    const k = e.currentTarget.dataset.ms, c = e.currentTarget.dataset.c;
    S.style[k] = S.style[k] === c ? null : c; renderStyle(); render();
  });
  ['atk', 'ele', 'crit'].forEach(k => { const i = $('#st-' + k); if (i) i.oninput = e => { S.style[k] = Number(e.target.value) || 0; render(); }; });
}

/* ---------- 방어구 ---------- */
function renderArmor() {
  const box = $('#armor-box'); box.innerHTML = '';
  PARTS.forEach(p => {
    const st = S.a[p], a = A_BY_ID[st.id];
    const row = document.createElement('div'); row.className = 'gearrow';
    if (!a) {
      row.innerHTML = `<button class="slot empty" data-ap="${p}">
        <span class="ico"><span class="ph">${PARTNAME[p]}</span></span>
        <span class="tx"><b>${PARTNAME[p]} 선택</b><em>세트 · 스킬로 찾기</em></span><span class="rt"></span></button>`;
    } else {
      if (st.gr == null) st.gr = a.g[a.g.length - 1].gr;
      const g = a.g.find(x => x.gr === st.gr) || a.g[a.g.length - 1];
      row.innerHTML = `<button class="slot" data-ap="${p}" data-tip="asel|${p}">
        <span class="ico">${a.icon ? `<img src="${a.icon}">` : `<span class="ph">${PARTNAME[p]}</span>`}</span>
        <span class="tx"><b>${esc(a.series)} · ${PARTNAME[p]}${badges(a)}</b>
          <em>${g.sk.map(([k, l]) => skName(k) + ' ' + l).join(' · ') || '스킬 없음'}</em></span>
        <span class="rt"><b>G${g.gr}</b>방어 ${g.def[4] || '—'}</span></button>
        <div class="gearsub">
          <span class="mini">등급</span>
          <select class="sm" data-agr="${p}" style="width:auto">${a.g.map(x =>
            `<option value="${x.gr}"${x.gr === st.gr ? ' selected' : ''}>G${x.gr}</option>`).join('')}</select>
          <span class="mini">표류석 ${g.slot}칸</span>
          ${Array.from({ length: g.slot }, (_, i) => stoneBtn(p, i)).join('')}
          ${g.slot === 0 ? '<span class="note">이 등급은 슬롯 없음</span>' : ''}
        </div>`;
    }
    box.appendChild(row);
  });
  const nSel = PARTS.filter(p => S.a[p].id).length, nSlot = totalSlots();
  const nStone = PARTS.reduce((n, p) => n + (S.a[p].stones || []).filter(Boolean).length, 0);
  $('#armor-sub').textContent = nSel ? `${nSel}/5 부위 · 표류석 ${nStone}/${nSlot}칸` : '';
  box.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => pickArmor(b.dataset.ap));
  box.querySelectorAll('[data-agr]').forEach(s => s.onchange = e => {
    const p = e.target.dataset.agr; S.a[p].gr = Number(e.target.value);
    const a = A_BY_ID[S.a[p].id], g = a.g.find(x => x.gr === S.a[p].gr);
    S.a[p].stones.length = g.slot; renderArmor(); render();
  });
  box.querySelectorAll('[data-stone]').forEach(b => b.onclick = () => {
    const [p, i] = b.dataset.stone.split('|'); pickStone(p, Number(i));
  });
}
function stoneBtn(p, i) {
  const s = S.a[p].stones[i];
  const label = s ? `${s.color[0]} ${skName(s.kind)}` : '＋ 표류석';
  return `<button class="btn sm ${s ? '' : 'gh'}" data-stone="${p}|${i}"
    style="${s ? 'border-color:var(--accent2)' : ''}">${esc(label)}</button>`;
}

function pickArmor(part) {
  openPicker({
    title: PARTNAME[part] + ' 방어구 선택', items: ARMOR_BY_PART[part],
    filters: ['series'], seriesSrc: seriesList(ARMOR_BY_PART[part]), memo: 'armor',   // 부위끼리 필터 공유
    match: (a, f) => (!f.series || a.series === f.series) && (!f.skill || a.skAll.includes(f.skill))
      && (!f.q || (a.series + a.name + a.skAll.map(skName).join('')).toLowerCase().includes(f.q)),
    render: a => { const g = a.g[a.g.length - 1];
      return `<button class="pitem ${S.a[part].id === a.id ? 'on' : ''}" data-pick="${a.id}" data-tip="a|${a.id}">
        <span class="ic">${a.icon ? `<img loading="lazy" src="${a.icon}">` : ''}</span>
        <span class="tx"><b>${esc(a.series)}${a.event ? ' ★' : ''}${badges({ ...a, event: false })}</b>
          <em>${g.sk.map(([k, l]) => skName(k) + ' ' + l).join(' · ') || '스킬 없음'}</em></span>
        <span class="st"><b>G${g.gr}</b>슬롯 ${g.slot}</span></button>`; },
    onPick: id => { S.a[part] = { id, gr: null, stones: [] }; renderArmor(); render(); },
  });
}

/* ---------- 표류석 선택 (색깔 → 스킬) ---------- */
function pickStone(part, idx) {
  const cur = S.a[part].stones[idx];
  let color = cur?.color || MEMO.stoneColor || DRIFT[0].color;
  document.body.style.overflow = 'hidden';
  const root = $('#modal-root');
  const draw = () => {
    const d = DRIFT_BY_COLOR[color];
    const mk = (k, own) => {
      const c = cfgOf(k);
      return `<button class="pitem ${cur?.kind === k ? 'on' : ''}" data-sk="${k}">
        <span class="tx"><b>${esc(skName(k))}</b><em>${own ? color + ' 전용' : '공용'}${c?.g ? ' · ' + (GROUP_LABEL[c.g] || c.g) : ''}</em></span>
        <span class="st"><b>Lv1</b></span></button>`;
    };
    $('#mo-list').innerHTML =
      `<div style="grid-column:1/-1" class="lbl">${color} 전용</div>` + d.own.map(k => mk(k, 1)).join('') +
      `<div style="grid-column:1/-1;margin-top:8px" class="lbl">공용 (모든 색 공통)</div>` + d.common.map(k => mk(k, 0)).join('');
    $('#mo-list').querySelectorAll('[data-sk]').forEach(b => b.onclick = () => {
      S.a[part].stones[idx] = { color, kind: b.dataset.sk, lv: 1 };
      closeModal(); renderArmor(); render();
    });
    root.querySelectorAll('[data-col]').forEach(b => b.classList.toggle('on', b.dataset.col === color));
  };
  root.innerHTML = `<div class="modal" id="mo"><div class="modal-in">
    <div class="modal-hd"><h3>표류석 — ${PARTNAME[part]} ${idx + 1}번 슬롯</h3>
      <button class="btn gh" style="margin-left:auto" id="mo-clr">비우기</button>
      <button class="btn gh" id="mo-x">✕ 닫기</button></div>
    <div class="modal-bd">
      <div class="fset"><div class="lbl">색깔</div><div class="igrid txt">${
        DRIFT.map(d => `<button data-col="${d.color}">${d.color}</button>`).join('')}</div></div>
      <div class="fset"><div class="lbl">스킬</div><div class="plist" id="mo-list"></div></div>
    </div></div></div>`;
  root.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { color = b.dataset.col; draw(); });
  $('#mo-x').onclick = closeModal;
  $('#mo-clr').onclick = () => { S.a[part].stones[idx] = null; closeModal(); renderArmor(); render(); };
  bindBackdrop();
  MODAL_SAVE = () => { MEMO.stoneColor = color; };
  draw();
}

/* =========================================================
   방어구 일괄 선택
   ========================================================= */
function skillPreview(pick) {
  // pick: { part: {id, gr} } → 스킬 합계 미리보기 HTML
  const raw = {};
  const ws = weaponStats();
  if (ws) ws.sk.forEach(([k, l]) => raw[k] = (raw[k] || 0) + l);
  let slots = 0;
  PARTS.forEach(p => {
    const sel = pick[p]; if (!sel) return;
    const a = A_BY_ID[sel.id]; if (!a) return;
    const g = a.g.find(x => x.gr === sel.gr) || a.g[a.g.length - 1];
    slots += g.slot;
    g.sk.forEach(([k, l]) => raw[k] = (raw[k] || 0) + l);
  });
  const ent = Object.entries(raw).sort((a, b) => {
    const ca = cfgOf(a[0])?.g ? 0 : 1, cb = cfgOf(b[0])?.g ? 0 : 1;
    return ca - cb || b[1] - a[1];
  });
  const html = ent.length ? ent.map(([k, v]) => {
    const max = SKILLS[k]?.max ?? 5, ov = v > max, act = !!cfgOf(k)?.g;
    return `<span class="chip ${ov ? 'r' : (act ? 'g' : '')}" data-tip="sk|${k}|${v}">${esc(skName(k))}
      ${ov ? `<b style="color:var(--bad)">${v}</b>` : v}${ov ? '/' + max : ''}</span>`;
  }).join(' ') : '<span class="muted">아직 선택된 방어구가 없습니다.</span>';
  return { html, slots, count: ent.length };
}

function openArmorBulk() {
  const pick = {};
  PARTS.forEach(p => { if (S.a[p].id) pick[p] = { id: S.a[p].id, gr: S.a[p].gr }; });
  const mem = MEMO.bulkArmor;
  const f = mem ? { ...mem.f, skills: [...mem.f.skills], series: [...mem.f.series] }
    : { skills: [], series: [], q: '', sq: '', qRaw: '', sqRaw: '', mode: 'or' };
  const same = () => PARTS.every(p => (pick[p]?.id || null) === (S.a[p].id || null)
    && (!pick[p] || pick[p].gr === S.a[p].gr));
  document.body.style.overflow = 'hidden';
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal" id="mo"><div class="modal-in wide">
    <div class="modal-hd"><h3>방어구 일괄 선택</h3>
      <span class="note">스킬과 세트는 <b>OR</b> — 둘 중 하나라도 맞으면 후보에 남습니다</span>
      <button class="btn gh" style="margin-left:auto" id="mo-x">✕ 닫기</button></div>
    <div class="modal-bd">
      <div class="fset"><div class="lbl">스킬 조건
          <select class="sm" id="bk-mode" style="width:auto;margin-left:6px">
            <option value="or">고른 스킬 중 하나라도</option><option value="and">고른 스킬 전부</option></select>
          <span class="clr" id="bk-clear">조건 전체 해제</span></div>
        <div class="row bk-srch" style="margin-bottom:7px">
          <div><input type="text" id="bk-sq" placeholder="스킬 검색 — 예: 공, 회심, 속성"></div>
          <div><input type="text" id="bk-q" placeholder="방어구 · 세트 이름 검색"></div>
        </div>
        <div class="selskills" id="bk-sres" style="margin-bottom:7px"></div>
        <div class="selskills" id="bk-tags"></div>
      </div>
      <div class="fset"><div class="lbl">세트 <span class="note">(여러 개 선택 가능)</span></div>
        <div class="igrid lg" id="bk-series"></div></div>
      <div class="bulk" id="bk-cols"></div>
      <div class="footbar">
        <div class="prev"><div class="lbl" style="margin-bottom:5px">선택 조합 스킬 <span id="bk-slots" class="note"></span></div>
          <div id="bk-prev" style="display:flex;flex-wrap:wrap;gap:4px"></div></div>
        <div class="btns"><button class="btn" id="bk-none">전부 비우기</button>
          <button class="btn p" id="bk-ok">확인</button></div>
      </div>
    </div></div></div>`;

  const sgrid = $('#bk-series');
  A_SERIES.forEach(s => {
    const b = document.createElement('button');
    b.title = s.name; b.dataset.v = s.name;
    b.innerHTML = (s.icon ? `<img loading="lazy" src="${s.icon}">` : '') + `<span>${esc(s.name.replace(' 세트', ''))}</span>`;
    b.onclick = () => {
      f.series = f.series.includes(s.name) ? f.series.filter(x => x !== s.name) : [...f.series, s.name];
      paint();
    };
    sgrid.appendChild(b);
  });

  function paint(keep) {   // keep = 항목만 눌렀을 때 → 스크롤 유지
    sgrid.querySelectorAll('button').forEach(b => b.classList.toggle('on', f.series.includes(b.dataset.v)));

    // 스킬 검색 결과 — 눌러서 조건에 추가
    const sres = $('#bk-sres');
    if (!f.sq) sres.innerHTML = '<span class="note">스킬 이름 일부를 입력하면 후보가 뜹니다. 눌러서 추가하세요.</span>';
    else {
      const hit = FILTER_SKILLS.filter(s => s.name.toLowerCase().includes(f.sq) && !f.skills.includes(s.kind)).slice(0, 30);
      sres.innerHTML = hit.length ? hit.map(s =>
        `<button class="btn sm" data-addsk="${s.kind}" style="${cfgOf(s.kind)?.g ? 'border-color:#2b5734;color:#8fdc9a' : ''}">
          ＋ ${esc(s.name)}</button>`).join('')
        : '<span class="note">일치하는 스킬이 없습니다.</span>';
      sres.querySelectorAll('[data-addsk]').forEach(b => b.onclick = () => {
        f.skills.push(b.dataset.addsk); paint();
      });
    }

    $('#bk-tags').innerHTML = f.skills.length ? f.skills.map(k =>
      `<span class="tag">${esc(skName(k))}<button data-rm="${k}">✕</button></span>`).join('')
      : '<span class="note">선택된 스킬 없음</span>';
    $('#bk-tags').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      f.skills = f.skills.filter(x => x !== b.dataset.rm); paint();
    });

    // 스킬 조건과 세트 조건은 OR — 둘 중 하나라도 맞으면 남긴다. 이름 검색만 AND.
    const match = a => {
      if (f.q && !(a.series + a.name + a.skAll.map(skName).join('')).toLowerCase().includes(f.q)) return false;
      if (!f.skills.length && !f.series.length) return true;
      const skHit = f.skills.length && (f.mode === 'and'
        ? f.skills.every(k => a.skAll.includes(k)) : f.skills.some(k => a.skAll.includes(k)));
      return skHit || f.series.includes(a.series);
    };
    // 고른 스킬을 많이·높게 주는 순 → 그다음 고른 세트
    const score = a => {
      const g = a.g[a.g.length - 1];
      let hit = 0, lv = 0;
      f.skills.forEach(k => { const e = g.sk.find(x => x[0] === k); if (e) { hit++; lv += e[1]; } });
      return [hit, lv, f.series.includes(a.series) ? 1 : 0, g.slot];
    };
    // 다시 그려도 각 열의 스크롤 위치 유지 (항목을 누를 때마다 맨 위로 튀지 않게)
    const colY = Object.fromEntries(PARTS.map(p => [p, (keep ? scrollOf(`#bk-cols [data-col="${p}"]`) : 0) || (paint.colY || {})[p] || 0]));
    paint.colY = null;
    $('#bk-cols').innerHTML = PARTS.map(p => {
      const list = ARMOR_BY_PART[p].filter(match);
      if (f.skills.length || f.series.length) list.sort((a, b) => {
        const A = score(a), B = score(b);
        return B[0] - A[0] || B[1] - A[1] || B[2] - A[2] || B[3] - A[3] || a.ssort - b.ssort;
      });
      return `<div class="bcol"><h4>${PARTNAME[p]}<span class="n">${list.length}</span></h4>
        <div class="list" data-col="${p}">${
          (pick[p] ? '' : '') + list.map(a => {
            const g = a.g[a.g.length - 1];
            const on = pick[p]?.id === a.id;
            return `<button class="bitem ${on ? 'on' : ''}" data-p="${p}" data-id="${a.id}" data-tip="a|${a.id}">
              <span class="ic">${a.icon ? `<img loading="lazy" src="${a.icon}">` : ''}</span>
              <span class="tx"><b>${esc(a.series.replace(' 세트', ''))}</b>
                <em>${g.sk.map(([k, l]) => skName(k) + l).join(' · ') || '스킬 없음'}</em></span>
              <span class="sl">◇${g.slot}</span></button>`;
          }).join('') || '<div class="note" style="padding:8px">해당 없음</div>'}</div></div>`;
    }).join('');
    PARTS.forEach(p => setScroll(`#bk-cols [data-col="${p}"]`, colY[p]));
    $('#bk-cols').querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
      const p = b.dataset.p;
      if (pick[p]?.id === b.dataset.id) delete pick[p];
      else pick[p] = { id: b.dataset.id, gr: A_BY_ID[b.dataset.id].g[A_BY_ID[b.dataset.id].g.length - 1].gr };
      paint(true);
    });
    const pv = skillPreview(pick);
    $('#bk-prev').innerHTML = pv.html;
    $('#bk-slots').textContent = `· 부위 ${Object.keys(pick).length}/5 · 표류석 슬롯 ${pv.slots}칸`;
  }
  $('#bk-sq').value = f.sqRaw || ''; $('#bk-q').value = f.qRaw || ''; $('#bk-mode').value = f.mode;
  $('#bk-sq').oninput = e => { f.sqRaw = e.target.value; f.sq = e.target.value.trim().toLowerCase(); paint(); };
  $('#bk-q').oninput = e => { f.qRaw = e.target.value; f.q = e.target.value.trim().toLowerCase(); paint(); };
  $('#bk-mode').onchange = e => { f.mode = e.target.value; paint(); };
  $('#bk-clear').onclick = () => { f.skills = []; f.series = []; f.q = ''; f.sq = ''; f.qRaw = ''; f.sqRaw = '';
    $('#bk-q').value = ''; $('#bk-sq').value = ''; paint(); };
  $('#bk-none').onclick = () => { PARTS.forEach(p => delete pick[p]); paint(true); };
  $('#bk-ok').onclick = () => {
    PARTS.forEach(p => {
      if (pick[p]) {
        const keep = S.a[p].id === pick[p].id ? S.a[p].stones : [];
        S.a[p] = { id: pick[p].id, gr: pick[p].gr, stones: keep };
      } else S.a[p] = { id: null, gr: null, stones: [] };
    });
    closeModal(); renderArmor(); render(); toast('방어구를 적용했습니다');
  };
  $('#mo-x').onclick = closeModal;
  bindBackdrop();
  MODAL_DIRTY = () => !same();
  MODAL_SAVE = () => { MEMO.bulkArmor = { f: { ...f }, y: scrollOf('#mo .modal-bd'),
    col: Object.fromEntries(PARTS.map(p => [p, scrollOf(`#bk-cols [data-col="${p}"]`)])) }; };
  if (mem) paint.colY = mem.col;
  paint();
  if (mem) setScroll('#mo .modal-bd', mem.y);
}

/* =========================================================
   표류석 일괄 선택
   ========================================================= */
const STONE_COLOR_OF = (() => {
  const m = {};
  DRIFT.forEach(d => d.own.forEach(k => m[k] = d.color));
  (DRIFT[0]?.common || []).forEach(k => m[k] = '공용');
  return m;
})();
const COLOR_HEX = { 적색: '#e2564a', 황색: '#e8c04a', 청색: '#4a8fe2', 하늘색: '#6fd0e8',
  흑색: '#7a8595', 백색: '#e8ecf2', 보라색: '#b072e8', 공용: '#5ec26a' };

function totalSlots() {
  let n = 0;
  PARTS.forEach(p => {
    const a = A_BY_ID[S.a[p].id]; if (!a) return;
    const g = a.g.find(x => x.gr === S.a[p].gr); if (g) n += g.slot;
  });
  return n;
}

function openStoneBulk() {
  const cap = totalSlots();
  const cnt = {};   // kind -> 개수
  PARTS.forEach(p => (S.a[p].stones || []).forEach(s => { if (s) cnt[s.kind] = (cnt[s.kind] || 0) + 1; }));
  const cnt0 = JSON.stringify(Object.entries(cnt).sort());
  const mem = MEMO.stoneBulk;
  let color = mem ? mem.color : null, q = mem ? mem.q : '', qRaw = mem ? mem.qRaw : '';
  document.body.style.overflow = 'hidden';
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal" id="mo"><div class="modal-in">
    <div class="modal-hd"><h3>표류석 일괄 장착</h3>
      <span class="note">부위와 상관없이 개수만 맞추면 됩니다</span>
      <button class="btn gh" style="margin-left:auto" id="mo-x">✕ 닫기</button></div>
    <div class="modal-bd">
      ${cap ? '' : '<div class="warn">방어구를 먼저 선택하세요. 표류석 슬롯이 0칸입니다.</div>'}
      <div class="fset"><div class="lbl">슬롯 사용 <span id="st-cap"></span></div>
        <div class="slotbar" id="st-bar"></div></div>
      <div class="fset"><div class="lbl">색깔</div>
        <div class="igrid txt" id="st-colors">
          <button data-c="">전체</button>
          ${DRIFT.map(d => `<button data-c="${d.color}">${d.color}</button>`).join('')}
          <button data-c="공용">공용</button></div></div>
      <div class="fset"><div class="lbl">스킬 <span class="clr" id="st-clear">전부 비우기</span></div>
        <input type="text" id="st-q" placeholder="스킬 검색" style="margin-bottom:8px">
        <div style="max-height:44vh;overflow:auto" id="st-list"></div></div>
      <div class="footbar">
        <div class="prev"><div class="lbl" style="margin-bottom:5px">장착 예정</div>
          <div id="st-prev" style="display:flex;flex-wrap:wrap;gap:4px"></div></div>
        <div class="btns"><button class="btn p" id="st-ok">확인</button></div>
      </div>
    </div></div></div>`;

  const used = () => Object.values(cnt).reduce((a, b) => a + b, 0);
  function paint(keep) {
    const u = used();
    $('#st-cap').textContent = `${u} / ${cap}칸`;
    $('#st-bar').innerHTML = Array.from({ length: cap }, (_, i) => `<i class="${i < u ? 'f' : ''}"></i>`).join('') || '<span class="note">슬롯 없음</span>';
    root.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', (color || '') === b.dataset.c));

    const all = [];
    DRIFT.forEach(d => d.own.forEach(k => all.push({ k, c: d.color })));
    (DRIFT[0]?.common || []).forEach(k => all.push({ k, c: '공용' }));
    let list = all.filter(x => (!color || x.c === color) && (!q || skName(x.k).toLowerCase().includes(q)));
    list.sort((a, b) => (cfgOf(b.k)?.g ? 1 : 0) - (cfgOf(a.k)?.g ? 1 : 0) || skName(a.k).localeCompare(skName(b.k), 'ko'));
    const listY = keep ? scrollOf('#st-list') : 0;
    $('#st-list').innerHTML = list.map(x => {
      const n = cnt[x.k] || 0, max = SKILLS[x.k]?.max ?? 5, act = !!cfgOf(x.k)?.g;
      return `<div class="stonerow">
        <span class="dot" style="background:${COLOR_HEX[x.c] || '#666'}"></span>
        <span class="nm">${esc(skName(x.k))}
          <span class="note">· ${x.c}${act ? ' · 딜 반영' : ''}${n > max ? ` · 상한 ${max} 초과` : ''}</span></span>
        <span class="cnt">
          <button class="cbtn" data-m="${x.k}" ${n ? '' : 'disabled'}>−</button>
          <b style="${n > max ? 'color:var(--bad)' : ''}">${n}</b>
          <button class="cbtn" data-pl="${x.k}" ${u >= cap ? 'disabled' : ''}>＋</button>
        </span></div>`;
    }).join('') || '<div class="note" style="padding:10px">해당 없음</div>';
    setScroll('#st-list', listY);
    $('#st-list').querySelectorAll('[data-pl]').forEach(b => b.onclick = () => {
      if (used() >= cap) return;
      cnt[b.dataset.pl] = (cnt[b.dataset.pl] || 0) + 1; paint(true);
    });
    $('#st-list').querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const k = b.dataset.m; cnt[k] = (cnt[k] || 0) - 1; if (cnt[k] <= 0) delete cnt[k]; paint(true);
    });
    const ent = Object.entries(cnt);
    $('#st-prev').innerHTML = ent.length ? ent.map(([k, n]) => {
      const max = SKILLS[k]?.max ?? 5;
      return `<span class="chip ${n > max ? 'r' : (cfgOf(k)?.g ? 'g' : '')}">${esc(skName(k))} ×${n}</span>`;
    }).join(' ') : '<span class="muted">비어 있음</span>';
  }
  root.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { color = b.dataset.c || null; paint(); });
  $('#st-q').value = qRaw;
  $('#st-q').oninput = e => { qRaw = e.target.value; q = e.target.value.trim().toLowerCase(); paint(); };
  $('#st-clear').onclick = () => { Object.keys(cnt).forEach(k => delete cnt[k]); paint(true); };
  $('#st-ok').onclick = () => {
    // 개수를 부위 슬롯에 순서대로 분배
    const flat = [];
    Object.entries(cnt).forEach(([k, n]) => { for (let i = 0; i < n; i++) flat.push({ color: STONE_COLOR_OF[k] || '공용', kind: k, lv: 1 }); });
    let i = 0;
    PARTS.forEach(p => {
      const a = A_BY_ID[S.a[p].id];
      const g = a && a.g.find(x => x.gr === S.a[p].gr);
      const n = g ? g.slot : 0;
      S.a[p].stones = Array.from({ length: n }, () => flat[i++] || null);
    });
    closeModal(); renderArmor(); render(); toast('표류석을 장착했습니다');
  };
  $('#mo-x').onclick = closeModal;
  bindBackdrop();
  MODAL_DIRTY = () => JSON.stringify(Object.entries(cnt).sort()) !== cnt0;
  MODAL_SAVE = () => { MEMO.stoneBulk = { color, q, qRaw, y: scrollOf('#st-list') }; };
  paint();
  if (mem) setScroll('#st-list', mem.y);
}

/* ---------- 집계 ---------- */
function aggregate() {
  const raw = {};
  const add = (k, l) => { raw[k] = (raw[k] || 0) + l; };
  const ws = weaponStats();
  if (ws) ws.sk.forEach(([k, l]) => add(k, l));
  PARTS.forEach(p => {
    const a = A_BY_ID[S.a[p].id]; if (!a) return;
    const g = a.g.find(x => x.gr === S.a[p].gr); if (!g) return;
    g.sk.forEach(([k, l]) => add(k, l));
    (S.a[p].stones || []).forEach(s => { if (s) add(s.kind, s.lv); });
  });
  const capped = {}, over = [];
  for (const [k, v] of Object.entries(raw)) {
    const max = SKILLS[k]?.max ?? 5;
    capped[k] = Math.min(v, max);
    if (v > max) over.push({ kind: k, name: skName(k), got: v, max });
  }
  return { raw, capped, over };
}

/* ---------- 렌더 ---------- */
function render() {
  const ws = weaponStats(), agg = aggregate();
  const rt = ws && $('#slot-w .rt'); if (rt) rt.innerHTML = weaponRtInner();
  if (!ws) {
    renderSkills(agg);
    $('#res-final').textContent = '—'; $('#res-motion').textContent = '—';
    $('#res-kv').innerHTML = '<div class="muted">무기를 선택하면 딜이 계산됩니다.</div>';
    $('#res-detail').innerHTML = ''; renderCalc(null); renderAilment(null); updateSaveUI(); return;
  }
  const r = calc(ws, agg);
  renderSkills(agg, r.blocked);
  renderCalc(r, ws);
  $('#res-final').textContent = fmt(r.finalDmg, 1);
  renderAilment(ws, agg);
  updateSaveUI();
  $('#res-motion').textContent = S.motion ? fmt(r.motionDmg, 1) : '—';
  $('#res-kv').innerHTML = `
    <div class="kv"><span>총 공격력</span><b>${fmt(r.totalAtk, 1)}</b></div>
    <div class="kv"><span>총 속성</span><b>${fmt(r.totalEle, 1)}</b></div>
    <div class="kv"><span>총 회심률</span><b style="color:${r.critTotal < 0 ? 'var(--bad)' : 'var(--good)'}">${(r.critTotal * 100).toFixed(1)}%</b></div>
    <div class="kv"><span>최종 곱연산</span><b>×${(1 + r.acc.G).toFixed(3)}</b></div>`;
  const w = r.weights;
  $('#res-detail').innerHTML = `<table><thead><tr><th>분기</th><th class="n">가중치</th><th class="n">기여</th><th class="n">비중</th></tr></thead><tbody>${
    [['일반', 'normal'], ['회심', 'crit'], ['흉회심', 'brutal'], ['역회심', 'negCrit']].map(([n, k]) =>
      `<tr><td>${n}</td><td class="n">${w[k].toFixed(4)}</td><td class="n">${fmt(r.parts[k], 1)}</td>
       <td class="n">${r.sum ? (r.parts[k] / r.sum * 100).toFixed(1) : '0.0'}%</td></tr>`).join('')}</tbody></table>
    <table style="margin-top:6px">${[['A 물리 곱', r.acc.A, 1], ['B 물리 가산', r.acc.B, 0], ['F 물리 최종', r.acc.F, 1],
      ['C 속성 곱', r.acc.C, 1], ['D 속성 가산', r.acc.D, 0], ['E 속성 최종', r.acc.E, 1],
      ['G 최종 곱', r.acc.G, 1], ['회심격【속성】', r.acc.CRIT_ELEM, 1], ['슈퍼회심', r.acc.CRIT_MULT, 1],
      ['흉회심 배율', r.acc.BRUTAL, 1]].map(([n, v, p]) =>
      `<tr><th>${n}</th><td class="n">${p ? (v * 100).toFixed(1) + '%' : fmt(v, 1)}</td></tr>`).join('')}</table>`;
}
// 기댓값 공격력 밑 — 독·마비·수면·폭파 무기일 때만 상태 이상 축적 확률
function renderAilment(ws, agg) {
  const box = $('#res-ail');
  const a = ws && ailmentChance(ws.elem, agg.capped);
  box.classList.toggle('hide', !a);
  if (!a) { box.innerHTML = ''; return; }
  const pct = v => (v * 100).toFixed(1) + '%';
  const nm = (META.elementNames[ws.elem] || ws.elem).replace('속성', '');
  const src = [`기본 1/3 <b>${pct(a.base)}</b>`, ...a.parts.map(p =>
    `${esc(skName(p.kind))} Lv${p.lv} × ${p.frac} <b>+${pct(p.v)}</b>`)];
  box.innerHTML = `<div class="ail-row"><span class="reslabel">${esc(nm)} 축적 확률</span><b>${pct(a.normal)}</b></div>
    ${a.sneak ? `<div class="ail-row"><span class="reslabel">뒤에서 공격 시</span><b>${pct(a.back)}</b></div>` : ''}
    ${agg.capped.BUILDUP_BOOST ? `<div class="ail-link">→ ${esc(skName('BUILDUP_BOOST'))} 발동률 <b>${fmt(corrOf('BUILDUP_BOOST'), 4)}</b>${
      S.trig.BUILDUP_BOOST ? ` (${S.trig.BUILDUP_BOOST === 'on' ? '발동' : '미발동'} 버튼)` : isAilmentLinked('BUILDUP_BOOST') && S.corr.BUILDUP_BOOST == null ? ' (연동)' : ' (직접 고친 값 사용 중)'}</div>` : ''}
    <div class="ail-src">${src.join(' · ')}${a.sneak ? `<br>뒤에서: ${esc(skName(a.sneak.kind))} Lv${a.sneak.lv} × ${a.sneak.frac} <b>+${pct(a.sneak.v)}</b>` : ''}${
      a.base + a.parts.reduce((x, p) => x + p.v, 0) + (a.sneak ? a.sneak.v : 0) > 1 + 1e-9 ? '<br>합계는 100% 를 넘지 않습니다' : ''}</div>`;
}
function calc(ws, agg) {
  const corr = {};
  Object.keys(agg.capped).forEach(k => corr[k] = corrOf(k));
  return calcDamage({ attack: ws.atk, element: ws.ele, critical: ws.crit, weaponElem: ws.elem,
    weaponId: S.w.id, weaponCat: ws.catName, skills: agg.capped, corr,
    style: S.style, motion: S.motion, SKILLS });
}

/* ---------- 계산 과정 ---------- */
const GORDER = ['A', 'B', 'F', 'C', 'D', 'E', 'G', 'CRIT', 'CRIT_MULT', 'BRUTAL', 'CRIT_ELEM'];
const n4 = v => (Math.round(v * 10000) / 10000).toString();
function renderCalc(r, ws) {
  const box = $('#calc-box');
  if (!r) { box.innerHTML = '<div class="muted">무기를 선택하면 계산 과정이 표시됩니다.</div>'; return; }
  const byG = {};
  r.contrib.forEach(c => (byG[c.group] = byG[c.group] || []).push(c));

  const groupTable = g => {
    const rows = byG[g] || [];
    const isMul = MULT_GROUPS.has(g);
    if (!rows.length) return `<tr><th>${GROUP_LABEL[g]}</th><td colspan="2" class="note">없음</td>
      <td class="n">${isMul ? '×1' : '0'}</td></tr>`;
    const detail = rows.map(c =>
      `${esc(c.name)} Lv${c.lv} ${n4(c.raw)}${c.corr !== 1 ? `×${c.corr}` : ''}=${n4(c.val)}`).join(isMul ? ' , ' : ' + ');
    const total = isMul
      ? rows.map(c => `(1+${n4(c.val)})`).join('×') + ` = ×${n4(r.mul[g])}`
      : `= ${n4(g === 'B' || g === 'D' ? r.acc[g] : r.acc[g])}`;
    return `<tr><th>${GROUP_LABEL[g]}</th><td colspan="2"><span class="note">${detail}</span></td>
      <td class="n">${total}</td></tr>`;
  };

  const A = r.acc.A, B = r.acc.B, C = r.acc.C, Dd = r.acc.D, G = r.acc.G;
  const mF = r.mul.F, mE = r.mul.E;
  const b = r.base, st = r.style;
  const w = r.weights, p = r.parts;

  const blockHtml = r.blocked.length ? `<div class="warn" style="margin-bottom:10px">
      선행 조건 미충족으로 <b>발동하지 않은 스킬</b> —
      ${r.blocked.map(b => `${esc(b.name)} Lv${b.lv} <span class="note">(${esc(b.needName)} Lv${b.needLv} 필요 · 현재 ${b.have})</span>`).join(', ')}
    </div>` : '';

  box.innerHTML = blockHtml + `
  <table style="margin-bottom:10px">
    <tr><th style="width:150px">무기 기본</th><td>공격 <b>${fmt(b.atk)}</b> · 속성 <b>${fmt(b.ele)}</b> · 회심 <b>${(b.crit * 100).toFixed(0)}%</b></td></tr>
    ${(st.atk || st.ele || st.crit) ? `<tr><th>스타일 강화</th><td>공 +${fmt(st.atk)} · 속 +${fmt(st.ele)} · 회 +${(st.crit * 100).toFixed(0)}%</td></tr>` : ''}
  </table>

  <div class="lbl" style="margin:12px 0 5px">그룹별 합계</div>
  <table>${GORDER.map(groupTable).join('')}</table>

  <div class="lbl" style="margin:14px 0 5px">단계별 계산</div>
  <table class="calcsteps">
    <tr><th>총 공격력</th><td>
      (${fmt(b.atk)} + ${fmt(b.atk)}×${n4(A)} + ${n4(B)}) × ${n4(mF)}
      = <b>${fmt(r.totalAtk, 2)}</b></td></tr>
    <tr><th>총 속성</th><td>
      (${fmt(b.ele)} + ${fmt(b.ele)}×${n4(C)} + ${n4(Dd)}) × ${n4(mE)}
      = <b>${fmt(r.totalEle, 2)}</b></td></tr>
    <tr><th>총 회심률</th><td>${(b.crit * 100).toFixed(1)}%
      ${r.acc.CRIT >= 0 ? '+' : '−'} ${Math.abs(r.acc.CRIT * 100).toFixed(1)}%
      = <b style="color:${r.critTotal < 0 ? 'var(--bad)' : 'var(--good)'}">${(r.critTotal * 100).toFixed(1)}%</b></td></tr>
  </table>

  <div class="lbl" style="margin:14px 0 5px">회심 분기</div>
  <table>
    <thead><tr><th>분기</th><th>가중치 계산</th><th class="n">가중치</th><th class="n">기여</th></tr></thead>
    <tbody>
      <tr><td>일반</td><td class="note">${r.critTotal >= 0 ? `1 − ${n4(r.critTotal)}` : `1 + ${n4(r.critTotal)}`}</td>
        <td class="n">${n4(w.normal)}</td><td class="n">${fmt(p.normal, 2)}</td></tr>
      <tr><td>회심</td><td class="note">${r.critTotal >= 0 ? `${n4(r.critTotal)} × (1.25 + ${n4(r.acc.CRIT_MULT)})` : '회심률 음수 → 0'}</td>
        <td class="n">${n4(w.crit)}</td><td class="n">${fmt(p.crit, 2)}</td></tr>
      <tr><td>흉회심</td><td class="note">${r.critTotal < 0 ? `${n4(-r.critTotal)} × 0.3 × (1 + ${n4(r.acc.BRUTAL)})` : '회심률 양수 → 0'}</td>
        <td class="n">${n4(w.brutal)}</td><td class="n">${fmt(p.brutal, 2)}</td></tr>
      <tr><td>역회심</td><td class="note">${r.critTotal < 0 ? `${n4(-r.critTotal)} × 0.7 × 0.75` : '회심률 양수 → 0'}</td>
        <td class="n">${n4(w.negCrit)}</td><td class="n">${fmt(p.negCrit, 2)}</td></tr>
    </tbody>
  </table>
  <p class="note" style="margin:6px 0 0">각 분기 기여 = (총공 ${fmt(r.totalAtk, 2)} + 총속) × 가중치.
    회심 분기의 총속은 회심격【속성】이 더해져 ${fmt(r.totalEleCrit, 2)} 입니다.</p>

  <div class="lbl" style="margin:14px 0 5px">최종</div>
  <table class="calcsteps">
    <tr><th>분기 합계</th><td>${fmt(p.normal, 2)} + ${fmt(p.crit, 2)} + ${fmt(p.brutal, 2)} + ${fmt(p.negCrit, 2)}
      = <b>${fmt(r.sum, 2)}</b></td></tr>
    <tr><th>최종 곱연산</th><td>${fmt(r.sum, 2)} × (1 + ${n4(G)}) = <b style="font-size:15px">${fmt(r.finalDmg, 2)}</b></td></tr>
    ${S.motion ? `<tr><th>모션값 적용</th><td>${fmt(r.finalDmg, 2)} × ${S.motion}% = <b style="color:var(--accent);font-size:15px">${fmt(r.motionDmg, 2)}</b></td></tr>` : ''}
  </table>`;
}

/* 스킬 설명 → 레벨별로 달라지는 부분만 뽑아 사다리로 보여준다
   - 숫자만 다른 경우: "공격력이 N 상승한다." + Lv1 50 · Lv2 100 …
   - 문구가 다른 경우: 공통 앞뒤를 잘라 달라지는 말만 (조금 · 크게 …), 길면 레벨별 줄 목록 */
const LADDER = {};
function skillLadder(k) {
  if (k in LADDER) return LADDER[k];
  const s = SKILLS[k], L = (s?.levels || []).filter(l => l.desc);
  if (!s || s.unknown || !L.length) return LADDER[k] = { kind: 'none', text: s ? (L[0]?.desc || '수치 미공개') : '' };
  if (L.length === 1) return LADDER[k] = { kind: 'one', L };
  const NUM = /(-?\d+(?:\.\d+)?)/;
  const sp = L.map(l => l.desc.split(NUM));                  // 짝수 칸 = 글, 홀수 칸 = 숫자
  const sameText = sp.every(p => p.length === sp[0].length && p.every((x, i) => i % 2 || x === sp[0][i]));
  if (sameText) {
    const vary = [];
    for (let i = 1; i < sp[0].length; i += 2) if (new Set(sp.map(p => p[i])).size > 1) vary.push(i);
    if (vary.length) {
      const unit = j => (/^(%|초|배)/.exec(sp[0][j + 1] || '') || [''])[0];
      return LADDER[k] = { kind: 'num', L, sp, vary, unit };
    }
  }
  const W = L.map(l => l.desc.split(' '));
  const minLen = Math.min(...W.map(w => w.length));
  let p = 0, q = 0;
  while (p < minLen && W.every(w => w[p] === W[0][p])) p++;
  while (q < minLen - p && W.every(w => w[w.length - 1 - q] === W[0][W[0].length - 1 - q])) q++;
  const mids = () => W.map(w => w.slice(p, w.length - q).join(' '));
  while (mids().some(m => !m) && q > 0) q--;                 // "늘어난다 / 크게 늘어난다" 처럼 빈칸이 생기면 동사까지 포함
  while (mids().some(m => !m) && p > 0) p--;
  const M = mids();
  return LADDER[k] = { kind: Math.max(...M.map(m => m.length)) <= 16 ? 'word' : 'lines', L, W, p, q, M };
}
function skillDescHtml(k, lv) {
  const d = skillLadder(k);
  if (d.kind === 'none') return d.text ? `<div class="ds-t">${esc(d.text)}</div>` : '';
  if (d.kind === 'one') return `<div class="ds-t">${esc(d.L[0].desc)}</div>`;
  let ci = d.L.findIndex(l => l.lv === lv); if (ci < 0) ci = d.L.length - 1;
  const pill = (i, v) => `<span class="${i === ci ? 'cur' : ''}">Lv${d.L[i].lv} ${v}</span>`;
  if (d.kind === 'num') {
    const t = d.sp[ci].map((x, i) => i % 2 && d.vary.includes(i) ? `<b class="cur">${esc(x)}</b>` : esc(x)).join('');
    return `<div class="ds-t">${t}</div><div class="ds-l">${d.L.map((_, i) =>
      pill(i, d.vary.map(j => esc(d.sp[i][j]) + d.unit(j)).join(' / '))).join('')}</div>`;
  }
  if (d.kind === 'word') {
    const w = d.W[ci];
    const t = [esc(w.slice(0, d.p).join(' ')), `<b class="cur">${esc(d.M[ci])}</b>`, esc(w.slice(w.length - d.q).join(' '))].filter(Boolean).join(' ');
    return `<div class="ds-t">${t}</div><div class="ds-l">${d.L.map((_, i) => pill(i, esc(d.M[i]))).join('')}</div>`;
  }
  return `<div class="ds-ln">${d.L.map((l, i) => `<div class="${i === ci ? 'cur' : ''}"><i>Lv${l.lv}</i>${esc(l.desc)}</div>`).join('')}</div>`;
}

function renderSkills(agg, blocked) {
  const box = $('#skill-list');
  window.__aggRaw = agg.raw;
  const blockMap = {};
  (blocked || []).forEach(b => blockMap[b.kind] = b);
  const ent = Object.entries(agg.capped).sort((a, b) => (SKILLS[a[0]]?.sort ?? 0) - (SKILLS[b[0]]?.sort ?? 0));
  const on = ent.filter(([k]) => cfgOf(k)?.g), off = ent.filter(([k]) => !cfgOf(k)?.g);
  $('#skill-count').textContent = ent.length ? `딜 반영 ${on.length} · 미반영 ${off.length}` : '';
  const TRIG_BTN = [['on', '발동'], ['', '평균'], ['off', '미발동']];
  const row = ([k, lv]) => {
    const s = SKILLS[k], cfg = cfgOf(k);
    const corr = corrOf(k);
    const blk = blockMap[k];
    const act = !!cfg?.g && !blk;
    const cond = act && condOf(k);
    const cur = S.trig[k] || '';
    const max = s?.max ?? 5, rawLv = window.__aggRaw?.[k] ?? lv, ovf = rawLv > max;
    return `<div class="sk"${blk ? ' style="opacity:.6"' : ''}><div class="nm">${esc(skName(k))}
        <span class="chip ${ovf ? 'r' : (blk ? 'w' : (act ? 'g' : ''))}">Lv${ovf
          ? `<b style="color:var(--bad)">${rawLv}</b>` : rawLv}/${max}</span>
        <em>${blk ? `미발동 — ${esc(blk.needName)} Lv${blk.needLv} 필요 (현재 ${blk.have})`
              : (act ? (GROUP_LABEL[cfg.g] || cfg.g) : '딜 미반영')}</em></div>
      <div class="ds">${skillDescHtml(k, lv)}</div>
      <div>${act ? `<input type="number" step="0.01" min="0" max="99" value="${corr}" data-corr="${k}"${
        cur ? ' disabled title="발동/미발동을 고른 상태에서는 고칠 수 없습니다 — 평균을 누르면 다시 열립니다"'
          : (isAilmentLinked(k) && S.corr[k] == null ? ' title="상태 이상 축적 확률에 연동된 값입니다 — 고치면 이 세팅에서는 고친 값이 우선합니다"' : '')}>` : ''}</div>
      <div class="note">${act ? (isAilmentLinked(k) && S.corr[k] == null && !cur ? '<span class="link-tag">축적 확률 연동</span>' : '발동률') : ''}${cond ? `<div class="trig" data-trigrow="${k}">${
        TRIG_BTN.map(([v, t]) => { const ov = onValOf(k);
          const ttl = v === 'on' ? ` title="발동률 ${ov}"` : (v === 'off' ? ' title="발동률 0"' : ' title="기본 발동률로"');
          return `<button class="${cur === v ? 'on' : ''}"${ttl} data-trig="${k}" data-tv="${v}">${t}${
            v === 'on' && ov !== 1 ? ` <i>${ov}</i>` : ''}</button>`; }).join('')
      }</div>` : ''}</div></div>`;
  };
  const condOn = on.filter(([k]) => condOf(k) && !blockMap[k]);
  window.__condOn = condOn.map(([k]) => k);
  $('#skill-bulk').style.display = condOn.length ? '' : 'none';
  $('#skill-bulk-n').textContent = condOn.length ? `조건부 ${condOn.length}` : '';
  box.innerHTML = !ent.length ? '<div class="muted">장비를 선택하면 스킬이 집계됩니다.</div>'
    : (on.length ? on.map(row).join('') : '<div class="muted">딜에 반영되는 스킬이 없습니다.</div>')
      + (off.length ? `<details open style="margin-top:6px"><summary>딜 미반영 ${off.length}개 (내성·생존·유틸)</summary>${off.map(row).join('')}</details>` : '');
  box.querySelectorAll('[data-corr]').forEach(i => i.onchange = e => {
    S.corr[e.target.dataset.corr] = Number(e.target.value); render();
  });
  box.querySelectorAll('[data-trig]').forEach(b => b.onclick = e => {
    const k = e.currentTarget.dataset.trig, v = e.currentTarget.dataset.tv;
    if (v) S.trig[k] = v;
    else { delete S.trig[k]; delete S.corr[k]; }   // 평균 = 기본 발동률로 되돌리고 다시 고칠 수 있게
    render();
  });
  $('#skill-over').innerHTML = agg.over.length
    ? `<div class="warn">상한 초과 — <b>${agg.over.map(o => `${o.name} ${o.got}`).join(', ')}</b>
        (초과분은 계산에 반영되지 않습니다)</div>` : '';
}

/* =========================================================
   저장 / 비교
   ========================================================= */
const LS = 'mhnow_builds_v2';
const loadB = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
let BUILDS = loadB();
/* 지금 불러와서 고치고 있는 세팅 — 「덮어쓰기」 대상. 저장 목록 안의 id 로 가리킨다 (새로고침하면 비워짐) */
let CUR_ID = null;
const newBid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function ensureIds() { BUILDS.forEach(b => { if (!b.id) b.id = newBid(); }); }
ensureIds();
const curBuild = () => (CUR_ID && BUILDS.find(b => b.id === CUR_ID)) || null;
const BUILD_KEYS = ['w', 'a', 'style', 'corr', 'trig', 'motion'];
function curDirty() {                          // 불러온 뒤 바뀐 게 있나
  const b = curBuild(); if (!b) return false;
  const now = snapshot(''), norm = (k, v) => JSON.stringify(v ?? (k === 'trig' || k === 'corr' ? {} : k === 'motion' ? 0 : null));
  return BUILD_KEYS.some(k => norm(k, now[k]) !== norm(k, b[k]));
}
function overwriteBuild(b) {                   // 이름·id 는 그대로, 내용과 시각만 지금 세팅으로
  const snap = snapshot(b.name);
  BUILD_KEYS.forEach(k => b[k] = snap[k]); b.t = snap.t;
  saveB(BUILDS); storeStatus();
}
function saveAsNew(defName) {
  const n = prompt('새 세팅 이름', defName); if (!n) return false;
  const b = { ...snapshot(n), id: newBid() };
  BUILDS.push(b); CUR_ID = b.id; saveB(BUILDS); storeStatus();
  toast(FILE_HANDLE ? '새로 저장했습니다 (파일에도 기록)' : '새로 저장했습니다');
  return true;
}
/* 세팅 저장 버튼 — 불러온 세팅이 있으면 「덮어쓰기」, 없으면 「세팅 저장」(새로) */
function updateSaveUI() {
  const b = curBuild(), main = $('#btn-save'), nw = $('#btn-save-new'), info = $('#cur-build');
  if (!main) return;
  if (!b) { CUR_ID = null; main.textContent = '세팅 저장'; main.title = '새 세팅으로 저장'; nw.classList.add('hide'); info.innerHTML = ''; return; }
  const dirty = curDirty();
  main.textContent = '덮어쓰기'; main.title = `「${b.name}」에 지금 세팅을 덮어씁니다`;
  nw.classList.remove('hide');
  info.innerHTML = `불러온 세팅 <b>${esc(b.name)}</b> · ${dirty ? '<span style="color:var(--accent)">바뀐 내용 있음</span>' : '바뀐 내용 없음'}
    <span class="clr" id="cur-detach" title="연결을 끊으면 세팅 저장이 새로 저장으로 돌아갑니다">연결 끊기</span>`;
  $('#cur-detach').onclick = () => { CUR_ID = null; updateSaveUI(); };
}

/* ── 저장 파일 연결 ─────────────────────────────────────
   file:// 로 열면 브라우저 저장소가 창을 닫을 때 날아가는 경우가 많다.
   실제 파일 하나를 연결해 두면 저장할 때마다 그 파일에 같이 기록한다. */
let FILE_HANDLE = null;
const FS_OK = typeof window.showSaveFilePicker === 'function';
const IS_FILE = location.protocol === 'file:';

async function writeFile() {
  if (!FILE_HANDLE) return;
  try {
    const w = await FILE_HANDLE.createWritable();
    await w.write(JSON.stringify({ v: 2, builds: BUILDS }, null, 1));
    await w.close();
  } catch (e) { toast('파일 저장 실패 — 연결이 끊겼습니다'); FILE_HANDLE = null; storeStatus(); }
}
function saveB(b) {
  ensureIds();
  try { localStorage.setItem(LS, JSON.stringify(b)); } catch (e) { }
  writeFile();
}
async function linkNewFile() {
  try {
    FILE_HANDLE = await window.showSaveFilePicker({
      suggestedName: '몬나세팅.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    await writeFile(); storeStatus(); toast('이제 저장할 때마다 이 파일에 기록됩니다');
  } catch (e) { if (e && e.name !== 'AbortError') toast('저장 파일을 연결하지 못했습니다'); }
}
async function openLinkedFile() {
  try {
    const [h] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const txt = await (await h.getFile()).text();
    const j = JSON.parse(txt);
    BUILDS = j.builds || (Array.isArray(j) ? j : []); ensureIds();
    FILE_HANDLE = h;
    try { localStorage.setItem(LS, JSON.stringify(BUILDS)); } catch (e) { }
    storeStatus(); renderCompare(); toast(`${BUILDS.length}개 불러왔습니다 · 이제 자동 저장됩니다`);
  } catch (e) { if (e && e.name !== 'AbortError') toast('저장 파일을 읽지 못했습니다 — JSON 형식을 확인하세요'); }
}
function storeStatus() {
  const el = $('#store-status'); if (!el) return;
  if (FILE_HANDLE) {
    el.innerHTML = `<span class="chip g">파일 자동 저장 중</span>
      <b style="color:var(--txt)">${esc(FILE_HANDLE.name)}</b> · 세팅 ${BUILDS.length}개`;
    return;
  }
  const warn = IS_FILE
    ? '파일을 직접 열어 쓰는 중이라 <b>브라우저를 닫으면 저장이 사라질 수 있습니다.</b>'
    : '브라우저 저장소에만 저장됩니다.';
  el.innerHTML = `${warn}<br>${FS_OK
    ? '<button class="btn sm" id="btn-link">저장 파일 연결</button> <button class="btn sm" id="btn-openlink">저장 파일 열기</button>'
    : '<b>내보내기</b> 로 JSON 을 받아두시고, 다음에 <b>불러오기</b> 로 여세요.'}`;
  const a = $('#btn-link'), b = $('#btn-openlink');
  if (a) a.onclick = linkNewFile;
  if (b) b.onclick = openLinkedFile;
}
const clone = o => JSON.parse(JSON.stringify(o));

const snapshot = name => ({ name, t: Date.now(), w: clone(S.w), a: clone(S.a),
  style: clone(S.style), corr: { ...S.corr }, trig: { ...S.trig }, motion: S.motion });
function restore(b) {
  S.w = clone(b.w); S.a = clone(b.a); S.style = clone(b.style || S.style);
  S.corr = { ...b.corr }; S.trig = { ...(b.trig || {}) }; S.motion = b.motion || 0;
  PARTS.forEach(p => { if (!S.a[p]) S.a[p] = { id: null, gr: null, stones: [] }; });
  $('#motion').value = S.motion || '';
  renderWeapon(); renderArmor(); render();
}
function evalBuild(b) {
  const keep = clone({ w: S.w, a: S.a, style: S.style, corr: S.corr, trig: S.trig, motion: S.motion });
  S.w = clone(b.w); S.a = clone(b.a); S.style = clone(b.style || {}); S.corr = { ...b.corr }; S.trig = { ...(b.trig || {}) }; S.motion = b.motion || 0;
  const ws = weaponStats();
  const out = ws ? { r: calc(ws, aggregate()), ws } : null;
  S.w = keep.w; S.a = keep.a; S.style = keep.style; S.corr = keep.corr; S.trig = keep.trig; S.motion = keep.motion;
  return out;
}
function renderCompare() {
  const box = $('#cmp-box');
  if (!BUILDS.length) { box.innerHTML = '<div class="empty">저장된 세팅이 없습니다.<br>장비 세팅에서 <b>세팅 저장</b>을 눌러보세요.</div>'; return; }
  const rows = BUILDS.map((b, i) => ({ b, i, e: evalBuild(b) })).filter(x => x.e)
    .sort((a, b) => b.e.r.finalDmg - a.e.r.finalDmg);
  if (!rows.length) { box.innerHTML = '<div class="empty">계산 가능한 세팅이 없습니다.</div>'; return; }
  const max = rows[0].e.r.finalDmg;
  box.innerHTML = `<table><thead><tr><th>#</th><th>이름</th><th>무기</th><th class="n">총공</th><th class="n">총속</th>
    <th class="n">회심</th><th class="n">기댓값</th><th class="n">모션딜</th><th style="width:110px"></th><th></th></tr></thead><tbody>${
    rows.map((x, n) => `<tr>
      <td>${n + 1}</td>
      <td><b>${esc(x.b.name)}</b>${x.b.id === CUR_ID ? ' <span class="chip g">불러온 세팅</span>' : ''}<br><span class="note">${new Date(x.b.t).toLocaleString('ko-KR')}</span></td>
      <td>${esc(x.e.ws.name)}<br><span class="note">${esc(x.e.ws.series)}</span></td>
      <td class="n">${fmt(x.e.r.totalAtk)}</td><td class="n">${fmt(x.e.r.totalEle)}</td>
      <td class="n">${(x.e.r.critTotal * 100).toFixed(0)}%</td>
      <td class="n"><b style="font-size:15px">${fmt(x.e.r.finalDmg, 1)}</b><br>
        <span class="note">${n ? ((x.e.r.finalDmg / max - 1) * 100).toFixed(1) + '%' : '기준'}</span></td>
      <td class="n">${x.e.r.motionDmg != null ? fmt(x.e.r.motionDmg, 1) : '—'}</td>
      <td><div class="bar" style="width:${(x.e.r.finalDmg / max * 100).toFixed(1)}%"></div></td>
      <td><div class="btnrow" style="gap:4px"><button class="btn sm" data-load="${x.i}">불러오기</button>
          <button class="btn sm" data-over="${x.i}" title="지금 장비 세팅 화면의 내용으로 이 세팅을 덮어씁니다">덮어쓰기</button>
          <button class="btn sm" data-ren="${x.i}">이름</button>
          <button class="btn sm dg" data-del="${x.i}">삭제</button></div></td></tr>`).join('')}</tbody></table>`;
  box.querySelectorAll('[data-load]').forEach(b => b.onclick = e => {
    const b = BUILDS[+e.target.dataset.load];
    restore(b); CUR_ID = b.id; updateSaveUI(); go('set'); toast(`「${b.name}」을 불러왔습니다 — 고친 뒤 덮어쓰기로 저장됩니다`);
  });
  box.querySelectorAll('[data-over]').forEach(b => b.onclick = e => {
    const t = BUILDS[+e.target.dataset.over];
    if (!confirm(`「${t.name}」을 지금 장비 세팅 화면의 내용으로 덮어쓸까요?`)) return;
    overwriteBuild(t); CUR_ID = t.id; updateSaveUI(); renderCompare(); toast(`「${t.name}」에 덮어썼습니다`);
  });
  box.querySelectorAll('[data-ren]').forEach(b => b.onclick = e => {
    const t = BUILDS[+e.target.dataset.ren];
    const n = prompt('세팅 이름', t.name); if (!n || n === t.name) return;
    t.name = n; saveB(BUILDS); storeStatus(); updateSaveUI(); renderCompare();
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = e => {
    const t = BUILDS[+e.target.dataset.del];
    if (!confirm(`「${t.name}」을 삭제할까요?`)) return;
    BUILDS.splice(+e.target.dataset.del, 1); if (t.id === CUR_ID) CUR_ID = null;
    saveB(BUILDS); storeStatus(); updateSaveUI(); renderCompare();
  });
}

/* =========================================================
   도감
   ========================================================= */
function buildDex() {
  const kind = $('#dx-kind'), cat = $('#dx-cat'), elm = $('#dx-elem'), q = $('#dx-q'), sort = $('#dx-sort');
  elm.innerHTML = '<option value="">속성 전체</option>' + META.elements.map(e =>
    `<option value="${e}">${META.elementNames[e] || e}</option>`).join('');
  const fillCat = () => {
    cat.innerHTML = '<option value="">종류/부위 전체</option>' + (kind.value === 'w'
      ? META.weaponCategories.map(c => `<option value="${c}">${c}</option>`).join('')
      : PARTS.map(p => `<option value="${p}">${PARTNAME[p]}</option>`).join(''));
    elm.classList.toggle('hide', kind.value !== 'w');
    sort.classList.toggle('hide', kind.value !== 'w');
  };
  kind.onchange = () => { fillCat(); draw(); };
  [cat, elm, sort].forEach(x => x.onchange = draw);
  q.oninput = draw; fillCat(); draw();

  function draw() {
    const box = $('#dx-box'), kw = q.value.trim().toLowerCase();
    if (kind.value === 'w') {
      let list = WEAPONS.filter(w => (!cat.value || w.catName === cat.value) && (!elm.value || w.elem === elm.value)
        && (!kw || (w.final + w.base + w.series + w.skAll.map(skName).join('')
            + specTags(w).join(' ') + specShort(w)).toLowerCase().includes(kw)));
      const top = w => w.g[w.g.length - 1].lv[4];
      if (sort.value) { const i = { atk: 0, ele: 1, crit: 2 }[sort.value]; list = [...list].sort((a, b) => top(b)[i] - top(a)[i]); }
      $('#dx-count').textContent = list.length + '개';
      box.innerHTML = `<table><thead><tr><th></th><th>이름</th><th>종류</th><th>세트</th><th>속성</th>
        <th class="n">최대공</th><th class="n">속성</th><th class="n">회심</th><th>무기 스킬</th><th>고유</th></tr></thead><tbody>${
        list.slice(0, 400).map(w => { const g = w.g[w.g.length - 1], L = g.lv[4]; return `<tr>
          <td>${w.img ? `<img loading="lazy" src="${w.img}" style="width:28px;height:28px;object-fit:contain">` : ''}</td>
          <td><b>${esc(g.name)}</b>${badges(w)}</td><td>${w.catName}</td>
          <td>${w.icon ? `<img loading="lazy" src="${w.icon}" style="width:20px;height:20px;object-fit:contain;vertical-align:-4px">` : ''} ${esc(w.series)}</td>
          <td>${META.elementNames[w.elem] || '—'}</td>
          <td class="n">${fmt(L[0])}</td><td class="n">${L[1] ? fmt(L[1]) : '—'}</td><td class="n">${L[2] ? L[2] + '%' : '—'}</td>
          <td>${g.sk.map(([k, l]) => `<span class="chip">${esc(skName(k))} ${l}</span>`).join(' ')}</td>
          <td><span class="note">${esc(specShort(w))}</span></td></tr>`; }).join('')}
        </tbody></table>${list.length > 400 ? '<div class="note" style="padding:8px">상위 400개 표시 — 검색으로 좁혀보세요.</div>' : ''}`;
    } else {
      const list = ARMOR.filter(a => (!cat.value || a.cat === cat.value)
        && (!kw || (a.series + a.name + a.skAll.map(skName).join('')).toLowerCase().includes(kw)));
      $('#dx-count').textContent = list.length + '개';
      box.innerHTML = `<table><thead><tr><th></th><th>세트</th><th>부위</th><th class="n">최대G</th>
        <th class="n">방어력</th><th class="n">슬롯</th><th>스킬</th></tr></thead><tbody>${
        list.map(a => { const g = a.g[a.g.length - 1]; return `<tr>
          <td>${a.icon ? `<img loading="lazy" src="${a.icon}" style="width:26px;height:26px;object-fit:contain">` : ''}</td>
          <td><b>${esc(a.series)}</b>${badges(a)}</td>
          <td>${a.catName}</td><td class="n">G${g.gr}</td><td class="n">${g.def[4] || '—'}</td><td class="n">${g.slot}</td>
          <td>${g.sk.map(([k, l]) => `<span class="chip">${esc(skName(k))} ${l}</span>`).join(' ')}</td></tr>`; }).join('')}
        </tbody></table>`;
    }
  }
}

/* =========================================================
   스킬 매핑 편집
   ========================================================= */
const GROUPS = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'CRIT', 'CRIT_MULT', 'BRUTAL', 'CRIT_ELEM'];
function renderMap() {
  const box = $('#map-box'), q = $('#map-q').value.trim().toLowerCase();
  const only = $('#map-only').value;
  let list = Object.values(SKILLS).sort((a, b) => a.sort - b.sort);
  if (only === 'on') list = list.filter(s => cfgOf(s.kind)?.g);
  if (only === 'off') list = list.filter(s => !cfgOf(s.kind)?.g);
  // 딜에 들어가는 스킬은 분류가 전투 동작·방어여도 보여 준다 (차지 스톡 등)
  if (only === 'atk') list = list.filter(s => cfgOf(s.kind)?.g || s.cat === 'ATTACK_BOOST' || s.cat === 'ELEMENT_BOOST');
  if (q) list = list.filter(s => (s.name + s.kind).toLowerCase().includes(q));
  $('#map-count').textContent = list.length + '개' + (Object.keys(CFG_OV).length ? ` · 수정 ${Object.keys(CFG_OV).length}` : '');
  box.innerHTML = `<table><thead><tr>
      <th style="width:180px">스킬</th><th style="width:148px">그룹</th><th style="width:230px">쓸 수치 (Lv1→최대)</th>
      <th style="width:74px">단위</th>
      <th style="width:78px" title="평소 기대치. 스택이 쌓이는 스킬은 평균 스택 수를 넣습니다">발동률</th>
      <th style="width:62px" title="장비 세팅 화면에서 발동 / 평균 / 미발동 버튼을 띄울 스킬">조건부</th>
      <th style="width:74px" title="「발동」을 눌렀을 때 쓸 값. 보통 1, 스택이 쌓이는 스킬은 최대 스택 수">발동 시</th>
      <th>설명 (최대 Lv)</th></tr></thead><tbody>${
    list.map(s => { const c = cfgOf(s.kind) || {}; const ov = CFG_OV[s.kind];
      const nSlot = Math.max(...s.levels.map(l => l.eff.length), 0);
      const slots = Array.from({ length: nSlot }, (_, n) =>
        `<option value="${n}"${(c.i ?? 0) === n ? ' selected' : ''}>${s.levels.map(l => l.eff[n]).join(' → ')}</option>`).join('');
      return `<tr${ov ? ' style="background:#2a211044"' : ''}>
        <td><b>${esc(s.name)}</b><br><span class="note">${META.skillCatNames[s.cat] || s.cat}</span></td>
        <td><select class="sm" data-mg="${s.kind}">${GROUPS.map(g =>
          `<option value="${g}"${(c.g || '') === g ? ' selected' : ''}>${GROUP_LABEL[g] || g}</option>`).join('')}</select></td>
        <td>${nSlot ? `<select class="sm" data-mi="${s.kind}">${slots}</select>` : '<span class="note">수치 없음</span>'}</td>
        <td><select class="sm" data-ms2="${s.kind}">
          <option value="0.01"${(c.s ?? 0.01) === 0.01 ? ' selected' : ''}>%</option>
          <option value="1"${c.s === 1 ? ' selected' : ''}>그대로</option></select></td>
        <td><input class="sm" type="number" step="0.01" min="0" max="99" value="${defaultRateOf(s.kind)}" data-mc="${s.kind}"${
          c.g ? (isAilmentLinked(s.kind) ? ' title="지금 무기·스킬의 상태 이상 축적 확률에 연동 — 여기서 고치면 연동이 풀리고, 기본값 복원으로 다시 연동됩니다"' : '') : ' disabled'}></td>
        <td style="text-align:center"><input type="checkbox" data-mcond="${s.kind}"${condOf(s.kind) ? ' checked' : ''}${
          c.g ? '' : ' disabled title="딜 미반영 스킬에는 필요 없습니다"'}></td>
        <td><input class="sm" type="number" step="0.01" min="0" max="99" value="${onValOf(s.kind)}" data-mon="${s.kind}"${
          c.g && condOf(s.kind) ? '' : ' disabled title="조건부 스킬에만 씁니다"'}></td>
        <td><span class="note">${esc((s.levels[s.levels.length - 1].desc || '').slice(0, 110))}</span></td>
      </tr>`; }).join('')}</tbody></table>`;
  const set = (kind, patch) => {
    const base = SKILL_CFG[kind] || {};
    CFG_OV[kind] = { ...(CFG_OV[kind] || { g: base.g || '', i: base.i ?? 0, s: base.s ?? 0.01, corr: base.corr ?? 1 }), ...patch };
    localStorage.setItem(CFG_LS, JSON.stringify(CFG_OV));
    applyCfgOv();
    // 값을 고친 칸에 포커스가 남은 채로 표를 갈아끼우면 브라우저가 오류를 냅니다 — 포커스를 빼고 다음 틱에 다시 그립니다
    try { document.activeElement?.blur(); } catch (e) { }
    setTimeout(() => { renderMap(); render(); }, 0);
  };
  box.querySelectorAll('[data-mg]').forEach(e => e.onchange = ev => set(ev.target.dataset.mg, { g: ev.target.value }));
  box.querySelectorAll('[data-mi]').forEach(e => e.onchange = ev => set(ev.target.dataset.mi, { i: Number(ev.target.value) || 0 }));
  box.querySelectorAll('[data-ms2]').forEach(e => e.onchange = ev => set(ev.target.dataset.ms2, { s: Number(ev.target.value) }));
  box.querySelectorAll('[data-mc]').forEach(e => e.onchange = ev => {
    const k = ev.target.dataset.mc;
    delete S.corr[k];                               // 이번 세팅에서 고쳐 둔 값보다 기본값이 우선하도록
    set(k, { rate: Number(ev.target.value) });      // 내보내기에 담기는 값
  });
  box.querySelectorAll('[data-mon]').forEach(e => e.onchange = ev =>
    set(ev.target.dataset.mon, { onv: Number(ev.target.value) }));
  box.querySelectorAll('[data-mcond]').forEach(e => e.onchange = ev => {
    const k = ev.target.dataset.mcond, v = ev.target.checked;
    if (!v) delete S.trig[k];                       // 조건부에서 빼면 발동/미발동 선택도 지운다
    set(k, { cond: v });
  });
}
function buildMap() {
  $('#map-q').oninput = renderMap;
  $('#map-only').onchange = renderMap;
  $('#map-reset').onclick = () => { CFG_OV = {}; localStorage.removeItem(CFG_LS); applyCfgOv(); renderMap(); render(); toast('기본값으로 되돌렸습니다'); };
  $('#map-export').onclick = () => {
    const blob = new Blob([JSON.stringify(CFG_OV, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = '스킬매핑_수정본.json'; a.click();
  };
  $('#map-import').onclick = () => $('#map-file').click();
  $('#map-file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        if (!j || typeof j !== 'object' || Array.isArray(j)) throw 0;
        CFG_OV = j;
        localStorage.setItem(CFG_LS, JSON.stringify(CFG_OV));
        applyCfgOv(); renderMap(); render();
        toast(`스킬 매핑 ${Object.keys(j).length}개를 불러왔습니다`);
      } catch (err) { toast('스킬 매핑 파일을 읽지 못했습니다 — JSON 형식을 확인하세요'); }
    };
    rd.readAsText(f); e.target.value = '';
  };
}

/* =========================================================
   장비 툴팁 — 마우스를 올리면 잘린 이름·스킬·설명을 전부 보여준다
   ========================================================= */
const TIP = { el: null, timer: 0, target: null };
const tipBadges = badges;
function skDesc(k, lv) {
  const s = SKILLS[k]; if (!s || !s.levels?.length) return '';
  const L = s.levels, want = Math.min(lv, s.max ?? lv);
  return (L.find(x => x.lv === want) || L[L.length - 1]).desc || '';
}
function tipSkills(sk, title) {
  return `<div class="tip-sec"><div class="tip-lbl">${title}</div>${!sk.length ? '<div class="tip-dim">없음</div>'
    : sk.map(([k, l]) => { const max = SKILLS[k]?.max ?? 5, d = skDesc(k, l);
      return `<div class="tip-sk"><b>${esc(skName(k))}</b> <span class="tip-lv${l > max ? ' ov' : ''}">Lv${l}/${max}</span>
        ${d ? `<div class="tip-desc">${esc(d)}</div>` : ''}</div>`; }).join('')}</div>`;
}
function tipSpec(w) {
  const s = w.spec; if (!s) return '';
  const body = s.kind === 'AMMO'
    ? s.rows.map(r => `<div class="tip-ammo">${r.color ? `<span class="dot" style="background:${esc(r.color)}"></span>` : ''}
        <b>${esc(r.n)}</b><span class="tip-dim">장전 ${esc(r.c)} · 반동 ${esc(r.r || '—')} · 리로드 ${esc(r.l || '—')}</span></div>`).join('')
    : s.list ? `<div>${s.list.map(esc).join(', ') || '없음'}</div>`
    : `<div>${esc(s.text || '—')}</div>`;
  return `<div class="tip-sec"><div class="tip-lbl">${esc(s.label)}</div>${body}</div>`;
}
function tipWeapon(w, cur) {
  let g, name, atk, ele, crit, lv;
  if (cur) { const st = weaponStats(); ({ g, name, atk, ele } = st); crit = st.crit * 100; lv = S.w.lv; }
  else { g = w.g[w.g.length - 1]; name = g.name; [atk, ele, crit] = g.lv[4]; lv = 5; }
  const prof = styleProfile(w.id);
  return `<div class="tip-hd"><b>${esc(name)}</b>${tipBadges(w)}</div>
    <div class="tip-sub">${w.catName} · ${esc(w.series)} · ${META.elementNames[w.elem] || '무속성'}</div>
    <div class="tip-stat">G${g.gr} Lv${lv} · 공격 <b>${fmt(atk)}</b>${ele ? ` · 속성 <b>${fmt(ele)}</b>` : ''}${crit ? ` · 회심 <b>${fmt(crit)}%</b>` : ''}</div>
    ${tipSkills(g.sk, '무기 스킬')}${tipSpec(w)}
    <div class="tip-sec"><div class="tip-lbl">스타일 강화</div>${prof ? '<div class="tip-ok">가능</div>' : '<div class="tip-dim">불가능</div>'}${
      cur && prof ? (() => { const b = styleBonus(S.style, w.id);
        return b.atk || b.ele || b.crit ? `<div class="tip-stat" style="margin-top:2px">적용 시 공격 <b>${fmt(atk + b.atk)}</b>${ele || b.ele ? ` · 속성 <b>${fmt(ele + b.ele)}</b>` : ''}${crit || b.crit ? ` · 회심 <b>${fmt(crit + b.crit * 100)}%</b>` : ''}</div>` : ''; })() : ''}</div>`;
}
function tipArmor(a, part) {
  const cur = part ? S.a[part] : null;
  const g = (cur && a.g.find(x => x.gr === cur.gr)) || a.g[a.g.length - 1];
  const stones = cur ? (cur.stones || []).filter(Boolean) : [];
  return `<div class="tip-hd"><b>${esc(a.series)} · ${a.catName}</b>${tipBadges(a)}</div>
    ${a.name && a.name !== a.series ? `<div class="tip-sub">${esc(a.name)}</div>` : ''}
    <div class="tip-stat">G${g.gr} · 방어 <b>${g.def[4] || '—'}</b> · 표류석 <b>${g.slot}</b>칸</div>
    ${tipSkills(g.sk, '방어구 스킬')}
    ${stones.length ? `<div class="tip-sec"><div class="tip-lbl">장착 표류석</div>${stones.map(x =>
      `<div class="tip-sk"><b>${esc(skName(x.kind))}</b> <span class="tip-dim">${esc(x.color)}</span></div>`).join('')}</div>` : ''}`;
}
// 스킬 하나 — 집계 스킬 칸과 같은 레벨별 설명 (방어구 일괄 선택의 「선택 조합 스킬」 칩)
function tipSkill(k, lv) {
  const s = SKILLS[k], max = s?.max ?? 5, cfg = cfgOf(k);
  const d = skillDescHtml(k, Math.min(lv, max));
  return `<div class="tip-hd"><b>${esc(skName(k))}</b><span class="tip-lv${lv > max ? ' ov' : ''}">Lv${lv}/${max}</span></div>
    <div class="tip-sub">${cfg?.g ? esc(GROUP_LABEL[cfg.g] || cfg.g) : '딜 미반영'}${lv > max ? ` · 상한 초과 — Lv${max} 로 계산` : ''}</div>
    ${d ? `<div class="tip-sec ds tip-ds">${d}</div>` : ''}`;
}
function tipHtml(t) {
  const [kind, v, x] = (t.dataset.tip || '').split('|');
  if (kind === 'sk') return SKILLS[v] ? tipSkill(v, +x || 1) : '';
  if (kind === 'wsel') { const w = W_BY_ID[S.w.id]; return w ? tipWeapon(w, true) : ''; }
  if (kind === 'w') { const w = W_BY_ID[v]; return w ? tipWeapon(w, false) : ''; }
  if (kind === 'asel') { const a = A_BY_ID[S.a[v]?.id]; return a ? tipArmor(a, v) : ''; }
  if (kind === 'a') { const a = A_BY_ID[v]; return a ? tipArmor(a, null) : ''; }
  // 그 밖의 목록 항목(표류석 스킬 등)은 글자가 실제로 잘렸을 때만 전체 텍스트를 보여준다
  const parts = [...t.querySelectorAll('.tx b, .tx em')];
  if (!parts.some(e => e.scrollWidth > e.clientWidth + 1)) return '';
  return parts.map((e, i) => i ? `<div class="tip-sub">${esc(e.textContent.trim())}</div>`
    : `<div class="tip-hd"><b>${esc(e.textContent.trim())}</b></div>`).join('');
}
function tipShow(t) {
  const html = tipHtml(t); if (!html) return;
  const el = TIP.el; el.innerHTML = html;
  const r = t.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, m = 8;
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = r.left, y = r.bottom + 6;
  if (y + h > vh - m) y = r.top - h - 6;                       // 아래가 좁으면 위로
  if (y < m) {                                                 // 위도 좁으면 옆으로
    y = Math.max(m, Math.min(vh - h - m, r.top));
    x = r.right + 8; if (x + w > vw - m) x = r.left - w - 8;
  }
  el.style.left = Math.max(m, Math.min(vw - w - m, x)) + 'px';
  el.style.top = y + 'px';
  el.classList.add('on');
}
function tipHide() { clearTimeout(TIP.timer); TIP.target = null; if (TIP.el) TIP.el.classList.remove('on'); }
function initTip() {
  TIP.el = document.createElement('div'); TIP.el.className = 'tip'; TIP.el.setAttribute('role', 'tooltip');
  document.body.appendChild(TIP.el);
  // pointermove 로 판정 — 스크롤·클릭으로 숨긴 뒤에도 마우스를 살짝 움직이면 다시 뜬다
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;                    // 터치에서는 띄우지 않음
    const t = e.target.closest('[data-tip], .slot, .pitem, .bitem');
    if (t === TIP.target) return;
    tipHide(); if (!t) return;
    TIP.target = t;
    TIP.timer = setTimeout(() => { if (TIP.target === t && t.isConnected) tipShow(t); }, 280);
  });
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) tipHide(); });   // 창 밖으로 나감
  ['pointerdown', 'keydown', 'wheel', 'scroll'].forEach(ev => document.addEventListener(ev, tipHide, true));
}

/* =========================================================
   부팅
   ========================================================= */
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1800); }
function go(tab) {
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['set', 'cmp', 'dex', 'map'].forEach(t => $('#pg-' + t).classList.toggle('hide', t !== tab));
  if (tab === 'cmp') renderCompare();
  if (tab === 'map') renderMap();
}
const enc = () => btoa(unescape(encodeURIComponent(JSON.stringify(snapshot('공유 세팅')))));
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s))));

function boot() {
  initTip();
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#mo')) softCloseModal(); });
  $('#slot-w').onclick = pickWeapon;
  $('#btn-bulk-armor').onclick = openArmorBulk;
  $('#btn-bulk-stone').onclick = openStoneBulk;
  $('#motion').oninput = e => { S.motion = Number(e.target.value) || 0; render(); };
  $$('[data-bulktrig]').forEach(b => b.onclick = () => {
    const v = b.dataset.bulktrig;
    (window.__condOn || []).forEach(k => {
      if (v) S.trig[k] = v; else { delete S.trig[k]; delete S.corr[k]; }
    });
    render();
  });
  $$('nav.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
  buildDex(); buildMap(); renderWeapon(); renderArmor();

  $('#btn-save').onclick = () => {
    const b = curBuild();
    if (!b) { saveAsNew(`세팅 ${BUILDS.length + 1}`); updateSaveUI(); return; }
    overwriteBuild(b); updateSaveUI();
    toast(`「${b.name}」에 덮어썼습니다${FILE_HANDLE ? ' (파일에도 기록)' : ''}`);
  };
  $('#btn-save-new').onclick = () => {
    const b = curBuild();
    saveAsNew(b ? `${b.name} 2` : `세팅 ${BUILDS.length + 1}`); updateSaveUI();
  };
  $('#btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify({ v: 2, builds: BUILDS.length ? BUILDS : [snapshot('현재 세팅')] }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `몬나세팅_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#btn-import').onclick = () => $('#file-import').click();
  $('#file-import').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try {
      const j = JSON.parse(rd.result), arr = j.builds || (Array.isArray(j) ? j : [j]);
      BUILDS = BUILDS.concat(arr.map(b => ({ ...b, id: newBid() }))); saveB(BUILDS); storeStatus();
      toast(`${arr.length}개 불러왔습니다`); go('cmp');
    } catch (err) { toast('파일을 읽지 못했습니다'); } };
    rd.readAsText(f); e.target.value = '';
  };
  $('#btn-share').onclick = () => {
    const u = location.origin + location.pathname + '#b=' + enc();
    navigator.clipboard?.writeText(u).then(() => toast('링크를 복사했습니다'), () => prompt('복사하세요', u));
  };
  $('#btn-reset').onclick = () => {
    S.w = { id: null, gr: null, lv: 5 }; S.style = { lv: 0, m10: null, m15: null, m20: null, atk: 0, ele: 0, crit: 0 };
    PARTS.forEach(p => S.a[p] = { id: null, gr: null, stones: [] });
    S.corr = {}; S.trig = {}; S.motion = 0; $('#motion').value = '';
    CUR_ID = null; renderWeapon(); renderArmor(); render(); toast('초기화했습니다');
  };
  if (location.hash.startsWith('#b=')) { try { restore(dec(location.hash.slice(3))); toast('공유 세팅을 불러왔습니다'); } catch (e) { } }
  const t = _selfTest(SKILLS);
  $('#verify').innerHTML = t.pass ? '<span class="chip g">계산 검증 통과</span>' : '<span class="chip r">검증 실패</span>';
  storeStatus();
  render();
}
document.addEventListener('DOMContentLoaded', boot);
