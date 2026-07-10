# 西语 Drill —— FSI Pattern Drill PWA

用 FSI（美国外交学院）句型操练法训练西班牙语的纯前端 PWA。A1-A2，西班牙本土日常真实用语。

## 现在能做什么（第 2 步：当天能练）

- **5 种题型**（难度梯度）：固定块闪认 → 替换 → 扩展 → 转换 → 回应
- **打字 + 语音双模式**：语音用浏览器 Web Speech API（es-ES），说完自动判定
- **三级判定**：完全对 / 仅重音错（判对但提醒）/ 错
- **“我其实对了”按钮**：被误判时一键把你的答案加进可接受列表，题库自己长厚
- **SM-2 间隔复习**：质量分由「对错 + 用时」自动映射（错=2 / 仅重音=3 / 对但慢=4 / 对且快=5）；语音才计速度
- **每题型练满 20 次自动切下一题型**，也可手动点顶部 chip 切换
- **TTS 朗读标准答案**（浏览器发音，离线兜底）
- **反焦虑**：无 streak、无催促数字、无红点，只有中性的「今天 N 题」+ 本组平均反应时
- **离线可练**：Service Worker 缓存外壳+题库；记录存 localStorage

## 怎么跑

PWA 需要 http 环境（不是 file://），随便起个静态服务器：

```bash
# Python
python -m http.server 5178
# 或 Node
npx serve -l 5178
```

然后浏览器打开 `http://localhost:5178`。手机上：用同一 WiFi 访问电脑 IP，或部署到你 VPS（1Panel/Nginx 指向本目录 + HTTPS）即可“加到主屏”。

## 文件结构

```
index.html              外壳
css/styles.css          样式（浅/深色自适应，反焦虑）
js/data.js              内置题库（DECK）+ 题型顺序/标签
js/judge.js             判定层：规范化 + 三级容错；AI 兜底为占位（judgeAI）
js/srs.js               SM-2 算法 + 抽题排序 pickNext
js/store.js             localStorage：SRS 状态 / 流水账 / accepted 追加
js/app.js               状态机 + 语音 + TTS + UI 绑定
manifest.webmanifest    PWA 清单
sw.js                   Service Worker（cache-first 离线）
icon.svg                图标
```

## 更新内容后要刷新缓存

Service Worker 是 cache-first。改了题库/代码后，把 `sw.js` 里的 `CACHE = 'zfsi-v1'` 版本号 +1（如 `zfsi-v2`），用户下次联网打开即自动更新。开发时也可在浏览器 DevTools → Application → Service Workers 勾 “Update on reload”。

## 路线图（全部完成）

1. ✅ SQLite 建表 —— `server/sql/schema.sql`（单人、轻量、一个文件）
2. ✅ 纯前端 PWA，当天能练（含 PIN 锁屏、统计/趋势、场景里程碑、设置）
3. ✅ Node/Fastify 薄后端 + `node:sqlite`：记录/SRS 落 SQLite；前端 attempts 离线队列同步
4. ✅ 接 OpenRouter：AI 判定 + 题库生成 + STT + TTS（预生成缓存）

前端**渐进增强**：不连后端就是纯本地（离线、即时）；连上后端额外获得 AI 判定回应题、AI 语音、durable 记录、跨设备、题库生成。

---

## 后端部署（server/）

轻量：**SQLite 一个文件**（Node 24 内置 `node:sqlite`，零原生依赖），不用装/连数据库。

### 1. 建表 + 灌题
```bash
cd server
cp .env.example .env    # 填 APP_PIN / AUTH_SECRET / OPENROUTER_API_KEY（DB_FILE 默认 ./data/zfsi.db）
npm install             # 只有 fastify + cors + dotenv，无数据库驱动
npm run migrate         # 建表（打开 db 即建，幂等）
npm run seed            # 把内置 44 题 + 场景灌进 SQLite
```

### 2. 起服务
```bash
npm start               # 默认 :8787（脚本已带 --experimental-sqlite）
```
生产上用 pm2 / systemd 常驻，前面挂 Nginx 反代 + HTTPS。`.env` 里 `CORS_ORIGIN` 设成你前端的域名。
**备份 = 拷 `data/zfsi.db` 一个文件**；迁移直接搬这个文件。

### 3. 前端连接
打开 App → 设置 → 「后端」→ 填 `https://你的域名:8787` + PIN → 连接。
之后：回应题走 AI 判定、🔊 用 AI 语音、答题记录同步到 PG、可在设置里「生成新题」。

### 接口一览
| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/auth` | PIN 换 token（其余接口需 `Authorization: Bearer`）|
| GET | `/session?type=&limit=` | 按 SRS 排序取题 |
| POST | `/attempts` | 交答题 → 服务端跑 SM-2 → 更新 drill_srs |
| GET | `/stats` | 易错排行 / 速度画像 / 趋势聚合 |
| POST | `/judge` | AI 语义判定（open 题 / 本地 miss 兜底，可回写 accepted）|
| POST | `/generate` | AI 生成题库入库 |
| POST | `/stt` `/tts` | 语音转文字 / 文字转语音（TTS 结果按文本哈希缓存进 `tts_cache`）|

### AI provider 可替换
`server/ai.js` 默认全部走 OpenRouter（一个 key）。想把某项换直连（STT→Groq、TTS→ElevenLabs），只改该文件对应函数的 URL/headers，`server.js` 不动。

> ⚠️ OpenRouter 的音频端点（`/audio/transcriptions`、`/audio/speech`）较新，若返回结构和 `ai.js` 里不一致，按其最新文档微调 `transcribe()`/`tts()` 的字段即可；`judge`/`generate` 用的 chat 端点是稳定的。

## 验证情况
- 前端：PIN 全流程、三级判定、SM-2、20 题自动切、统计三图、场景卡、设置、本地/后端两种模式，均在浏览器实测通过。
- 后端（SQLite）：migrate/seed、/auth（401/token）、/session（accepted 正确解析）、/attempts（SM-2 upsert：对→次日、错→60秒）、/stats（CASE 聚合 + strftime 分组）、AI 路由 503 守卫，全部本地实测通过。
- 未在真机验证：AI 判定/生成/STT/TTS 的实际调用（需要你的 OpenRouter key）。填好 key 即可用。
