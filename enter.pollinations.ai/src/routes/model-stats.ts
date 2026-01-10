/**
 * Public model stats endpoint for dashboard pricing display
 * Reuses the cached model stats from utils/model-stats.ts (used by track.ts)
 * to avoid duplicate caching and Tinybird calls
 */

import { Hono } from "hono";
import { getLogger } from "@logtape/logtape";
import type { Env } from "../env.ts";
import { getModelStats } from "../utils/model-stats.ts";

export const modelStatsRoutes = new Hono<Env>();

modelStatsRoutes.get("/", async (c) => {
    const log = getLogger(["enter", "model-stats"]);

    // Reuse the same cached stats that track.ts uses (1h TTL)
    const stats = await getModelStats(c.env.KV, log);

    // Transform to the format the client expects: { data: [{ model, avg_cost_usd }] }
    const data = Object.entries(stats).map(([model, { avg_price }]) => ({
        model,
        avg_cost_usd: avg_price,
    }));

    return c.json({ data });
});
