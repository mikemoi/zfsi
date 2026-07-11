/* ============================================================
   设置 + 数据导出/导入/重置 + 改 PIN
   设置存 localStorage 'zfsi_settings'；app.js 读取默认输入模式与每组题数。
   ============================================================ */

const Settings = (() => {
  const K = 'zfsi_settings';
  const DEFAULTS = { defaultMode: 'typed', groupSize: 20, autoSpeak: false };

  function get() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(K)) || {}); }
    catch { return { ...DEFAULTS }; }
  }
  function set(patch) {
    const s = Object.assign(get(), patch);
    localStorage.setItem(K, JSON.stringify(s));
    return s;
  }

  function exportBackup() {
    const dump = {
      _app: 'zfsi', _ver: 1, _at: new Date().toISOString(),
      srs: JSON.parse(localStorage.getItem('zfsi_srs') || '{}'),
      attempts: JSON.parse(localStorage.getItem('zfsi_attempts') || '[]'),
      accepted: JSON.parse(localStorage.getItem('zfsi_accepted') || '{}'),
      settings: get(),
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zfsi-backup-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importBackup(file, done) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d._app !== 'zfsi') throw new Error('不是本应用的备份文件');
        if (d.srs)      localStorage.setItem('zfsi_srs', JSON.stringify(d.srs));
        if (d.attempts) localStorage.setItem('zfsi_attempts', JSON.stringify(d.attempts));
        if (d.accepted) localStorage.setItem('zfsi_accepted', JSON.stringify(d.accepted));
        if (d.settings) localStorage.setItem(K, JSON.stringify(d.settings));
        done(null);
      } catch (e) { done(e); }
    };
    r.onerror = () => done(new Error('读取失败'));
    r.readAsText(file);
  }

  function resetProgress() {
    localStorage.removeItem('zfsi_srs');
    localStorage.removeItem('zfsi_attempts');
    localStorage.removeItem('zfsi_accepted');
  }

  function render(container, onChange) {
    const s = get();
    container.innerHTML = `
      <div class="set-group">
        <div class="set-row">
          <div><div class="set-name">默认作答方式</div><div class="set-desc">能出声就用语音（练口）；不方便时用打字兜底。</div></div>
          <div class="seg" id="segMode">
            <button data-v="typed" class="${s.defaultMode==='typed'?'on':''}">打字</button>
            <button data-v="voice" class="${s.defaultMode==='voice'?'on':''}">语音</button>
          </div>
        </div>
        <div class="set-row">
          <div><div class="set-name">每组题数</div><div class="set-desc">练满自动切下一题型。</div></div>
          <input id="setGroup" type="number" min="5" max="50" value="${s.groupSize}" class="set-num"/>
        </div>
        <div class="set-row">
          <div><div class="set-name">答完自动朗读答案</div><div class="set-desc">判定后自动播放标准答案发音。</div></div>
          <label class="switch"><input id="setSpeak" type="checkbox" ${s.autoSpeak?'checked':''}><span></span></label>
        </div>
      </div>

      <div class="set-group">
        <div class="set-name">数据</div>
        <div class="set-btns">
          <button id="btnExport" class="ghost">导出备份</button>
          <button id="btnImport" class="ghost">导入备份</button>
          <input id="fileImport" type="file" accept="application/json" hidden>
          <button id="btnReset" class="ghost danger">重置进度</button>
        </div>
        <div class="set-desc">备份包含题目记录、SRS 状态与设置（不含 PIN）。</div>
      </div>

      <div class="set-group">
        <div class="set-name">同步状态</div>
        <div id="beStatus" class="be-status"></div>
        <div id="beActions" hidden>
          <div class="set-desc">用 AI 生成新题，加入指定分类：</div>
          <div class="set-pin">
            <select id="genType" class="set-num wide">
              ${DRILL_ORDER.map(t => `<option value="${t}">${DRILL_LABELS[t]}</option>`).join('')}
            </select>
            <input id="genCount" type="number" min="3" max="30" value="10" class="set-num">
            <button id="btnGen" class="ghost">生成并加入</button>
          </div>
          <div id="aiOff" class="set-desc" hidden>⚠️ 服务器未配置 OpenRouter key，AI 生成未开启。</div>
        </div>
        <div id="beMsg" class="set-desc"></div>
      </div>

      <div class="set-group" id="pinGroup" hidden>
        <div class="set-name">修改 PIN</div>
        <div class="set-pin">
          <input id="pinOld" type="password" inputmode="numeric" placeholder="原 PIN" class="set-num wide">
          <input id="pinNew" type="password" inputmode="numeric" placeholder="新 PIN（4–8位）" class="set-num wide">
          <button id="btnPin" class="ghost">保存</button>
        </div>
        <div id="pinMsg" class="set-desc"></div>
      </div>
    `;

    container.querySelector('#segMode').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      set({ defaultMode: b.dataset.v });
      [...e.currentTarget.children].forEach(c => c.classList.toggle('on', c===b));
      onChange && onChange();
    };
    container.querySelector('#setGroup').onchange = e => {
      let v = Math.max(5, Math.min(50, +e.target.value || 20));
      e.target.value = v; set({ groupSize: v }); onChange && onChange();
    };
    container.querySelector('#setSpeak').onchange = e => { set({ autoSpeak: e.target.checked }); onChange && onChange(); };

    container.querySelector('#btnExport').onclick = exportBackup;
    const fileEl = container.querySelector('#fileImport');
    container.querySelector('#btnImport').onclick = () => fileEl.click();
    fileEl.onchange = () => {
      if (!fileEl.files[0]) return;
      importBackup(fileEl.files[0], err => {
        alert(err ? ('导入失败：'+err.message) : '导入成功，即将刷新。');
        if (!err) location.reload();
      });
    };
    container.querySelector('#btnReset').onclick = () => {
      if (confirm('确定清空所有练习记录和 SRS 进度？（PIN 与设置保留，不可撤销）')) {
        resetProgress(); location.reload();
      }
    };
    // ---- 同步状态（自动，无需连接）----
    const beStatus = container.querySelector('#beStatus');
    const beActions = container.querySelector('#beActions');
    const beMsg = container.querySelector('#beMsg');
    const on = typeof API !== 'undefined' && API.configured();
    if (on) {
      const pend = API.queueLen();
      beStatus.textContent = pend ? `已连服务器 · 待同步 ${pend} 条` : '已连服务器 · 记录已同步';
      beStatus.className = 'be-status on';
      beActions.hidden = false;
      // 探测 AI 是否开启（没配 key 就提示）
      API.probe().then(p => { if (!p.ai) container.querySelector('#aiOff').hidden = false; }).catch(() => {});
      // 有后端时 PIN 由服务器管理，不在此改
    } else {
      beStatus.textContent = '本地模式（未连服务器，记录只存本机）';
      beStatus.className = 'be-status';
      // 纯本地才允许改本地 PIN
      container.querySelector('#pinGroup').hidden = false;
    }

    const genBtn = container.querySelector('#btnGen');
    if (genBtn) genBtn.onclick = async () => {
      const type = container.querySelector('#genType').value;
      const count = Math.max(3, Math.min(30, +container.querySelector('#genCount').value || 10));
      const label = DRILL_LABELS[type] || type;
      genBtn.disabled = true;
      beMsg.style.color='var(--muted)'; beMsg.textContent=`正在为「${label}」生成 ${count} 题…（约十几秒）`;
      try {
        const r = await API.generate(type, 'A2', count);
        beMsg.textContent = `✓ 已加入「${label}」${r.inserted} 题。`; beMsg.style.color='var(--ok)';
      } catch (e) {
        beMsg.textContent = /503/.test(e.message) ? '服务器未配置 OpenRouter key，AI 生成未开启。' : ('生成失败：' + e.message);
        beMsg.style.color='var(--bad)';
      } finally { genBtn.disabled = false; }
    };

    const pinBtn = container.querySelector('#btnPin');
    if (pinBtn) pinBtn.onclick = async () => {
      const oldV = container.querySelector('#pinOld').value.trim();
      const newV = container.querySelector('#pinNew').value.trim();
      const msg = container.querySelector('#pinMsg');
      const res = await Auth.changePin(oldV, newV);
      msg.textContent = res.ok ? 'PIN 已更新。' : res.msg;
      msg.style.color = res.ok ? 'var(--ok)' : 'var(--bad)';
      if (res.ok) { container.querySelector('#pinOld').value=''; container.querySelector('#pinNew').value=''; }
    };
  }

  return { get, set, render, exportBackup, resetProgress };
})();
