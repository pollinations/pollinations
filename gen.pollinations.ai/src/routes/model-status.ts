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
const MAX_CACHE_ENTRIES = 32;
const DEFAULT_MINUTES = 60;
const MAX_MINUTES = 7 * 24 * 60;
const DATA_TIMESTAMP_HEADER = "X-Model-Status-Timestamp";
const STALE_HEADER = "X-Model-Status-Stale";

type ModelHealthResponse = {
    data: unknown[];
    meta?: unknown;
    [key: string]: unknown;
};

type CacheEntry = { data: ModelHealthResponse; timestamp: number };

const cache = new Map<number, CacheEntry>();

function setCacheEntry(minutes: number, entry: CacheEntry) {
    cache.delete(minutes);
    cache.set(minutes, entry);

    if (cache.size > MAX_CACHE_ENTRIES) {
        const oldestMinutes = cache.keys().next().value;
        if (oldestMinutes !== undefined) cache.delete(oldestMinutes);
    }
}

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
            "The optional `minutes` query parameter controls the rolling window and must be an integer between 1 and 10080.",
            `The ${DATA_TIMESTAMP_HEADER} response header reports when the data was fetched from Tinybird; ${STALE_HEADER} is set when stale data is returned during an upstream failure.`,
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
            setCacheEntry(minutes, cached);
            c.header(
                DATA_TIMESTAMP_HEADER,
                new Date(cached.timestamp).toISOString(),
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
            const timestamp = Date.now();
            setCacheEntry(minutes, { data: tinybirdData, timestamp });
            c.header(DATA_TIMESTAMP_HEADER, new Date(timestamp).toISOString());
            return c.json(tinybirdData);
        } catch (error) {
            log("Error fetching model health: %O", error);
            const stale = cache.get(minutes);
            if (stale) {
                log("Falling back to stale cache for %d minutes", minutes);
                setCacheEntry(minutes, stale);
                c.header(
                    DATA_TIMESTAMP_HEADER,
                    new Date(stale.timestamp).toISOString(),
                );
                c.header(STALE_HEADER, "true");
                return c.json(stale.data);
            }
            return c.json({ error: "Failed to fetch model health data" }, 502);
        }
    },
);
