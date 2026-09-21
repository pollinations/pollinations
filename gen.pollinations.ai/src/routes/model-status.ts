import type { ModelHealthRow } from "@shared/model-health.ts";
import { isTrafficGroup } from "@shared/observability/traffic-groups.ts";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { Env } from "@/env.ts";

// Public read token: the pipe is anonymous and read-only, and the same token
// is documented for client-side use in docs/public-stats.md.
const MODEL_ROUTE_HEALTH_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_route_health.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

const HEALTH_ROWS_WINDOW_MINUTES = 24 * 60;

// Powers the `health` field attached by default to /v1/models and /models
// entries (see model-catalog.ts). Same cf cacheTtl as the /models/status route
// below, so repeat calls in one colo hit the edge cache instead of Tinybird.
export async function fetchModelHealthRows(): Promise<ModelHealthRow[]> {
    const url = new URL(MODEL_ROUTE_HEALTH_URL);
    url.searchParams.set("minutes", String(HEALTH_ROWS_WINDOW_MINUTES));
    const upstream = await fetch(url, {
        cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!upstream.ok) {
        throw new Error(`Model health fetch failed (${upstream.status})`);
    }
    const body = (await upstream.json()) as { data?: ModelHealthRow[] };
    return body.data ?? [];
}

// Exists only for the shared edge cache: Tinybird runs the query on every
// call, so browsers in one colo share one query per minute instead of each
// paying for a 24-hour scan.
export const modelStatusRoutes = new Hono<Env>().get(
    "/models/status",
    describeRoute({
        tags: ["📊 Monitor"],
        summary: "Model Health Status",
        description: [
            "Pollinations-specific diagnostics, not part of the OpenAI-compatible surface. Returns the raw response of the public Tinybird `model_route_health` pipe: a `data` array of rows plus a `meta` array typing each column.",
            "",
            "Each model has one rollup row (`is_rollup` 1) counting the final outcome of every request, plus one row per execution route (`is_rollup` 0): the model's own primary and every fallback it fell through to, counting every attempt so a primary rescued by fallbacks cannot read as healthy. Routes that never fired have no row.",
            "",
            "Cached for 60 seconds per window and traffic group.",
        ].join("\n"),
        parameters: [
            {
                name: "minutes",
                in: "query",
                required: false,
                description:
                    "Rolling window in minutes (default 60, maximum 10080).",
                schema: {
                    type: "integer",
                    minimum: 1,
                    maximum: 10080,
                    default: 60,
                },
            },
            {
                name: "traffic_group",
                in: "query",
                required: false,
                description:
                    "Traffic population: regular users, legacy public APIs, internal development and monitoring, or all traffic (default).",
                schema: {
                    type: "string",
                    enum: ["regular", "legacy", "internal", "all"],
                    default: "all",
                },
            },
        ],
        responses: {
            200: {
                description:
                    "Raw Tinybird pipe response; upstream errors pass through with their status.",
            },
        },
    }),
    async (c) => {
        const url = new URL(MODEL_ROUTE_HEALTH_URL);
        const minutes = c.req.query("minutes");
        if (minutes !== undefined) url.searchParams.set("minutes", minutes);
        const trafficGroup = c.req.query("traffic_group") ?? "all";
        if (!isTrafficGroup(trafficGroup)) {
            return c.json({ error: "Invalid traffic_group" }, 400);
        }
        // The upstream URL is the edge cache identity: never share populations.
        url.searchParams.set("traffic_group", trafficGroup);
        const upstream = await fetch(url, {
            cf: { cacheTtl: 60, cacheEverything: true },
        });
        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=60",
            },
        });
    },
);
