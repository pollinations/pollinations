import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
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
import { getCachedResponse } from "@/utils/text-cache.ts";

// Job ids are the coordinator names: the SHA-256 of the generation's cache
// identity, so resending the same request returns the same id.
const JobIdSchema = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .meta({
        description: "Job id returned in the 202 submit response",
        example: "3f786850e387550fdab836ed7e6dc881de23001b",
    });

const jobIdPath = [
    {
        name: "id",
        in: "path",
        required: true,
        description: "Job id returned in the 202 submit response",
        schema: { type: "string", pattern: "^[0-9a-f]{64}$" },
    },
] as const;

function jobJson(c: Context<Env>, id: string, record: AsyncJobRecord) {
    return {
        id,
        object: "job" as const,
        status: record.status,
        created_at: record.createdAt,
        ...(record.completedAt && { completed_at: record.completedAt }),
        ...(record.status === "succeeded" && {
            result_url: `${getPublicOrigin(c)}/v1/jobs/${id}/result`,
        }),
        ...(record.error && {
            error: {
                status: record.error.httpStatus,
                message: record.error.message,
            },
        }),
    };
}

async function loadJob(c: Context<Env>, id: string): Promise<AsyncJobRecord> {
    const userId = c.var.auth.requireUser().id;
    const record =
        await c.env.GENERATION_COORDINATOR.getByName(id).status(userId);
    if (!record) {
        throw new HTTPException(404, { message: "Job not found" });
    }
    return record;
}

const jobDescription = [
    "Pollinations-specific job API, not part of the OpenAI-compatible surface. Start any generation with `Prefer: respond-async` (RFC 7240) and it returns `202` with a job `id` instead of holding the connection open until the file is ready.",
    "",
    "A job is the same durable generation as the synchronous request: identical requests still share one execution and one charge however often they are polled or resent, and the account that started the job is the only one that can read it.",
    "",
    "Job state stays readable for 24 hours; the generated file itself keeps the regular media cache lifetime.",
].join("\n");

export const jobRoutes = new Hono<Env>()
    .use("/v1/jobs/*", auth())
    .get(
        "/v1/jobs/:id",
        describeRoute({
            tags: ["🧰 Jobs"],
            summary: "Get Async Job Status",
            description: jobDescription,
            parameters: [...jobIdPath],
            responses: {
                200: {
                    description:
                        "Job status: `pending`, `succeeded` (with `result_url`), or `failed` (with `error`)",
                },
                ...errorResponseDescriptions(401, 404),
            },
        }),
        validator("param", z.object({ id: JobIdSchema })),
        async (c) => {
            const id = c.req.param("id");
            const record = await loadJob(c, id);
            return c.json(jobJson(c, id, record));
        },
    )
    .get(
        "/v1/jobs/:id/result",
        describeRoute({
            tags: ["🧰 Jobs"],
            summary: "Get Async Job Result",
            description: [
                "Returns the generated file of a succeeded job. Responds `409` while the job is still pending or after it failed; the body carries the same status object as the job route.",
                "",
                jobDescription,
            ].join("\n"),
            parameters: [...jobIdPath],
            responses: {
                200: {
                    description: "The generated file",
                    content: {
                        "application/octet-stream": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
                ...errorResponseDescriptions(401, 404, 409),
            },
        }),
        validator("param", z.object({ id: JobIdSchema })),
        async (c) => {
            const id = c.req.param("id");
            const record = await loadJob(c, id);
            if (record.status !== "succeeded") {
                return c.json(jobJson(c, id, record), 409);
            }
            const response =
                record.cache.storage === "media"
                    ? await mediaResult(c, record.cache.key)
                    : await getCachedResponse(c, record.cache.key);
            if (!response) {
                throw new HTTPException(404, {
                    message: "Job result is no longer available",
                });
            }
            return response;
        },
    );

async function mediaResult(
    c: Context<Env>,
    key: string,
): Promise<Response | null> {
    // Same read path as the media cache adapter, without a generation request.
    const response = await c.env.MEDIA.get(key);
    if (!response) return null;
    response.headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    response.headers.set("X-Cache", "HIT");
    return response;
}
