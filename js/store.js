/* ============================================================
   本地存储层 —— 第2步用 localStorage（双击 index.html 即可用）
   接后端时：attempts 改为 IndexedDB 队列，联网 POST 同步到 PG。
   存三类数据：
     zfsi_srs       每题 SM-2 状态 { id: state }
     zfsi_attempts  不可变流水账（append-only）数组
     zfsi_accepted  “我其实对了”追加的可接受答案 { id: [str,...] }
   ============================================================ */

const Store = (() => {
  const K_SRS = 'zfsi_srs';
  const K_ATT = 'zfsi_attempts';
  const K_ACC = 'zfsi_accepted';

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  // ---- SRS 状态 ----
  function getSrs(id) { return read(K_SRS, {})[id]; }
  function setSrs(id, state) {
    const all = read(K_SRS, {});
    all[id] = state;
    write(K_SRS, all);
  }

  // ---- 流水账 ----
  function logAttempt(rec) {
    const all = read(K_ATT, []);
    all.push(rec);
    write(K_ATT, all);
  }
  function allAttempts() { return read(K_ATT, []); }

  function todayCount() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    return allAttempts().filter(a => a.at >= t0).length;
  }

  // ---- “我其实对了”追加的可接受答案 ----
  function getExtraAccepted(id) { return read(K_ACC, {})[id] || []; }
  function addAccepted(id, normStr) {
    const all = read(K_ACC, {});
    all[id] = all[id] || [];
    if (!all[id].includes(normStr)) all[id].push(normStr);
    write(K_ACC, all);
  }

  return { getSrs, setSrs, logAttempt, allAttempts, todayCount, getExtraAccepted, addAccepted };
})();
