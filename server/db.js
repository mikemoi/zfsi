import pg from 'pg';

// 单例连接池；DATABASE_URL 从 .env 读
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

export const q = (text, params) => pool.query(text, params);

export async function ping() {
  const r = await q('SELECT 1 AS ok');
  return r.rows[0].ok === 1;
}
