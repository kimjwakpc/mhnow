// mhn.quest 번들(JS 모듈) → 빌드가 읽는 JSON 한 개로 변환
//   node src/mhnquest_to_json.mjs
// 입력: sources/mhnquest/mhnq_data.js, sources/mhnquest/mhnq_lang_ko.js
// 출력: sources/mhnquest/mhnquest.json
import fs from 'fs';
import path from 'path';
import url from 'url';

const BASE = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const SRC = path.join(BASE, 'sources', 'mhnquest');
const f = n => url.pathToFileURL(path.join(SRC, n)).href;

const D = await import(f('mhnq_data.js'));
const KO = (await import(f('mhnq_lang_ko.js'))).default;

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const out = {
  set: D.set,                     // 시리즈별 속성·탄종·병·포격·선율·사냥벌레
  eq: D.eq,                       // 시리즈별 부위 스킬 · 표류석 슬롯
  weaponVal: D.weaponVal,         // 수치표 (등급1 Lv1 … 등급10 Lv5 = 50칸)
  armorVal: D.armorVal,
  ko: pick(KO, ['skill-name', 'skill', 'monster-name', 'ammo', 'arrow', 'phial', 'sa-phial',
                'shelling', 'songs', 'bottle', 'lv', 'sp', 'stat']),
};
fs.mkdirSync(SRC, { recursive: true });
fs.writeFileSync(path.join(SRC, 'mhnquest.json'), JSON.stringify(out));
console.log('mhnquest.json 생성 — 세트', Object.keys(D.set).length,
            '· 수치표', Object.keys(D.weaponVal).length,
            '·', (fs.statSync(path.join(SRC, 'mhnquest.json')).size / 1024).toFixed(0) + 'KB');
