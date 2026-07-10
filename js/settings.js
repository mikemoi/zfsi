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
        <div class="set-name">后端（可选）</div>
        <div class="set-desc">连上后端即获得：AI 判定回应题、AI 语音、durable 记录、跨设备、题库生成。不连则保持纯本地。</div>
        <div id="beStatus" class="be-status"></div>
        <div class="set-pin" id="beConnect">
          <input id="beUrl" type="text" placeholder="https://你的域名或IP:8787" class="set-num wide">
          <input id="bePin" type="password" inputmode="numeric" placeholder="PIN" class="set-num">
          <button id="btnConnect" class="ghost">连接</button>
        </div>
        <div class="set-btns" id="beActions" style="margin-top:10px">
          <button id="btnGen" class="ghost">生成新题（当前题型）</button>
          <button id="btnDisc" class="ghost danger">断开</button>
        </div>
        <div id="beMsg" class="set-desc"></div>
      </div>

      <div class="set-group">
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
    // ---- 后端 ----
    const beStatus = container.querySelector('#beStatus');
    const beConnect = container.querySelector('#beConnect');
    const beActions = container.querySelector('#beActions');
    const beMsg = container.querySelector('#beMsg');
    function refreshBE() {
      const on = typeof API !== 'undefined' && API.configured();
      beStatus.textContent = on ? `已连接：${API.cfg().url}　（待同步 ${API.queueLen()} 条）` : '未连接（纯本地模式）';
      beStatus.className = 'be-status ' + (on ? 'on' : '');
      beConnect.style.display = on ? 'none' : 'flex';
      beActions.style.display = on ? 'flex' : 'none';
    }
    refreshBE();
    container.querySelector('#btnConnect').onclick = async () => {
      const url = container.querySelector('#beUrl').value.trim();
      const pin = container.querySelector('#bePin').value.trim();
      if (!url || !pin) { beMsg.textContent = '填写地址和 PIN。'; return; }
      beMsg.textContent = '连接中…';
      try { await API.connect(url, pin); await API.flush(); beMsg.textContent = '已连接。'; beMsg.style.color='var(--ok)'; refreshBE(); }
      catch (e) { beMsg.textContent = '连接失败：' + e.message; beMsg.style.color='var(--bad)'; }
    };
    container.querySelector('#btnDisc').onclick = () => { API.disconnect(); beMsg.textContent='已断开。'; refreshBE(); };
    container.querySelector('#btnGen').onclick = async () => {
      beMsg.style.color='var(--muted)'; beMsg.textContent='生成中…（约十几秒）';
      try {
        const type = (window.App && App.currentTypeName && App.currentTypeName()) || 'substitution';
        const r = await API.generate(type, 'A2', 10);
        beMsg.textContent = `已生成并入库 ${r.inserted} 题（${type}）。`; beMsg.style.color='var(--ok)';
      } catch (e) { beMsg.textContent = '生成失败：' + e.message; beMsg.style.color='var(--bad)'; }
    };

    container.querySelector('#btnPin').onclick = async () => {
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
