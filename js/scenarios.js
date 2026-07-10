/* ============================================================
   场景里程碑 —— 把零散题目归到“真实生活场景”，
   某场景的题都至少答对过一次 → 该场景“已拿下”。
   反焦虑：只做“已达成”的正向里程碑，不显示“还差几题”的欠债。
   （第3步上 PG 后对应 scenarios / drill_scenario 两表。）
   ============================================================ */

const SCENARIOS = [
  { id:'sc_bar',    icon:'🍺', name:'在酒吧点单',   drills:['sub_07','sub_08','rsp_03','exp_01','exp_02'] },
  { id:'sc_quedar', icon:'📅', name:'和朋友约见面', drills:['sub_09','exp_03','exp_04','rsp_02'] },
  { id:'sc_phone',  icon:'📞', name:'接电话',       drills:['chk_08','rsp_08'] },
  { id:'sc_street', icon:'🧭', name:'路上被搭话',   drills:['rsp_01','rsp_05','rsp_06','rsp_07'] },
  { id:'sc_daily',  icon:'💬', name:'日常口头禅',   drills:['chk_01','chk_02','chk_03','chk_04','chk_09','chk_10'] },
  { id:'sc_grammar',icon:'🔧', name:'基本语法操作', drills:['trf_01','trf_02','trf_04','trf_05','trf_06'] },
];

const Scenarios = (() => {
  function reachedSet() {
    // 每题是否“至少答对过一次”
    const ok = {};
    Store.allAttempts().forEach(a => { if (a.verdict !== 'wrong') ok[a.id] = true; });
    return ok;
  }

  function render(container) {
    const ok = reachedSet();
    const cards = SCENARIOS.map(sc => {
      const done = sc.drills.filter(id => ok[id]).length;
      const reached = done === sc.drills.length;
      return `<div class="sc-card ${reached?'reached':''}">
        <div class="sc-icon">${sc.icon}</div>
        <div class="sc-body">
          <div class="sc-name">${sc.name} ${reached?'<span class="sc-badge">已拿下</span>':''}</div>
          <div class="sc-prog">${done} / ${sc.drills.length} 句已答对</div>
        </div>
      </div>`;
    }).join('');
    container.innerHTML = `<div class="sc-list">${cards}</div>`;
  }

  return { render };
})();
