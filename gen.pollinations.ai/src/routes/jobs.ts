import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import type { OpenAPIV3_1 } from "openapi-types";
import type { JobStatus } from "@/durable-objects/GenerationCoordinator.ts";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";

/**
 * Asynchronous generation jobs: GET /v1/jobs/:id returns the status of a job
 * started with `Prefer: respond-async`, GET /v1/jobs/:id/result returns the
 * finished media. Only the account that started the job can read it.
 */

// Coordinator names are 64 hex characters (see hashGenerationCacheIdentity).
const JOB_ID_PATTERN = /^[0-9a-f]{64}$/;

async function loadJobStatus(
    c: Context<Env>,
): Promise<{ id: string; status: JobStatus }> {
    const id = c.req.param("id");
    if (!JOB_ID_PATTERN.test(id)) {
        throw new HTTPException(404, { message: "Job not found" });
    }
    const stub = c.env.GENERATION_COORDINATOR.getByName(id);
    const status = (await stub.status(
        c.var.auth.requireUser().id,
    )) as JobStatus | null;
    if (!status) throw new HTTPException(404, { message: "Job not found" });
    return { id, status };
}

const jobIdSchema: OpenAPIV3_1.SchemaObject = {
    type: "string",
    pattern: "^[0-9a-f]{64}$",
    description: "64-hex job id returned by an asynchronous submission",
};

const jobStatusResponses: {
    [status: string]: OpenAPIV3_1.ResponseObject;
} = {
    200: {
        description:
            "Job settled: `succeeded` includes a private `result_url`; `failed` includes the provider error.",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    required: ["id", "status"],
                    properties: {
                        id: jobIdSchema,
                        status: {
                            type: "string",
                            enum: ["succeeded", "failed"],
                        },
                        result_url: {
                            type: "string",
                            format: "uri",
                            description:
                                "Present when status is `succeeded`; requires the same API key to fetch.",
                        },
                        error: {
                            type: "object",
                            description: "Present when status is `failed`.",
                            properties: {
                                http_status: { type: "integer" },
                                message: { type: "string" },
                            },
                        },
                    },
                },
            },
        },
    },
    202: {
        description:
            "Job is still running; poll again with the same id. Includes `Retry-After: 1`.",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    required: ["id", "status", "status_url"],
                    properties: {
                        id: jobIdSchema,
                        status: {
                            type: "string",
                            enum: ["pending"],
                        },
                        status_url: {
                            type: "string",
                            format: "uri",
                        },
                    },
                },
            },
        },
    },
    404: {
        description:
            "Unknown job id, job started by a different account, or result expired.",
    },
    409: {
        description:
            "Result requested before the job settled (only on /result).",
    },
};

export const jobRoutes = new Hono<Env>()
    .use("*", auth())
    .get(
        "/:id",
        describeRoute({
            tags: ["Asynchronous Jobs"],
            summary: "Get asynchronous job status",
            description:
                "Returns the status of a generation job submitted with `Prefer: respond-async`. `pending` jobs return 202 with a `status_url`; settled jobs return 200 with `succeeded` (and a private `result_url`) or `failed`. Only the account that submitted the job can read it.",
            responses: jobStatusResponses,
        }),
        async (c) => {
            const { id, status } = await loadJobStatus(c);
            if (status.state === "pending") {
                return c.json({ id, status: "pending" }, 202, {
                    "Retry-After": "1",
                });
            }
            if (status.state === "failed") {
                return c.json(
                    {
                        id,
                        status: "failed",
                        error: {
                            http_status: status.error.httpStatus,
                            message: new TextDecoder().decode(
                                status.error.body,
                            ),
                        },
                    },
                    200,
                );
            }
            const resultUrl = new URL(`/v1/jobs/${id}/result`, c.req.url);
            return c.json(
                { id, status: "succeeded", result_url: resultUrl.toString() },
                200,
            );
        },
    )
    .get(
        "/:id/result",
        describeRoute({
            tags: ["Asynchronous Jobs"],
            summary: "Download an asynchronous job result",
            description:
                "Returns the finished media for a `succeeded` asynchronous job. Requires the same API key that submitted the job. The result is private and expires after a limited time.",
            responses: {
                200: {
                    description: "The generated media bytes.",
                },
                ...jobStatusResponses,
            },
        }),
        async (c) => {
            const { status } = await loadJobStatus(c);
            if (status.state !== "succeeded") {
                throw new HTTPException(409, {
                    message:
                        status.state === "pending"
                            ? "Job is still pending"
                            : "Job failed",
                });
            }
            const { storage, key } = status.cache;
            if (storage === "media") {
                const response = await c.env.MEDIA.get(key);
                if (!response) {
                    throw new HTTPException(404, {
                        message: "Result is no longer available",
                    });
                }
                response.headers.set("cache-control", "private, max-age=300");
                return response;
            }
            const object = await c.env.TEXT_BUCKET.get(key);
            if (!object) {
                throw new HTTPException(404, {
                    message: "Result is no longer available",
                });
            }
            const contentType =
                object.httpMetadata?.contentType ?? "application/octet-stream";
            return new Response(object.body, {
                headers: {
                    "content-type": contentType,
                    "cache-control": "private, max-age=300",
                },
            });
        },
    );
