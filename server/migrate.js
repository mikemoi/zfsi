import 'dotenv/config';
import fs from 'node:fs';
import { pool } from './db.js';

const sql = fs.readFileSync(new URL('./sql/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('✔ 建表完成');
await pool.end();
