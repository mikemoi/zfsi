// ============================================================
// 数据访问层（SQLite / node:sqlite，同步 API）
// 所有 SQL 集中于此；server.js 只调用这些函数。
// 时间戳 = epoch 毫秒；accepted = JSON 文本（进出自动 parse/stringify）。
// ============================================================
import { db } from './db.js';
import { sm2, qualityFrom } from './srs.js';

const now = () => Date.now();
const parseDrill = r => r && { ...r, accepted: JSON.parse(r.accepted || '[]'), accent_only: undefined };

// ---------- 抽题：某题型的 SRS 排序队列 ----------
const qSession = db.prepare(`
  SELECT d.*, s.next_due_at, s.last_reviewed_at
    FROM drills d LEFT JOIN drill_srs s ON s.drill_id = d.id
   WHERE d.type = ?
   ORDER BY (CASE WHEN s.next_due_at IS NOT NULL AND s.next_due_at <= ? THEN 0
                  WHEN s.last_reviewed_at IS NULL THEN 1 ELSE 2 END),
            (s.next_due_at IS NULL), s.next_due_at ASC,
            (s.last_reviewed_at IS NULL) DESC, s.last_reviewed_at ASC
   LIMIT ?`);
export function sessionItems(type, limit = 20) {
  return qSession.all(type, now(), limit).map(r => ({ ...r, accepted: JSON.parse(r.accepted || '[]') }));
}

// ---------- 单题 ----------
const qDrill = db.prepare(`SELECT * FROM drills WHERE id = ?`);
export const getDrill = id => parseDrill(qDrill.get(id));

// ---------- 提交答题 → 跑 SM-2 → upsert drill_srs ----------
const qInsAttempt = db.prepare(`
  INSERT INTO attempts(drill_id,drill_type,prompt,user_answer,verdict,accent_only,input_mode,elapsed_ms,q,created_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)`);
const qGetSrs = db.prepare(`SELECT ease_factor,interval_days,repetitions,lapses FROM drill_srs WHERE drill_id=?`);
const qUpsertSrs = db.prepare(`
  INSERT INTO drill_srs(drill_id,ease_factor,interval_days,repetitions,lapses,last_reviewed_at,next_due_at)
  VALUES(?,?,?,?,?,?,?)
  ON CONFLICT(drill_id) DO UPDATE SET
    ease_factor=excluded.ease_factor, interval_days=excluded.interval_days,
    repetitions=excluded.repetitions, lapses=excluded.lapses,
    last_reviewed_at=excluded.last_reviewed_at, next_due_at=excluded.next_due_at`);

export function recordAttempt(a) {
  const qv = qualityFrom(a.verdict, a.input_mode, a.elapsed_ms);
  qInsAttempt.run(a.drill_id, a.drill_type, a.prompt ?? null, a.user_answer ?? null,
    a.verdict, a.accent_only ? 1 : 0, a.input_mode || 'typed', a.elapsed_ms ?? null, qv, now());

  const cur = qGetSrs.get(a.drill_id);
  const prev = cur ? { ease: cur.ease_factor, interval: cur.interval_days, reps: cur.repetitions, lapses: cur.lapses } : null;
  const st = sm2(prev, qv);
  qUpsertSrs.run(a.drill_id, st.ease, st.interval, st.reps, st.lapses, st.last, st.next);
  return { q: qv, next_due_at: st.next };
}

// ---------- “我其实对了” / AI 回写可接受答案 ----------
export function appendAccepted(id, str) {
  const row = qDrill.get(id);
  if (!row) return false;
  const arr = JSON.parse(row.accepted || '[]');
  if (!arr.includes(str)) arr.push(str);
  db.prepare(`UPDATE drills SET accepted=? WHERE id=?`).run(JSON.stringify(arr), id);
  return true;
}

// ---------- 统计 ----------
export function stats() {
  const total = db.prepare(`
    SELECT count(*) n,
           sum(CASE WHEN verdict<>'wrong' THEN 1 ELSE 0 END) ok,
           sum(CASE WHEN accent_only=1 THEN 1 ELSE 0 END) acc
    FROM attempts`).get();
  const byType = db.prepare(`
    SELECT drill_type type, count(*) n,
           sum(CASE WHEN verdict<>'wrong' THEN 1 ELSE 0 END) ok,
           avg(elapsed_ms) avg_ms
    FROM attempts GROUP BY drill_type`).all();
  const hardest = db.prepare(`
    SELECT a.drill_id id, d.prompt, count(*) n,
           sum(CASE WHEN verdict='wrong' THEN 1 ELSE 0 END) wrong
    FROM attempts a JOIN drills d ON d.id=a.drill_id
    GROUP BY a.drill_id, d.prompt
    HAVING count(*)>=2 AND sum(CASE WHEN verdict='wrong' THEN 1 ELSE 0 END)>0
    ORDER BY (sum(CASE WHEN verdict='wrong' THEN 1 ELSE 0 END)*1.0/count(*)) DESC
    LIMIT 8`).all();
  const trend = db.prepare(`
    SELECT strftime('%m/%d', created_at/1000.0, 'unixepoch', 'localtime') label,
           count(*) n,
           sum(CASE WHEN verdict<>'wrong' THEN 1 ELSE 0 END) ok,
           avg(elapsed_ms) avg_ms
    FROM attempts
    GROUP BY strftime('%Y-%m-%d', created_at/1000.0, 'unixepoch', 'localtime')
    ORDER BY 1`).all();
  return { total, byType, hardest, trend };
}

// ---------- 题库写入（seed / AI 生成）----------
const qUpsertDrill = db.prepare(`
  INSERT INTO drills(id,type,level,tag,context,prompt,canonical,accepted,note,judge,source_type,created_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    type=excluded.type, level=excluded.level, tag=excluded.tag, context=excluded.context,
    prompt=excluded.prompt, canonical=excluded.canonical, accepted=excluded.accepted,
    note=excluded.note, judge=excluded.judge`);
export function upsertDrill(d, sourceType = 'builtin') {
  qUpsertDrill.run(d.id, d.type, d.level || 'A2', d.tag || null, d.context || '',
    d.prompt, d.canonical, JSON.stringify(d.accepted || []), d.note || '', d.judge || 'local', sourceType, now());
}

const qInsScenario = db.prepare(`INSERT INTO scenarios(id,icon,name,created_at) VALUES(?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET icon=excluded.icon, name=excluded.name`);
const qInsDrillScenario = db.prepare(`INSERT OR IGNORE INTO drill_scenario(scenario_id,drill_id) VALUES(?,?)`);
export function upsertScenario(s) {
  qInsScenario.run(s.id, s.icon || null, s.name, now());
  for (const did of s.drills || []) qInsDrillScenario.run(s.id, did);
}

// ---------- TTS 缓存 ----------
const qTtsGet = db.prepare(`SELECT audio, mime FROM tts_cache WHERE text_hash=?`);
const qTtsPut = db.prepare(`INSERT OR IGNORE INTO tts_cache(text_hash,text,voice,mime,audio,created_at) VALUES(?,?,?,?,?,?)`);
export const ttsGet = hash => qTtsGet.get(hash);
export const ttsPut = (hash, text, voice, mime, audio) => qTtsPut.run(hash, text, voice, mime, audio, now());
