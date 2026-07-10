/* ============================================================
   复习/统计视图 —— 全部从 attempts 流水账算出
   包含：概览、易错句型排行、重音专项、速度画像、反应时/正确率趋势
   反焦虑：中性展示，无 streak、无催促。图表用内联 SVG，离线可用。
   ============================================================ */

const Stats = (() => {

  const promptOf = id => (DECK.find(d => d.id === id) || {}).prompt || id;
  const canonOf  = id => (DECK.find(d => d.id === id) || {}).canonical || '';

  function dayKey(ts) {
    const d = new Date(ts); d.setHours(0,0,0,0);
    return d.getTime();
  }
  function fmtDay(ts) {
    const d = new Date(ts);
    return `${d.getMonth()+1}/${d.getDate()}`;
  }

  function compute() {
    const att = Store.allAttempts();
    const total = att.length;
    const correct = att.filter(a => a.verdict !== 'wrong').length;
    const accent  = att.filter(a => a.accent_only).length;

    // 按题型
    const byType = {};
    DRILL_ORDER.forEach(t => byType[t] = { n:0, ok:0, elapsed:[] });
    att.forEach(a => {
      const b = byType[a.type]; if (!b) return;
      b.n++; if (a.verdict !== 'wrong') b.ok++;
      if (a.elapsed_ms) b.elapsed.push(a.elapsed_ms);
    });

    // 易错句型排行（按 drill id 聚合错误率，至少练过2次才排）
    const byId = {};
    att.forEach(a => {
      const b = byId[a.id] || (byId[a.id] = { n:0, wrong:0 });
      b.n++; if (a.verdict === 'wrong') b.wrong++;
    });
    const hardest = Object.entries(byId)
      .filter(([,b]) => b.n >= 2 && b.wrong > 0)
      .map(([id,b]) => ({ id, n:b.n, wrong:b.wrong, rate:b.wrong/b.n }))
      .sort((x,y) => y.rate - x.rate || y.wrong - x.wrong)
      .slice(0, 8);

    // 速度画像（各题型平均反应时，秒）
    const speed = DRILL_ORDER.map(t => {
      const e = byType[t].elapsed;
      const avg = e.length ? e.reduce((a,b)=>a+b,0)/e.length/1000 : null;
      return { type:t, label:DRILL_LABELS[t], avg, n:byType[t].n };
    });

    // 趋势（按天）：平均反应时(秒) + 正确率
    const days = {};
    att.forEach(a => {
      const k = dayKey(a.at);
      const d = days[k] || (days[k] = { k, n:0, ok:0, elapsed:[] });
      d.n++; if (a.verdict !== 'wrong') d.ok++;
      if (a.elapsed_ms) d.elapsed.push(a.elapsed_ms);
    });
    const trend = Object.values(days).sort((a,b)=>a.k-b.k).map(d => ({
      k:d.k, label:fmtDay(d.k), n:d.n,
      rt: d.elapsed.length ? d.elapsed.reduce((a,b)=>a+b,0)/d.elapsed.length/1000 : null,
      acc: d.n ? d.ok/d.n : null,
    }));

    return {
      total, correct, accent,
      accuracy: total ? correct/total : 0,
      accentRate: total ? accent/total : 0,
      byType, hardest, speed, trend,
    };
  }

  // ---------- SVG 图表 ----------
  function lineChart(points, { yLabel, fmtY, color }) {
    // points: [{label, y}]，y 可为 null（跳过）
    const W=560, H=180, pad={l:44,r:14,t:16,b:28};
    const valid = points.filter(p => p.y != null);
    if (valid.length === 0) return `<div class="empty">还没有数据，练几题就出来了。</div>`;
    const ys = valid.map(p=>p.y);
    let min=Math.min(...ys), max=Math.max(...ys);
    if (min===max) { min = Math.max(0, min-1); max = max+1; }
    const iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
    const n=points.length;
    const X = i => pad.l + (n<=1 ? iw/2 : iw*i/(n-1));
    const Y = v => pad.t + ih*(1-(v-min)/(max-min));

    let path='', dots='';
    let prev=null;
    points.forEach((p,i) => {
      if (p.y==null) return;
      const x=X(i), y=Y(p.y);
      path += (prev===null?'M':'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"/>`;
      prev=i;
    });
    // y 轴刻度（min/mid/max）
    const ticks=[min,(min+max)/2,max].map(v=>{
      const y=Y(v);
      return `<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" class="grid"/>
              <text x="${pad.l-8}" y="${y+4}" class="ytick">${fmtY(v)}</text>`;
    }).join('');
    // x 标签（最多显示首末与均匀几个）
    const step=Math.ceil(n/6);
    const xlabels=points.map((p,i)=>(i%step===0||i===n-1)
      ? `<text x="${X(i)}" y="${H-8}" class="xtick">${p.label}</text>`:'').join('');

    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
      ${ticks}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}${xlabels}
    </svg>`;
  }

  function barRows(rows) {
    // rows: [{label, value(0-1), right}]
    if (!rows.length) return `<div class="empty">还没有数据。</div>`;
    return `<div class="bars">` + rows.map(r => `
      <div class="barrow">
        <div class="barlabel" title="${esc(r.label)}">${esc(r.label)}</div>
        <div class="bartrack"><div class="barfill" style="width:${Math.round(r.value*100)}%"></div></div>
        <div class="barright">${r.right}</div>
      </div>`).join('') + `</div>`;
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function render(container) {
    const s = compute();
    const pct = x => (x*100).toFixed(0) + '%';
    const sec = x => x==null ? '—' : x.toFixed(1)+'s';

    container.innerHTML = `
      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-num">${s.total}</div><div class="stat-cap">累计练习</div></div>
        <div class="stat-tile"><div class="stat-num">${s.total?pct(s.accuracy):'—'}</div><div class="stat-cap">正确率</div></div>
        <div class="stat-tile"><div class="stat-num">${s.total?pct(s.accentRate):'—'}</div><div class="stat-cap">仅重音错</div></div>
      </div>

      <h3 class="stat-h">反应时趋势 <span class="stat-sub">越低越自动化</span></h3>
      ${lineChart(s.trend.map(t=>({label:t.label,y:t.rt})), { fmtY:v=>v.toFixed(1)+'s', color:'var(--accent)' })}

      <h3 class="stat-h">正确率趋势</h3>
      ${lineChart(s.trend.map(t=>({label:t.label,y:t.acc==null?null:t.acc*100})), { fmtY:v=>v.toFixed(0)+'%', color:'var(--ok)' })}

      <h3 class="stat-h">速度画像 <span class="stat-sub">各题型平均反应</span></h3>
      ${barRows(s.speed.filter(x=>x.avg!=null).map(x=>{
        const maxAvg = Math.max(...s.speed.filter(y=>y.avg!=null).map(y=>y.avg),1);
        return { label:x.label, value:x.avg/maxAvg, right:sec(x.avg) };
      }))}

      <h3 class="stat-h">最容易卡壳的句型</h3>
      ${barRows(s.hardest.map(h=>({ label:promptOf(h.id), value:h.rate, right:`${h.wrong}/${h.n}` })))}
      ${s.hardest.length? `<p class="stat-note">这些会被 SRS 更早排回来复习。</p>`:''}
    `;
  }

  return { render, compute };
})();
