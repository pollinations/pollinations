import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";

const JOB_ID = /^[0-9a-f]{64}$/;

/** Reads a job of the calling account; unknown and foreign ids are both 404. */
async function loadJob(c: Context<Env>) {
    const id = c.req.param("id") ?? "";
    const status = JOB_ID.test(id)
        ? await c.env.GENERATION_COORDINATOR.getByName(id).status(
              c.var.auth.requireUser().id,
          )
        : null;
    if (!status) throw new HTTPException(404, { message: "Job not found" });
    return { id, status };
}

export async function getJob(c: Context<Env>): Promise<Response> {
    const { id, status } = await loadJob(c);
    const url = `${new URL(c.req.url).origin}/v1/jobs/${id}`;
    if (status.state === "pending") {
        c.header("Retry-After", "5");
        return c.json({ id, status: "pending" });
    }
    if (status.state === "failed") {
        return c.json({
            id,
            status: "failed",
            error: {
                status: status.error.httpStatus,
                message: new TextDecoder().decode(status.error.body),
            },
        });
    }
    return c.json({ id, status: "succeeded", result_url: `${url}/result` });
}

export async function getJobResult(c: Context<Env>): Promise<Response> {
    const { status } = await loadJob(c);
    if (status.state === "pending") {
        c.header("Retry-After", "5");
        throw new HTTPException(409, { message: "Job is still running" });
    }
    if (status.state === "failed") {
        throw new HTTPException(409, { message: "Job failed" });
    }
    const file = await c.env.MEDIA.get(status.cache.key);
    if (!file) throw new HTTPException(404, { message: "Result expired" });
    return file;
}
