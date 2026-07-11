/* ============================================================
   后端 API 客户端 —— 同源、自动，无需“连接”
   页面由后端直接服务时，API 走同源相对路径；解锁时用 PIN 换 token。
   拿到 token 即“已连后端”，记录/AI 自动可用；探测不到后端则纯本地。
   只存 token 到 localStorage 'zfsi_token'；答题记录进 'zfsi_queue' 离线队列。
   ============================================================ */

const API = (() => {
  const TK = 'zfsi_token';
  const QK = 'zfsi_queue';

  const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const token = () => localStorage.getItem(TK) || '';
  const configured = () => !!token();
  const clearToken = () => localStorage.removeItem(TK);

  async function req(path, { method = 'GET', body, raw = false } = {}) {
    const r = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return raw ? r : r.json();
  }

  // 探测同源后端是否存在
  async function probe() {
    try {
      const r = await fetch('/health', { cache: 'no-store' });
      if (!r.ok) return { ok: false };
      const j = await r.json();
      return { ok: !!j.ok, ai: !!j.ai };
    } catch { return { ok: false }; }
  }

  // 用 PIN 换 token（同源 /auth）
  async function connect(pin) {
    const r = await fetch('/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error('PIN 不对');
    localStorage.setItem(TK, j.token);
    return true;
  }

  // 接口（全同源）
  const judge       = (drill_id, answer)   => req('/judge', { method: 'POST', body: { drill_id, answer } });
  const postAttempt = (rec)                => req('/attempts', { method: 'POST', body: rec });
  const stats       = ()                   => req('/stats');
  const generate    = (type, level, count) => req('/generate', { method: 'POST', body: { type, level, count } });
  const stt         = (audio, mime)        => req('/stt', { method: 'POST', body: { audio, mime } });
  async function ttsAudio(text, voice) {
    const r = await req('/tts', { method: 'POST', body: { text, voice }, raw: true });
    return r.blob();
  }

  // 离线队列：答题记录先入队，联网自动 flush 到 /attempts
  const queue = () => read(QK, []);
  const saveQueue = a => write(QK, a);
  async function mirror(rec) {
    if (!configured()) return;
    const a = queue(); a.push(rec); saveQueue(a);
    flush();
  }
  let flushing = false;
  async function flush() {
    if (flushing || !configured() || !navigator.onLine) return;
    flushing = true;
    try {
      let a = queue();
      while (a.length) {
        try { await postAttempt(a[0]); } catch { break; }
        a = a.slice(1); saveQueue(a);
      }
    } finally { flushing = false; }
  }
  window.addEventListener('online', flush);

  return { configured, probe, connect, clearToken, token, judge, postAttempt, stats, generate, stt, ttsAudio, mirror, flush, queueLen: () => queue().length };
})();
