-- ============================================================
-- 西语 Drill —— SQLite 建表（单人、轻量、一个文件）
-- 时间戳统一用 epoch 毫秒（INTEGER）；JSON 用 TEXT；布尔用 0/1。
-- 事件流 + 派生态：attempts 不可变流水账，drill_srs 可由 attempts 全量重算。
-- ============================================================

CREATE TABLE IF NOT EXISTS drills (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'A2',
  tag         TEXT,
  context     TEXT NOT NULL DEFAULT '',
  prompt      TEXT NOT NULL,
  canonical   TEXT NOT NULL,
  accepted    TEXT NOT NULL DEFAULT '[]',     -- JSON 数组
  note        TEXT NOT NULL DEFAULT '',
  judge       TEXT NOT NULL DEFAULT 'local',  -- local | ai
  audio_key   TEXT,
  source_type TEXT NOT NULL DEFAULT 'builtin',-- builtin | ai
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drills_type ON drills(type);

CREATE TABLE IF NOT EXISTS attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  drill_id    TEXT NOT NULL,
  drill_type  TEXT NOT NULL,
  prompt      TEXT,
  user_answer TEXT,
  verdict     TEXT NOT NULL,                  -- correct | accent | wrong
  accent_only INTEGER NOT NULL DEFAULT 0,
  input_mode  TEXT NOT NULL DEFAULT 'typed',  -- typed | voice
  elapsed_ms  INTEGER,
  q           INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_drill ON attempts(drill_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts(created_at);

CREATE TABLE IF NOT EXISTS drill_srs (
  drill_id         TEXT PRIMARY KEY,
  ease_factor      REAL NOT NULL DEFAULT 2.5,
  interval_days    REAL NOT NULL DEFAULT 0,
  repetitions      INTEGER NOT NULL DEFAULT 0,
  lapses           INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at INTEGER,
  next_due_at      INTEGER                    -- 抽题看这个：<= now 优先
);
CREATE INDEX IF NOT EXISTS idx_srs_due ON drill_srs(next_due_at);

CREATE TABLE IF NOT EXISTS scenarios (
  id         TEXT PRIMARY KEY,
  icon       TEXT,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drill_scenario (
  scenario_id TEXT NOT NULL,
  drill_id    TEXT NOT NULL,
  PRIMARY KEY (scenario_id, drill_id)
);

-- 语音缓存（同一文本只合成一次；新块才花钱）
CREATE TABLE IF NOT EXISTS tts_cache (
  text_hash  TEXT PRIMARY KEY,               -- sha256(voice + '|' + text)
  text       TEXT NOT NULL,
  voice      TEXT NOT NULL,
  mime       TEXT NOT NULL DEFAULT 'audio/mpeg',
  audio      BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
