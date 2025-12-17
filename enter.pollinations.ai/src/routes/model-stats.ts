/**
 * Public model stats endpoint with KV caching
 * Fetches from Tinybird and caches for 1 hour
 */

import { Hono } from "hono";
import type { Env } from "../env.ts";

// Public read-only token - only allows access to aggregated public statistics
const TINYBIRD_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJiYzdkOTY4YS0wZmM1LTRmY2MtYWViNi0zZDQ0MWIwMGFlZjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.fhyEk0_6wt5a2RnM5tu4n_6nUfFdgN_YBMxg8VPv-Dw";

const CACHE_KEY = "model-stats";
const CACHE_TTL = 3600; // 1 hour in seconds

export const modelStatsRoutes = new Hono<Env>();

modelStatsRoutes.get("/", async (c) => {
    // Try KV cache first
    const cached = await c.env.KV.get(CACHE_KEY, "json");
    if (cached) {
        return c.json(cached);
    }

    // Fetch from Tinybird and cache
    const response = await fetch(TINYBIRD_URL);
    if (!response.ok) {
        return c.json({ error: "Failed to fetch model stats" }, 500);
    }

    const data = await response.json();
    await c.env.KV.put(CACHE_KEY, JSON.stringify(data), {
        expirationTtl: CACHE_TTL,
    });

    return c.json(data);
});
