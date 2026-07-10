import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// 一个文件搞定；DB_FILE 可配，默认 ./data/zfsi.db
const file = process.env.DB_FILE || './data/zfsi.db';
fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// 打开即确保建表（幂等）
const schema = fs.readFileSync(new URL('./sql/schema.sql', import.meta.url), 'utf8');
db.exec(schema);

export function ping() {
  try { return db.prepare('SELECT 1 AS ok').get().ok === 1; } catch { return false; }
}
