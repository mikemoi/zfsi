import 'dotenv/config';
import fs from 'node:fs';
import { pool, q } from './db.js';

// 复用前端内置题库：把 js/data.js 当脚本求值，取出 DECK
const code = fs.readFileSync(new URL('../js/data.js', import.meta.url), 'utf8')
  + '\n; return { DECK };';
const { DECK } = new Function(code)();

// 场景（对应 js/scenarios.js）
const SCENARIOS = [
  { id:'sc_bar',    icon:'🍺', name:'在酒吧点单',   drills:['sub_07','sub_08','rsp_03','exp_01','exp_02'] },
  { id:'sc_quedar', icon:'📅', name:'和朋友约见面', drills:['sub_09','exp_03','exp_04','rsp_02'] },
  { id:'sc_phone',  icon:'📞', name:'接电话',       drills:['chk_08','rsp_08'] },
  { id:'sc_street', icon:'🧭', name:'路上被搭话',   drills:['rsp_01','rsp_05','rsp_06','rsp_07'] },
  { id:'sc_daily',  icon:'💬', name:'日常口头禅',   drills:['chk_01','chk_02','chk_03','chk_04','chk_09','chk_10'] },
  { id:'sc_grammar',icon:'🔧', name:'基本语法操作', drills:['trf_01','trf_02','trf_04','trf_05','trf_06'] },
];

let n = 0;
for (const d of DECK) {
  await q(
    `INSERT INTO drills(id,type,level,tag,context,prompt,canonical,accepted,note,judge,source_type)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'builtin')
     ON CONFLICT(id) DO UPDATE SET
       type=$2,level=$3,tag=$4,context=$5,prompt=$6,canonical=$7,accepted=$8,note=$9,judge=$10`,
    [d.id, d.type, d.level, d.tag || null, d.context || '', d.prompt, d.canonical,
     JSON.stringify(d.accepted || []), d.note || '', d.judge || 'local']);
  n++;
}
console.log(`✔ 灌入 ${n} 道题`);

for (const s of SCENARIOS) {
  await q(`INSERT INTO scenarios(id,icon,name) VALUES($1,$2,$3)
           ON CONFLICT(id) DO UPDATE SET icon=$2,name=$3`, [s.id, s.icon, s.name]);
  for (const did of s.drills) {
    await q(`INSERT INTO drill_scenario(scenario_id,drill_id) VALUES($1,$2)
             ON CONFLICT DO NOTHING`, [s.id, did]);
  }
}
console.log(`✔ 灌入 ${SCENARIOS.length} 个场景`);

await pool.end();
