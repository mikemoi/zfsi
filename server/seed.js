import 'dotenv/config';
import fs from 'node:fs';
import * as repo from './repo.js';

// 复用前端内置题库：把 js/data.js 当脚本求值，取出 DECK
const code = fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8') + '\n; return { DECK };';
const { DECK } = new Function(code)();

const SCENARIOS = [
  { id:'sc_bar',    icon:'🍺', name:'在酒吧点单',   drills:['sub_07','sub_08','rsp_03','exp_01','exp_02'] },
  { id:'sc_quedar', icon:'📅', name:'和朋友约见面', drills:['sub_09','exp_03','exp_04','rsp_02'] },
  { id:'sc_phone',  icon:'📞', name:'接电话',       drills:['chk_08','rsp_08'] },
  { id:'sc_street', icon:'🧭', name:'路上被搭话',   drills:['rsp_01','rsp_05','rsp_06','rsp_07'] },
  { id:'sc_daily',  icon:'💬', name:'日常口头禅',   drills:['chk_01','chk_02','chk_03','chk_04','chk_09','chk_10'] },
  { id:'sc_grammar',icon:'🔧', name:'基本语法操作', drills:['trf_01','trf_02','trf_04','trf_05','trf_06'] },
];

for (const d of DECK) repo.upsertDrill(d, 'builtin');
console.log(`✔ 灌入 ${DECK.length} 道题`);
for (const s of SCENARIOS) repo.upsertScenario(s);
console.log(`✔ 灌入 ${SCENARIOS.length} 个场景`);
