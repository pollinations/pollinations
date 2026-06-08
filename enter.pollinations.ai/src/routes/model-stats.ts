/**
 * Public model stats endpoint for dashboard pricing display
 * Reuses the cached model stats helper (shared with gen.pollinations.ai)
 * to avoid duplicate caching and Tinybird calls
 */

import { getLogger } from "@logtape/logtape";
import { getModelStats } from "@shared/utils/model-stats.ts";
import { Hono } from "hono";
import { cached } from "../cache.ts";
import type { Env } from "../env.ts";

export const modelStatsRoutes = new Hono<Env>().get("/", async (c) => {
    const log = getLogger(["enter", "model-stats"]);

    // Returns raw Tinybird format: { data: [{ model, avg_cost_usd, request_count }] }
    const stats = await getModelStats(c.env.KV, log, cached);
    return c.json(stats);
});
