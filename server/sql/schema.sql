-- ============================================================
-- 西语 Drill —— PostgreSQL 建表
-- 单人无账号：不带 user_id。建议放独立专用库。
--   在 1Panel / psql 里：CREATE DATABASE zfsi;  然后对该库执行本文件。
-- 事件流 + 派生态：attempts 是不可变流水账，drill_srs 可由 attempts 全量重算。
-- ============================================================

-- 题库
CREATE TABLE IF NOT EXISTS drills (
  id          TEXT PRIMARY KEY,                 -- 如 sub_07 / ai_1720...
  type        TEXT NOT NULL,                    -- chunk_fixed|substitution|expansion|transformation|response
  level       TEXT NOT NULL DEFAULT 'A2',       -- A1 / A2
  tag         TEXT,                             -- contrast_pair 等（可空）
  context     TEXT DEFAULT '',                  -- base / source 语境行
  prompt      TEXT NOT NULL,                    -- 替换词 / 指令 / 中文情境
  canonical   TEXT NOT NULL,                    -- 标准答案（带正确重音）
  accepted    JSONB NOT NULL DEFAULT '[]',      -- 可接受变体数组（AI/“我其实对了”会追加）
  note        TEXT DEFAULT '',                  -- 简短纠正提示
  judge       TEXT NOT NULL DEFAULT 'local',    -- local | ai
  audio_key   TEXT,                             -- 语音缓存键/URL（预生成后回填）
  source_type TEXT NOT NULL DEFAULT 'builtin',  -- builtin | ai
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drills_type ON drills(type);

-- 不可变流水账（append-only）
CREATE TABLE IF NOT EXISTS attempts (
  id          BIGSERIAL PRIMARY KEY,
  drill_id    TEXT NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  drill_type  TEXT NOT NULL,
  prompt      TEXT,
  user_answer TEXT,
  verdict     TEXT NOT NULL,                    -- correct | accent | wrong
  accent_only BOOLEAN NOT NULL DEFAULT false,
  input_mode  TEXT NOT NULL DEFAULT 'typed',    -- typed | voice （只有 voice 才让用时参与 SRS）
  elapsed_ms  INTEGER,
  q           SMALLINT,                          -- 喂给 SM-2 的质量分 2..5
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_drill ON attempts(drill_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts(created_at);

-- SM-2 派生状态（一题一行）
CREATE TABLE IF NOT EXISTS drill_srs (
  drill_id        TEXT PRIMARY KEY REFERENCES drills(id) ON DELETE CASCADE,
  ease_factor     REAL NOT NULL DEFAULT 2.5,
  interval_days   REAL NOT NULL DEFAULT 0,
  repetitions     INTEGER NOT NULL DEFAULT 0,
  lapses          INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  next_due_at     TIMESTAMPTZ                    -- 抽题看这个：<= now() 优先
);
CREATE INDEX IF NOT EXISTS idx_srs_due ON drill_srs(next_due_at);

-- 场景 + 题目归属（里程碑）
CREATE TABLE IF NOT EXISTS scenarios (
  id         TEXT PRIMARY KEY,
  icon       TEXT,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drill_scenario (
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  drill_id    TEXT NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  PRIMARY KEY (scenario_id, drill_id)
);

-- 语音缓存（同一文本只合成一次；新块才花钱）
CREATE TABLE IF NOT EXISTS tts_cache (
  text_hash  TEXT PRIMARY KEY,                  -- sha256(voice + '|' + text)
  text       TEXT NOT NULL,
  voice      TEXT NOT NULL,
  mime       TEXT NOT NULL DEFAULT 'audio/mpeg',
  audio      BYTEA NOT NULL,                    -- 音频字节（也可换成对象存储只存 url）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
