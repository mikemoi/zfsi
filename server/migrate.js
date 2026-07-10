import 'dotenv/config';
// 打开 db.js 即会执行 schema.sql 建表（幂等）。这里只是显式触发一次。
import './db.js';
console.log('✔ SQLite 建表完成（' + (process.env.DB_FILE || './data/zfsi.db') + '）');
