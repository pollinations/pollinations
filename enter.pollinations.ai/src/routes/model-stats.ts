/**
 * Public model stats endpoint with KV caching
 * Fetches from Tinybird and caches for 1 hour
 */

import { Hono } from "hono";
import type { Env } from "../env.ts";
import { CACHE_KEY, CACHE_TTL } from "../utils/model-stats.ts";

export const modelStatsRoutes = new Hono<Env>();

/** Build model stats URL from env vars */
const buildModelStatsUrl = (ingestUrl: string, readToken: string) =>
    `${new URL(ingestUrl).origin}/v0/pipes/public_model_stats.json?token=${readToken}`;

modelStatsRoutes.get("/", async (c) => {
    // Try KV cache first
    const cached = await c.env.KV.get(CACHE_KEY, "json");
    if (cached) {
        return c.json(cached);
    }

    // Fetch from Tinybird and cache
    const tinybirdUrl = buildModelStatsUrl(
        c.env.TINYBIRD_INGEST_URL,
        c.env.TINYBIRD_READ_TOKEN,
    );
    const response = await fetch(tinybirdUrl);
    if (!response.ok) {
        return c.json({ error: "Failed to fetch model stats" }, 500);
    }

    const data = await response.json();
    await c.env.KV.put(CACHE_KEY, JSON.stringify(data), {
        expirationTtl: CACHE_TTL,
    });

    return c.json(data);
});
