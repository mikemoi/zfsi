/* ============================================================
   后端 API 客户端 —— 渐进增强，可选
   设计：本地 SRS/判定/记录始终是快路径（离线、即时）；
        配置了后端就额外获得：AI 判定、AI 语音、durable 记录、跨设备、题库生成。
   未配置后端时，全部功能回退到纯本地（现状不变）。
   配置存 localStorage 'zfsi_backend' = { url, token }。
   答题记录进 'zfsi_queue' 离线队列，联网自动 flush 到 /attempts。
   ============================================================ */

const API = (() => {
  const K = 'zfsi_backend';
  const QK = 'zfsi_queue';

  const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const cfg = () => read(K, {});
  const configured = () => { const c = cfg(); return !!(c.url && c.token); };
  const disconnect = () => localStorage.removeItem(K);

  async function req(path, { method = 'GET', body, raw = false } = {}) {
    const c = cfg();
    const r = await fetch(c.url.replace(/\/$/, '') + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(c.token ? { Authorization: 'Bearer ' + c.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return raw ? r : r.json();
  }

  // 连接：拿 PIN 换 token
  async function connect(url, pin) {
    const base = url.replace(/\/$/, '');
    const r = await fetch(base + '/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error('PIN 不对或服务器拒绝');
    write(K, { url: base, token: j.token });
    return true;
  }
  async function health() { const c = cfg(); const r = await fetch(c.url.replace(/\/$/,'') + '/health'); return r.json(); }

  // 接口
  const judge       = (drill_id, answer) => req('/judge', { method: 'POST', body: { drill_id, answer } });
  const postAttempt = (rec)              => req('/attempts', { method: 'POST', body: rec });
  const stats       = ()                 => req('/stats');
  const generate    = (type, level, count) => req('/generate', { method: 'POST', body: { type, level, count } });
  const stt         = (audio, mime)      => req('/stt', { method: 'POST', body: { audio, mime } });
  async function ttsAudio(text, voice) {
    const r = await req('/tts', { method: 'POST', body: { text, voice }, raw: true });
    return r.blob();
  }

  // 离线队列
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
        try { await postAttempt(a[0]); } catch { break; }  // 失败留队列，下次再试
        a = a.slice(1); saveQueue(a);
      }
    } finally { flushing = false; }
  }

  window.addEventListener('online', flush);

  return { cfg, configured, connect, disconnect, health, judge, postAttempt, stats, generate, stt, ttsAudio, mirror, flush, queueLen: () => queue().length };
})();
