import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";

// Job ids are coordinator names: the SHA-256 of the generation cache identity.
const JOB_ID = /^[0-9a-f]{64}$/;

/** Unknown ids and jobs of other accounts are both 404. */
async function loadJob(c: Context<Env>) {
    const id = c.req.param("id") ?? "";
    const owner = c.var.auth.requireUser().id;
    const job = JOB_ID.test(id)
        ? await c.env.GENERATION_COORDINATOR.getByName(id).status(owner)
        : null;
    if (!job) throw new HTTPException(404, { message: "Job not found" });
    return { id, job };
}

export async function getJob(c: Context<Env>): Promise<Response> {
    const { id, job } = await loadJob(c);
    if (job.status === "pending") {
        c.header("Retry-After", "5");
        return c.json({ id, status: "pending" as const });
    }
    if (job.status === "failed") {
        return c.json({
            id,
            status: "failed" as const,
            error: {
                status: job.error.httpStatus,
                message: new TextDecoder().decode(job.error.body),
            },
        });
    }
    return c.json({
        id,
        status: "succeeded" as const,
        result_url: `${new URL(c.req.url).origin}/v1/jobs/${id}/result`,
    });
}

export async function getJobResult(c: Context<Env>): Promise<Response> {
    const { job } = await loadJob(c);
    if (job.status === "pending") {
        c.header("Retry-After", "5");
        throw new HTTPException(409, { message: "Job is still running" });
    }
    if (job.status === "failed") {
        throw new HTTPException(409, { message: "Job failed" });
    }
    const file = await c.env.MEDIA.get(job.cache.key);
    if (!file) throw new HTTPException(404, { message: "Job result expired" });
    file.headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    return file;
}
