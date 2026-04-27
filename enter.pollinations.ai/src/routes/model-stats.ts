/**
 * Public model stats endpoint for dashboard pricing display
 * Reuses the cached model stats from utils/model-stats.ts (used by track.ts)
 * to avoid duplicate caching and Tinybird calls
 */

import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { getModelStats } from "../utils/model-stats.ts";

export const modelStatsRoutes = new Hono<Env>();

modelStatsRoutes.get("/", async (c) => {
    const log = getLogger(["enter", "model-stats"]);

    // Returns raw Tinybird format: { data: [{ model, avg_cost_usd, request_count }] }
    const stats = await getModelStats(c.env.KV, log);
    return c.json(stats);
});
