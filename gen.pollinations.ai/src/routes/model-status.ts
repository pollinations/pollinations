import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import debug from "debug";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { Env } from "@/env.ts";

const log = debug("pollinations:model-status");

const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_PUBLIC_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

const CACHE_TTL_MS = 60_000;

let cachedRaw: { data: unknown; timestamp: number } | null = null;
let cachedJson: { data: unknown; timestamp: number } | null = null;

interface HealthRow {
    model: string;
    event_type: string;
    provider: string;
    model_used: string;
    total_requests: number;
    status_2xx: number;
    errors_4xx: number;
    errors_5xx: number;
    last_error_at: string;
    latency_p50_ms: number;
    latency_p95_ms: number;
    avg_latency_ms: number;
    last_request_at: string;
}

function computeStatus(failures: number, successes: number): string {
    const total = failures + successes;
    if (total === 0) return "unknown";
    const rate = failures / total;
    if (rate >= 0.5) return "off";
    if (rate >= 0.1) return "degraded";
    return "on";
}

function formatJson(data: HealthRow[], minutes: string, now: Date) {
    const models: Record<
        string,
        {
            status: string;
            success_rate: number;
            avg_latency_ms: number;
            total_requests: number;
            modalities: Record<
                string,
                {
                    status: string;
                    success_rate: number;
                    avg_latency_ms: number;
                    total_requests: number;
                }
            >;
        }
    > = {};

    for (const row of data) {
        if (!models[row.model]) {
            models[row.model] = {
                status: "unknown",
                success_rate: 0,
                avg_latency_ms: 0,
                total_requests: 0,
                modalities: {},
            };
        }

        const failures = row.errors_5xx;
        const successes = row.status_2xx;
        const total = row.total_requests;

        models[row.model].modalities[row.event_type] = {
            status: computeStatus(failures, successes),
            success_rate: total > 0 ? +(successes / total).toFixed(4) : 0,
            avg_latency_ms: row.avg_latency_ms,
            total_requests: total,
        };
    }

    for (const [model, data] of Object.entries(models)) {
        const mods = Object.values(data.modalities);
        const totalReqs = mods.reduce((s, m) => s + m.total_requests, 0);
        const totalSuccesses = mods.reduce(
            (s, m) => s + m.success_rate * m.total_requests,
            0,
        );
        const totalFailures = mods.reduce(
            (s, m) => s + (1 - m.success_rate) * m.total_requests,
            0,
        );
        data.status = computeStatus(totalFailures, totalReqs);
        data.success_rate =
            totalReqs > 0 ? +(totalSuccesses / totalReqs).toFixed(4) : 0;
        data.avg_latency_ms = Math.round(
            mods.reduce((s, m) => s + m.avg_latency_ms * m.total_requests, 0) /
                totalReqs,
        );
        data.total_requests = totalReqs;
    }

    return {
        timestamp: now.toISOString(),
        minutes: parseInt(minutes, 10),
        models,
    };
}

export const modelStatusRoutes = new Hono<Env>().get(
    "/v1/models/status",
    describeRoute({
        tags: ["📊 Monitor"],
        summary: "Model Health Status",
        description: [
            "Returns real-time health status for all models.",
            "",
            "**Formats:**",
            "- `raw`: Pass-through from Tinybird `model_health` pipe (default)",
            "- `json`: Grouped by model with computed status and per-modality breakdown",
            "",
            "**Status values:**",
            "- `on`: 5xx rate < 10%",
            "- `degraded`: 5xx rate between 10% and 50%",
            "- `off`: 5xx rate >= 50%",
            "- `unknown`: No request data in the window",
        ].join("\n"),
        responses: {
            200: {
                description: "Success",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            description:
                                "Model health data. Schema depends on format parameter.",
                        },
                    },
                },
            },
            ...errorResponseDescriptions(400, 502),
        },
    }),
    async (c) => {
        const now = new Date();
        const minutes = c.req.query("minutes") || "60";
        const format = c.req.query("format") || "raw";

        log("Format requested: %s", format);

        if (format === "json") {
            if (
                cachedJson &&
                now.getTime() - cachedJson.timestamp < CACHE_TTL_MS
            ) {
                log("Returning cached json response");
                return c.json(cachedJson.data);
            }
        } else {
            if (
                cachedRaw &&
                now.getTime() - cachedRaw.timestamp < CACHE_TTL_MS
            ) {
                log("Returning cached raw response");
                return c.json(cachedRaw.data);
            }
        }

        try {
            const url = `${TINYBIRD_HOST}/v0/pipes/model_health.json?token=${TINYBIRD_PUBLIC_TOKEN}&minutes=${minutes}`;
            log("Fetching model health from Tinybird: %s", url);

            const response = await fetch(url);
            if (!response.ok) {
                log("Tinybird responded with %d", response.status);
                return c.json(
                    { error: "Failed to fetch model health data" },
                    502,
                );
            }

            const tinybirdData = (await response.json()) as {
                data: HealthRow[];
            };
            const rows = tinybirdData.data || [];

            if (format === "json") {
                const formatted = formatJson(rows, minutes, now);
                cachedJson = { data: formatted, timestamp: now.getTime() };
                return c.json(formatted);
            }

            cachedRaw = { data: tinybirdData, timestamp: now.getTime() };
            return c.json(tinybirdData);
        } catch (error) {
            log("Error fetching model health: %O", error);
            const fallback = format === "json" ? cachedJson : cachedRaw;
            if (fallback) {
                log("Falling back to stale cache");
                return c.json(fallback.data);
            }
            return c.json({ error: "Failed to fetch model health data" }, 502);
        }
    },
);
