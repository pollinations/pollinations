import { validator } from "@shared/middleware/validator.ts";
import {
    type ModelHealthResponse,
    ModelHealthResponseSchema,
    TINYBIRD_HOST,
} from "@shared/registry/model-health.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import debug from "debug";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";

const log = debug("pollinations:model-status");

const TINYBIRD_PUBLIC_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 32;
const DEFAULT_MINUTES = 60;
const MAX_MINUTES = 7 * 24 * 60;
const DATA_TIMESTAMP_HEADER = "X-Model-Status-Timestamp";
const STALE_HEADER = "X-Model-Status-Stale";

const ModelHealthQuerySchema = z.object({
    minutes: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_MINUTES)
        .default(DEFAULT_MINUTES)
        .meta({
            description: `Rolling window in minutes (default ${DEFAULT_MINUTES}, maximum ${MAX_MINUTES}).`,
        }),
    format: z.string().optional(),
});

type CacheEntry = {
    data: ModelHealthResponse;
    timestamp: number;
};

const cache = new Map<number, CacheEntry>();

/** Test hook: clears the snapshot cache so each test sees fresh data. */
export function resetModelHealthCacheForTest(): void {
    cache.clear();
    inFlight.clear();
}

function setCacheEntry(minutes: number, entry: CacheEntry) {
    cache.delete(minutes);
    cache.set(minutes, entry);

    if (cache.size > MAX_CACHE_ENTRIES) {
        const oldestMinutes = cache.keys().next().value;
        if (oldestMinutes !== undefined) cache.delete(oldestMinutes);
    }
}

export type ModelHealthSnapshot = {
    data: ModelHealthResponse;
    checkedAt: string;
    stale: boolean;
};

// One shared in-flight read per window: parallel catalog requests on a cache
// miss join the same fetch instead of stampeding Tinybird.
const inFlight = new Map<number, Promise<ModelHealthSnapshot | null>>();

const FETCH_TIMEOUT_MS = 3_000;

/**
 * Cached Tinybird model_health read shared by the /v1/models/status route and
 * catalog health enrichment. Falls back to a stale cache entry when Tinybird
 * is unreachable, and returns null when there is no data at all — callers must
 * treat null as "unknown", never block on it.
 */
export function getModelHealthSnapshot(
    minutes = DEFAULT_MINUTES,
): Promise<ModelHealthSnapshot | null> {
    const now = Date.now();
    const cached = cache.get(minutes);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        setCacheEntry(minutes, cached);
        return Promise.resolve({
            data: cached.data,
            checkedAt: new Date(cached.timestamp).toISOString(),
            stale: false,
        });
    }

    const pending = inFlight.get(minutes);
    if (pending) return pending;

    const read = (async () => {
        try {
            const url = new URL("/v0/pipes/model_health.json", TINYBIRD_HOST);
            url.searchParams.set("token", TINYBIRD_PUBLIC_TOKEN);
            url.searchParams.set("minutes", String(minutes));
            log("Fetching model health from Tinybird: %s", url.toString());

            const response = await fetch(url.toString(), {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Error(`Tinybird responded with ${response.status}`);
            }

            const parsed = ModelHealthResponseSchema.safeParse(
                await response.json(),
            );
            if (!parsed.success) {
                throw new Error(
                    `Tinybird response failed schema validation: ${parsed.error.message}`,
                );
            }
            const timestamp = Date.now();
            setCacheEntry(minutes, { data: parsed.data, timestamp });
            return {
                data: parsed.data,
                checkedAt: new Date(timestamp).toISOString(),
                stale: false,
            } satisfies ModelHealthSnapshot;
        } catch (error) {
            log("Error fetching model health: %O", error);
            const stale = cache.get(minutes);
            if (stale) {
                log("Falling back to stale cache for %d minutes", minutes);
                setCacheEntry(minutes, stale);
                return {
                    data: stale.data,
                    checkedAt: new Date(stale.timestamp).toISOString(),
                    stale: true,
                } satisfies ModelHealthSnapshot;
            }
            return null;
        } finally {
            inFlight.delete(minutes);
        }
    })();
    inFlight.set(minutes, read);
    return read;
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
        parameters: [
            {
                name: "minutes",
                in: "query",
                required: false,
                description: `Rolling window in minutes (default ${DEFAULT_MINUTES}, maximum ${MAX_MINUTES}).`,
                schema: {
                    type: "integer",
                    minimum: 1,
                    maximum: MAX_MINUTES,
                    default: DEFAULT_MINUTES,
                },
            },
            {
                name: "format",
                in: "query",
                required: false,
                description:
                    "Optional compatibility parameter. Only `raw` is accepted.",
                schema: { type: "string", enum: ["raw"] },
            },
        ],
        responses: {
            200: {
                description: "Success",
                content: {
                    "application/json": {
                        schema: resolver(ModelHealthResponseSchema),
                    },
                },
            },
            ...errorResponseDescriptions(400, 502),
        },
    }),
    validator("query", ModelHealthQuerySchema),
    async (c) => {
        const { minutes, format } = c.req.valid("query" as never) as z.infer<
            typeof ModelHealthQuerySchema
        >;
        if (format !== undefined && format !== "raw") {
            return c.json(
                {
                    error: "format must be raw or omitted; this endpoint returns the raw Tinybird response",
                },
                400,
            );
        }

        const snapshot = await getModelHealthSnapshot(minutes);
        if (!snapshot) {
            return c.json({ error: "Failed to fetch model health data" }, 502);
        }

        c.header(DATA_TIMESTAMP_HEADER, snapshot.checkedAt);
        if (snapshot.stale) c.header(STALE_HEADER, "true");
        return c.json(snapshot.data);
    },
);
