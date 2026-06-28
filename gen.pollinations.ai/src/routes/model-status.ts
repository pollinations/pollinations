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
const DEFAULT_MINUTES = 60;
const MAX_MINUTES = 24 * 60;

type ModelHealthResponse = {
    data: unknown[];
    meta?: unknown;
    [key: string]: unknown;
};

const cache = new Map<
    number,
    { data: ModelHealthResponse; timestamp: number }
>();

function parseMinutes(value: string | undefined): number | null {
    if (value === undefined) return DEFAULT_MINUTES;
    if (!/^\d+$/.test(value)) return null;

    const minutes = Number(value);
    if (minutes < 1 || minutes > MAX_MINUTES) return null;
    return minutes;
}

export const modelStatusRoutes = new Hono<Env>().get(
    "/v1/models/status",
    describeRoute({
        tags: ["📊 Monitor"],
        summary: "Model Health Status",
        description: [
            "Returns raw model health rows from the public Tinybird `model_health` pipe.",
            "",
            "The optional `minutes` query parameter controls the rolling window and must be an integer between 1 and 1440.",
        ].join("\n"),
        responses: {
            200: {
                description: "Success",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            description:
                                "Tinybird response containing raw model health rows.",
                        },
                    },
                },
            },
            ...errorResponseDescriptions(400, 502),
        },
    }),
    async (c) => {
        const format = c.req.query("format");
        if (format !== undefined && format !== "raw") {
            return c.json(
                {
                    error: "format must be raw or omitted; this endpoint returns the raw Tinybird response",
                },
                400,
            );
        }

        const minutes = parseMinutes(c.req.query("minutes"));
        if (minutes === null) {
            return c.json(
                {
                    error: `minutes must be an integer between 1 and ${MAX_MINUTES}`,
                },
                400,
            );
        }

        const now = Date.now();
        const cached = cache.get(minutes);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
            log(
                "Returning cached model health response for %d minutes",
                minutes,
            );
            return c.json(cached.data);
        }

        try {
            const url = new URL("/v0/pipes/model_health.json", TINYBIRD_HOST);
            url.searchParams.set("token", TINYBIRD_PUBLIC_TOKEN);
            url.searchParams.set("minutes", String(minutes));
            log("Fetching model health from Tinybird: %s", url.toString());

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`Tinybird responded with ${response.status}`);
            }

            const tinybirdData = (await response.json()) as ModelHealthResponse;
            cache.set(minutes, { data: tinybirdData, timestamp: now });
            return c.json(tinybirdData);
        } catch (error) {
            log("Error fetching model health: %O", error);
            const stale = cache.get(minutes);
            if (stale) {
                log("Falling back to stale cache for %d minutes", minutes);
                return c.json(stale.data);
            }
            return c.json({ error: "Failed to fetch model health data" }, 502);
        }
    },
);
