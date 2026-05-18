import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { track } from "@/middleware/track.ts";
import { validator } from "@/middleware/validator.ts";
import { errorResponseDescriptions } from "@/utils/api-docs.ts";
import { generationAccess } from "@/utils/generation-access.ts";
import {
    calculateReplicateProviderBillingDollars,
    getReplicateTimePricedConfig,
    isValidReplicateModelSlug,
} from "../replicate/billing.ts";

const REPLICATE_GENERIC_MODEL = "replicate-generic";
const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const PREFER_WAIT_SECONDS = 60;
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 60;

const ReplicatePredictionRequestSchema = z.object({
    model: z.string().refine(isValidReplicateModelSlug, {
        message: 'model must use "owner/name" format',
    }),
    input: z.record(z.string(), z.unknown()).default({}),
});

type ReplicatePredictionRequest = z.infer<
    typeof ReplicatePredictionRequestSchema
>;

type ReplicatePrediction = {
    id?: string;
    status?:
        | "starting"
        | "processing"
        | "succeeded"
        | "failed"
        | "canceled"
        | "aborted";
    urls?: {
        get?: string;
    };
    metrics?: {
        predict_time?: number;
    };
    error?: string | null;
};

const replicateBodyLimit = bodyLimit({
    maxSize: 20 * 1024 * 1024,
});

const setReplicateGenericModel = createMiddleware<Env>(async (c, next) => {
    const body = c.req.valid("json" as never) as ReplicatePredictionRequest;
    c.set("model", {
        requested: body.model,
        resolved: REPLICATE_GENERIC_MODEL,
    });
    await next();
});

export const replicateRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .use("*", auth())
    .use("*", frontendKeyRateLimit)
    .use("*", balance)
    .post(
        "/predictions",
        describeRoute({
            tags: ["Provider APIs"],
            summary: "Create Replicate Prediction",
            description: [
                "Runs a public Replicate model through Pollinations billing.",
                "",
                "Only time-priced models are supported. Models with Replicate `billingConfig` pricing are rejected and should use curated Pollinations endpoints.",
                "",
                'Request body: `{ "model": "owner/name", "input": { ... } }`. The response is the raw Replicate prediction JSON.',
            ].join("\n"),
            responses: {
                200: {
                    description:
                        "Success - Returns the raw Replicate prediction",
                },
                ...errorResponseDescriptions(
                    400,
                    401,
                    402,
                    403,
                    429,
                    500,
                    502,
                    503,
                ),
            },
        }),
        replicateBodyLimit,
        validator("json", ReplicatePredictionRequestSchema),
        setReplicateGenericModel,
        track("generate.text"),
        generationAccess,
        async (c) => {
            const token = c.env.REPLICATE_API_TOKEN;
            if (!token) {
                throw new HTTPException(503, {
                    message: "Replicate is not configured.",
                });
            }

            const body = c.req.valid(
                "json" as never,
            ) as ReplicatePredictionRequest;
            const billing = await getReplicateTimePricedConfig({
                slug: body.model,
                token,
                kv: c.env.KV,
                log: c.var.log.getChild("replicate"),
            });

            if (!billing) {
                throw new HTTPException(400, {
                    message:
                        "This Replicate model is not available through the generic endpoint. Only time-priced models are supported.",
                });
            }

            const createResult = await replicateFetch<ReplicatePrediction>(
                token,
                {
                    method: "POST",
                    url: `${REPLICATE_API_BASE}/predictions`,
                    body: {
                        version: billing.version,
                        input: body.input,
                    },
                    headers: {
                        Prefer: `wait=${PREFER_WAIT_SECONDS}`,
                    },
                },
            );
            if (!createResult.response.ok) {
                return c.json(
                    createResult.json,
                    createResult.response.status as ContentfulStatusCode,
                );
            }

            const prediction = await pollReplicatePrediction(
                token,
                createResult.json,
            );

            if (prediction.status !== "succeeded") {
                c.var.track.overrideResponseTracking(
                    new Response(null, { status: 502 }),
                );
                return c.json(prediction);
            }

            const providerBillingDollars =
                calculateReplicateProviderBillingDollars({
                    predictTimeSeconds: prediction.metrics?.predict_time,
                    dollarsPerSecond: billing.dollarsPerSecond,
                });
            if (providerBillingDollars <= 0) {
                c.var.log.warn(
                    "Replicate prediction succeeded without billable runtime metrics.",
                    {
                        predictionId: prediction.id,
                        replicateModel: billing.slug,
                    },
                );
                c.var.track.overrideResponseTracking(
                    new Response(null, { status: 502 }),
                );
                return c.json(prediction);
            }
            const usageHeaders = buildUsageHeaders(REPLICATE_GENERIC_MODEL, {
                billingDollars: providerBillingDollars,
            });

            return c.json(prediction, 200, {
                ...usageHeaders,
                "x-replicate-model": billing.slug,
                "x-replicate-price": billing.priceLabel,
                ...(billing.hardware
                    ? { "x-replicate-hardware": billing.hardware }
                    : {}),
                "x-replicate-provider-billing-dollars": String(
                    providerBillingDollars,
                ),
            });
        },
    );

async function pollReplicatePrediction(
    token: string,
    prediction: ReplicatePrediction,
): Promise<ReplicatePrediction> {
    let current = prediction;
    const pollUrl =
        current.urls?.get || `${REPLICATE_API_BASE}/predictions/${current.id}`;

    for (
        let attempts = 0;
        current.status === "starting" || current.status === "processing";
        attempts++
    ) {
        if (attempts >= POLL_MAX_ATTEMPTS) {
            throw new HTTPException(504, {
                message: `Replicate prediction ${current.id} timed out after ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s.`,
            });
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const result = await replicateFetch<ReplicatePrediction>(token, {
            method: "GET",
            url: pollUrl,
        });
        if (!result.response.ok) return result.json;
        current = result.json;
    }

    return current;
}

async function replicateFetch<T>(
    token: string,
    opts: {
        method: "GET" | "POST";
        url: string;
        body?: Record<string, unknown>;
        headers?: Record<string, string>;
    },
): Promise<{ response: Response; json: T }> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        ...opts.headers,
    };
    if (opts.body) headers["Content-Type"] = "application/json";

    const response = await fetch(opts.url, {
        method: opts.method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const json = (await response.json().catch(() => ({}))) as T;
    return { response, json };
}
