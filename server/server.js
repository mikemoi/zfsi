import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import crypto from 'node:crypto';
import { q, ping } from './db.js';
import { sm2, qualityFrom } from './srs.js';
import * as ai from './ai.js';

const app = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 }); // 15MB 容纳语音
await app.register(cors, { origin: process.env.CORS_ORIGIN || '*' });

// ---------- 鉴权：PIN → token ----------
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const expectedToken = () => sha((process.env.APP_PIN || '') + '::' + (process.env.AUTH_SECRET || ''));

app.addHook('preHandler', async (req, reply) => {
  if (req.method === 'OPTIONS') return;
  const open = req.url === '/health' || req.url === '/auth';
  if (open) return;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== expectedToken()) return reply.code(401).send({ error: 'unauthorized' });
});

app.get('/health', async () => ({ ok: true, db: await ping().catch(() => false), ai: ai.aiEnabled() }));

app.post('/auth', async (req, reply) => {
  const { pin } = req.body || {};
  if (String(pin) !== String(process.env.APP_PIN)) return reply.code(401).send({ ok: false });
  return { ok: true, token: expectedToken() };
});

// ---------- 抽题：某题型的 SRS 排序队列 ----------
app.get('/session', async (req) => {
  const type = req.query.type;
  const limit = Math.min(+req.query.limit || 20, 50);
  const { rows } = await q(
    `SELECT d.*, s.next_due_at, s.last_reviewed_at
       FROM drills d LEFT JOIN drill_srs s ON s.drill_id = d.id
      WHERE d.type = $1
      ORDER BY (CASE WHEN s.next_due_at IS NOT NULL AND s.next_due_at <= now() THEN 0
                     WHEN s.last_reviewed_at IS NULL THEN 1 ELSE 2 END),
               s.next_due_at ASC NULLS LAST,
               s.last_reviewed_at ASC NULLS FIRST
      LIMIT $2`, [type, limit]);
  return { items: rows };
});

// ---------- 提交答题 → 跑 SM-2 → 更新 drill_srs ----------
app.post('/attempts', async (req) => {
  const a = req.body || {};
  const qv = qualityFrom(a.verdict, a.input_mode, a.elapsed_ms);

  await q(
    `INSERT INTO attempts(drill_id, drill_type, prompt, user_answer, verdict, accent_only, input_mode, elapsed_ms, q)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [a.drill_id, a.drill_type, a.prompt, a.user_answer, a.verdict, !!a.accent_only, a.input_mode || 'typed', a.elapsed_ms ?? null, qv]);

  const cur = await q(`SELECT ease_factor, interval_days, repetitions, lapses FROM drill_srs WHERE drill_id=$1`, [a.drill_id]);
  const prev = cur.rows[0] ? {
    ease: cur.rows[0].ease_factor, interval: cur.rows[0].interval_days,
    reps: cur.rows[0].repetitions, lapses: cur.rows[0].lapses,
  } : null;
  const st = sm2(prev, qv);

  await q(
    `INSERT INTO drill_srs(drill_id, ease_factor, interval_days, repetitions, lapses, last_reviewed_at, next_due_at)
     VALUES($1,$2,$3,$4,$5, to_timestamp($6/1000.0), to_timestamp($7/1000.0))
     ON CONFLICT(drill_id) DO UPDATE SET
       ease_factor=$2, interval_days=$3, repetitions=$4, lapses=$5,
       last_reviewed_at=to_timestamp($6/1000.0), next_due_at=to_timestamp($7/1000.0)`,
    [a.drill_id, st.ease, st.interval, st.reps, st.lapses, st.last, st.next]);

  return { ok: true, q: qv, next_due_at: new Date(st.next).toISOString() };
});

// ---------- 统计 ----------
app.get('/stats', async () => {
  const total = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE verdict<>'wrong')::int ok,
                                 count(*) FILTER (WHERE accent_only)::int acc FROM attempts`)).rows[0];
  const byType = (await q(`SELECT drill_type type, count(*)::int n,
                                  count(*) FILTER (WHERE verdict<>'wrong')::int ok,
                                  avg(elapsed_ms)::float avg_ms FROM attempts GROUP BY drill_type`)).rows;
  const hardest = (await q(`SELECT a.drill_id id, d.prompt, count(*)::int n,
                                   count(*) FILTER (WHERE verdict='wrong')::int wrong
                              FROM attempts a JOIN drills d ON d.id=a.drill_id
                             GROUP BY a.drill_id, d.prompt HAVING count(*)>=2
                                AND count(*) FILTER (WHERE verdict='wrong')>0
                             ORDER BY (count(*) FILTER (WHERE verdict='wrong'))::float/count(*) DESC LIMIT 8`)).rows;
  const trend = (await q(`SELECT to_char(date_trunc('day',created_at),'MM/DD') label, count(*)::int n,
                                 count(*) FILTER (WHERE verdict<>'wrong')::int ok, avg(elapsed_ms)::float avg_ms
                            FROM attempts GROUP BY date_trunc('day',created_at) ORDER BY 1`)).rows;
  return { total, byType, hardest, trend };
});

