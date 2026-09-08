import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import type { Env } from "@/env.ts";
import {
    DEFAULT_MINUTES,
    fetchModelHealth,
    MAX_MINUTES,
    ModelHealthResponseSchema,
    parseMinutes,
} from "@/model-health.ts";

const DATA_TIMESTAMP_HEADER = "X-Model-Status-Timestamp";
const STALE_HEADER = "X-Model-Status-Stale";

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
            "",
            "For a per-model summary rather than raw rows, pass `health=true` to any model catalog.",
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

        const result = await fetchModelHealth(minutes);
        if (!result) {
            return c.json({ error: "Failed to fetch model health data" }, 502);
        }

        c.header(
            DATA_TIMESTAMP_HEADER,
            new Date(result.timestamp).toISOString(),
        );
        if (result.stale) c.header(STALE_HEADER, "true");
        return c.json(result.data);
    },
);
