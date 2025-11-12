import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { auth } from "../middleware/auth.ts";
import type { Env } from "../env.ts";

const app = new Hono<Env>().use(
	auth({ allowSessionCookie: true, allowApiKey: false }),
);

// Get 3-day pollen usage for authenticated user
app.get("/", async (c) => {
	const userId = c.var.auth.user?.id;
	if (!userId) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const keyId = c.req.query("keyId");
	const db = drizzle(c.env.DB);

	// Query last 3 days of usage by hour
	const result = await db.run(
		keyId
			? sql`
				SELECT 
					datetime(start_time / 1000, 'unixepoch') as timestamp,
					strftime('%Y-%m-%d %H:00', datetime(start_time / 1000, 'unixepoch')) as hour,
					CAST(SUM(total_price) as REAL) as pollen_spent,
					COUNT(*) as requests
				FROM event
				WHERE user_id = ${userId}
					AND api_key_id = ${keyId}
					AND start_time >= (strftime('%s', 'now', '-3 days') * 1000)
					AND is_billed_usage = 1
				GROUP BY strftime('%Y-%m-%d %H:00', datetime(start_time / 1000, 'unixepoch'))
				ORDER BY hour
			`
			: sql`
				SELECT 
					datetime(start_time / 1000, 'unixepoch') as timestamp,
					strftime('%Y-%m-%d %H:00', datetime(start_time / 1000, 'unixepoch')) as hour,
					CAST(SUM(total_price) as REAL) as pollen_spent,
					COUNT(*) as requests
				FROM event
				WHERE user_id = ${userId}
					AND start_time >= (strftime('%s', 'now', '-3 days') * 1000)
					AND is_billed_usage = 1
				GROUP BY strftime('%Y-%m-%d %H:00', datetime(start_time / 1000, 'unixepoch'))
				ORDER BY hour
			`,
	);

	const usage = result.results || [];
	const total = usage.reduce((sum: number, row: any) => sum + (row.pollen_spent || 0), 0);
	const maxDaily = Math.max(...usage.map((row: any) => row.pollen_spent || 0), 1);

	return c.json({
		usage,
		total: Math.round(total * 100) / 100,
		maxDaily: Math.round(maxDaily * 100) / 100,
	});
});

export default app;