// ---------- AI 判定（open 题 / 本地 miss 兜底）----------
app.post('/judge', async (req, reply) => {
  if (!ai.aiEnabled()) return reply.code(503).send({ error: 'AI 未配置' });
  const { drill_id, answer } = req.body || {};
  const d = (await q(`SELECT * FROM drills WHERE id=$1`, [drill_id])).rows[0];
  if (!d) return reply.code(404).send({ error: 'drill 不存在' });
  const res = await ai.judge(d, answer);
  if (res.add_accepted) {
    await q(`UPDATE drills SET accepted = accepted || $2::jsonb WHERE id=$1`,
      [drill_id, JSON.stringify([res.add_accepted])]);
  }
  return res;
});

// ---------- AI 生成题库入库 ----------
app.post('/generate', async (req, reply) => {
  if (!ai.aiEnabled()) return reply.code(503).send({ error: 'AI 未配置' });
  const { type, level = 'A2', count = 10 } = req.body || {};
  const items = await ai.generate({ type, level, count });
  let inserted = 0;
  for (const it of items) {
    const id = 'ai_' + crypto.randomBytes(5).toString('hex');
    try {
      await q(`INSERT INTO drills(id,type,level,tag,context,prompt,canonical,accepted,note,judge,source_type)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ai')`,
        [id, it.type || type, it.level || level, it.tag || null, it.context || '',
         it.prompt, it.canonical, JSON.stringify(it.accepted || []), it.note || '', it.judge || 'local']);
      inserted++;
    } catch (e) { app.log.warn('skip bad item: ' + e.message); }
  }
  return { inserted, requested: items.length };
});

// ---------- STT ----------
app.post('/stt', async (req, reply) => {
  if (!ai.aiEnabled()) return reply.code(503).send({ error: 'AI 未配置' });
  const { audio, mime } = req.body || {};
  const text = await ai.transcribe(audio, mime);
  return { text };
});

// ---------- TTS（预生成缓存：同一文本只合成一次）----------
app.post('/tts', async (req, reply) => {
  if (!ai.aiEnabled()) return reply.code(503).send({ error: 'AI 未配置' });
  const { text, voice = process.env.TTS_VOICE || 'alloy' } = req.body || {};
  const hash = sha(voice + '|' + text);
  const cached = (await q(`SELECT audio, mime FROM tts_cache WHERE text_hash=$1`, [hash])).rows[0];
  if (cached) return reply.type(cached.mime).send(cached.audio);
  const { buffer, mime } = await ai.tts(text, voice);
  await q(`INSERT INTO tts_cache(text_hash,text,voice,mime,audio) VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(text_hash) DO NOTHING`, [hash, text, voice, mime, buffer]);
  return reply.type(mime).send(buffer);
});

const port = +(process.env.PORT || 8787);
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`zfsi server on :${port}`))
  .catch(e => { app.log.error(e); process.exit(1); });
