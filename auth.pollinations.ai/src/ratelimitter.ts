import type { D1Database } from '@cloudflare/workers-types';
export async function checkRateLimit(db: D1Database, ip: string, limit = 5, windowMinutes = 10): Promise<boolean> {
  const windowMs = windowMinutes * 60 * 1000;
  const now = Date.now();
  const windowStart = now - windowMs;

  
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      ip TEXT,
      ts INTEGER
    )
  `).run();

  
  const { count } = await db.prepare(
    `SELECT COUNT(*) as count FROM rate_limits WHERE ip = ? AND ts > ?`
  ).bind(ip, windowStart).first() as { count: number };

  if (count >= limit) {
    return false; 
  }

  
  await db.prepare(
    `INSERT INTO rate_limits (ip, ts) VALUES (?, ?)`
  ).bind(ip, now).run();

  
  await db.prepare(
    `DELETE FROM rate_limits WHERE ts < ?`
  ).bind(windowStart - windowMs).run();

  return true;
}