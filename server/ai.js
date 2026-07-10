// ============================================================
// AI 层 —— 默认 OpenRouter（一个 key 覆盖 判定/生成/STT/TTS）
// provider 可替换：想把某项换直连（STT→Groq、TTS→ElevenLabs），
// 只改这一文件对应函数的 URL/headers 即可，server.js 不用动。
//
// ⚠️ OpenRouter 音频端点较新，若返回格式和这里不符，按其最新文档微调
//    transcribe()/tts() 里的 URL 与字段即可（judge/generate 用的 chat 端点稳定）。
// ============================================================

const OR = 'https://openrouter.ai/api/v1';
const KEY = () => process.env.OPENROUTER_API_KEY;
const headers = () => ({
  'Authorization': `Bearer ${KEY()}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://zfsi.local',
  'X-Title': 'zfsi drill',
});

export function aiEnabled() { return !!KEY(); }

async function chat(messages, { model, json = true, temperature = 0.3 } = {}) {
  const body = { model, messages, temperature };
  if (json) body.response_format = { type: 'json_object' };
  const r = await fetch(`${OR}/chat/completions`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OpenRouter chat ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  return json ? JSON.parse(content) : content;
}

// ---------- 判定（open 题 / 本地 miss 兜底）----------
export async function judge(item, answer) {
  const sys = `Eres profesor de español para un estudiante chino de nivel A1-A2.
Juzga si la respuesta del estudiante es ACEPTABLE para el ejercicio, siendo tolerante con variantes naturales de España pero estricto con la gramática.
Devuelve SOLO JSON: {"verdict":"correct|accent|wrong","acceptable":true|false,"add_accepted":"<forma normalizada a añadir o null>","note":"<pista MUY breve en chino>"}.
- "accent" = correcto salvo tildes.
- "add_accepted" = si es una variante válida no listada, la forma en minúsculas sin puntuación; si no, null.`;
  const usr = `Ejercicio (${item.type}): ${item.context || ''} | consigna: ${item.prompt}
Respuesta modelo: ${item.canonical}
Variantes aceptadas: ${JSON.stringify(item.accepted || [])}
Respuesta del estudiante: "${answer}"`;
  return chat(
    [{ role: 'system', content: sys }, { role: 'user', content: usr }],
    { model: process.env.MODEL_JUDGE || 'anthropic/claude-3.5-haiku' }
  );
}

// ---------- 生成题库 ----------
export async function generate({ type, level = 'A2', count = 10 }) {
  const sys = `Generas ejercicios de español tipo FSI para un estudiante chino ${level}.
Español de España, lengua REAL del día a día (no turístico, no de libro de texto).
Devuelve SOLO JSON: {"items":[{ "type":"${type}","level":"${level}","context":"","prompt":"","canonical":"","accepted":[],"note":"<pista breve en chino>","judge":"local|ai" }]}.
Reglas por tipo:
- chunk_fixed: prompt = significado en chino; canonical = el bloque fijo.
- substitution: context = frase base; prompt = la palabra a sustituir; canonical = frase resultante.
- expansion: context = frase; prompt = "+ ...añadido"; canonical = frase ampliada.
- transformation: context = frase origen; prompt = instrucción en chino; canonical = frase transformada.
- response: prompt = situación en chino; canonical = respuesta natural; judge = "ai".
"accepted" solo con variantes CON tildes correctas (no pongas versiones sin tilde).`;
  const usr = `Genera ${count} ejercicios de tipo ${type}, nivel ${level}. Evita repetir vocabulario básico.`;
  const out = await chat(
    [{ role: 'system', content: sys }, { role: 'user', content: usr }],
    { model: process.env.MODEL_GENERATE || 'anthropic/claude-3.5-sonnet', temperature: 0.8 }
  );
  return Array.isArray(out.items) ? out.items : [];
}

// ---------- STT：语音转文字 ----------
export async function transcribe(base64Audio, mime = 'audio/webm') {
  // OpenRouter transcription（OpenAI 兼容思路）。若其要求 multipart，改这里即可。
  const r = await fetch(`${OR}/audio/transcriptions`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({
      model: process.env.MODEL_STT || 'openai/whisper-large-v3-turbo',
      language: 'es',
      file: `data:${mime};base64,${base64Audio}`,
    }),
  });
  if (!r.ok) throw new Error(`STT ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.text ?? data.transcript ?? '';
}

// ---------- TTS：文字转语音（返回音频 Buffer）----------
export async function tts(text, voice = process.env.TTS_VOICE || 'alloy') {
  const r = await fetch(`${OR}/audio/speech`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({
      model: process.env.MODEL_TTS || 'openai/gpt-4o-mini-tts',
      input: text, voice, response_format: 'mp3',
    }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}: ${await r.text()}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return { buffer: buf, mime: 'audio/mpeg' };
}
