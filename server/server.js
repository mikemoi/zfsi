import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import crypto from 'node:crypto';
import { ping } from './db.js';
import * as repo from './repo.js';
import * as ai from './ai.js';

const app = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 });
await app.register(cors, { origin: process.env.CORS_ORIGIN || '*' });

// ---------- 鉴权：PIN → token ----------
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const expectedToken = () => sha((process.env.APP_PIN || '') + '::' + (process.env.AUTH_SECRET || ''));

app.addHook('preHandler', async (req, reply) => {
  if (req.method === 'OPTIONS') return;
  if (req.url === '/health' || req.url === '/auth') return;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== expectedToken()) return reply.code(401).send({ error: 'unauthorized' });
});

app.get('/health', async () => ({ ok: true, db: ping(), ai: ai.aiEnabled() }));

app.post('/auth', async (req, reply) => {
  const { pin } = req.body || {};
  if (String(pin) !== String(process.env.APP_PIN)) return reply.code(401).send({ ok: false });
  return { ok: true, token: expectedToken() };
});

// ---------- 抽题 ----------
app.get('/session', async (req) => {
  const limit = Math.min(+req.query.limit || 20, 50);
  return { items: repo.sessionItems(req.query.type, limit) };
});

// ---------- 提交答题（SM-2 在 repo 里跑）----------
app.post('/attempts', async (req) => {
  const r = repo.recordAttempt(req.body || {});
  return { ok: true, q: r.q, next_due_at: new Date(r.next_due_at).toISOString() };
});

// ---------- 统计 ----------
app.get('/stats', async () => repo.stats());

// ---------- AI 判定 ----------
app.post('/judge', async (req, reply) => {
  if (!ai.aiEnabled()) return reply.code(503).send({ error: 'AI 未配置' });
  const { drill_id, answer } = req.body || {};
  const d = repo.getDrill(drill_id);
  if (!d) return reply.code(404).send({ error: 'drill 不存在' });
  const res = await ai.judge(d, answer);
  if (res.add_accepted) repo.appendAccepted(drill_id, res.add_accepted);
  return res;
});

// ---------- AI 生成题库 ----------
app.post('/generate', async (req, reply) => {
  if (!ai.aiEnabled()) return reply.code(503).send({ error: 'AI 未配置' });
  const { type, level = 'A2', count = 10 } = req.body || {};
  const items = await ai.generate({ type, level, count });
  let inserted = 0;
  for (const it of items) {
    const id = 'ai_' + crypto.randomBytes(5).toString('hex');
    try { repo.upsertDrill({ ...it, id, type: it.type || type, level: it.level || level }, 'ai'); inserted++; }
    catch (e) { app.log.warn('skip bad item: ' + e.message); }
  }
  return { inserted, requested: items.length };
});

// ---------- STT ----------
app.post('/stt', async (req, reply) => {
  if (!ai.aiEnabled()) return reply.code(503).send({ error: 'AI 未配置' });
  const { audio, mime } = req.body || {};
  return { text: await ai.transcribe(audio, mime) };
});

// ---------- TTS（预生成缓存）----------
app.post('/tts', async (req, reply) => {
  if (!ai.aiEnabled()) return reply.code(503).send({ error: 'AI 未配置' });
  const { text, voice = process.env.TTS_VOICE || 'alloy' } = req.body || {};
  const hash = sha(voice + '|' + text);
  const cached = repo.ttsGet(hash);
  if (cached) return reply.type(cached.mime).send(Buffer.from(cached.audio));
  const { buffer, mime } = await ai.tts(text, voice);
  repo.ttsPut(hash, text, voice, mime, buffer);
  return reply.type(mime).send(buffer);
});

const port = +(process.env.PORT || 8787);
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`zfsi server on :${port}`))
  .catch(e => { app.log.error(e); process.exit(1); });
