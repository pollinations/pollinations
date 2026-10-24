import { validator } from "@shared/middleware/validator.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import type { AsyncJobRecord } from "@/middleware/generation-deduplication.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";

const idSchema = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .meta({
        example:
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    });
const pathSchema = z.object({ id: idSchema });
const parameters = [
    {
        in: "path" as const,
        name: "id",
        required: true,
        description:
            "Job id returned with HTTP 202 by a media generation request",
        schema: { type: "string" as const, pattern: "^[0-9a-f]{64}$" },
    },
];

function jobBody(c: Context<Env>, id: string, record: AsyncJobRecord) {
    return {
        id,
        status: record.status,
        created_at: record.createdAt,
        ...(record.completedAt && { completed_at: record.completedAt }),
        ...(record.status === "succeeded" && {
            result_url: `${getPublicOrigin(c)}/v1/jobs/${id}/result`,
        }),
        ...(record.error && { error: record.error }),
    };
}

async function ownedJob(c: Context<Env>, id: string): Promise<AsyncJobRecord> {
    const userId = c.var.auth.requireUser().id;
    const job = await c.env.GENERATION_COORDINATOR.getByName(id).status(userId);
    if (!job) throw new HTTPException(404, { message: "Job not found" });
    return job;
}

const description =
    "Submit an image, video, audio or 3D generation with `Prefer: respond-async`. An uncached request returns 202 with a job id and Location. Poll this endpoint (Retry-After: 5), then download the result. Identical requests share one upstream generation and one charge. Only accounts that submitted that job can read it; the job record expires 24 hours after completion. A cached submit can return the media directly with HTTP 200.";

export const jobRoutes = new Hono<Env>()
    .use("/v1/jobs/*", edgeRateLimit)
    .use("/v1/jobs/*", auth())
    .get(
        "/v1/jobs/:id",
        describeRoute({
            tags: ["🧰 Jobs"],
            summary: "Get Media Job Status",
            description,
            parameters,
            responses: {
                200: { description: "pending, succeeded or failed job status" },
                ...errorResponseDescriptions(400, 401, 404),
            },
        }),
        validator("param", pathSchema),
        async (c) => {
            const id = c.req.param("id");
            const job = await ownedJob(c, id);
            return c.json(jobBody(c, id, job), 200, {
                "Cache-Control": "private, no-store",
                ...(job.status === "pending" && { "Retry-After": "5" }),
            });
        },
    )
    .get(
        "/v1/jobs/:id/result",
        describeRoute({
            tags: ["🧰 Jobs"],
            summary: "Download Media Job Result",
            description,
            parameters,
            responses: {
                200: {
                    description: "Generated image, video, audio or 3D file",
                },
                ...errorResponseDescriptions(400, 401, 404, 409),
            },
        }),
        validator("param", pathSchema),
        async (c) => {
            const id = c.req.param("id");
            const job = await ownedJob(c, id);
            if (job.status !== "succeeded") {
                return c.json(jobBody(c, id, job), 409, {
                    "Cache-Control": "private, no-store",
                    ...(job.status === "pending" && { "Retry-After": "5" }),
                });
            }
            const result = await c.env.MEDIA.get(job.cache.key);
            if (!result)
                throw new HTTPException(404, {
                    message: "Job result is no longer available",
                });
            // The R2 object may be public-cacheable; its authenticated job URL is not.
            result.headers.set("Cache-Control", "private, no-store");
            result.headers.set("Vary", "Authorization");
            return result;
        },
    );
