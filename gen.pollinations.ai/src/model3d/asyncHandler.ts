import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import type { ModelName } from "@shared/registry/registry.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/env.ts";
import { bufferToUint8Array } from "../image/utils/imageDownload.ts";
import { checkModel3dJob, submitModel3dJob } from "./asyncJob.ts";
import { syncModel3dEnvironment } from "./env.ts";
import {
    EXTENSION_BY_CONTENT_TYPE,
    parseModel3dParams,
    readJsonBody,
    throw3dError,
} from "./handler.ts";
import {
    getModel3dJob,
    type Model3dJobRecord,
    putModel3dJob,
} from "./jobStore.ts";

type Model3dContext = Context<Env>;

export async function submitModel3dJobHandler(
    c: Model3dContext,
): Promise<Response> {
    syncModel3dEnvironment(c.env);
    const body = await readJsonBody(c);
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const safeParams = parseModel3dParams(c, body);

    try {
        const submission = await submitModel3dJob(
            safeParams.model,
            prompt,
            safeParams,
        );
        const jobId = crypto.randomUUID();
        await putModel3dJob(c.env.KV, jobId, {
            submission,
            model: c.var.model.requested,
            resolvedModel: safeParams.model,
            format: safeParams.format,
            createdAt: Date.now(),
            status: "pending",
        });
        return c.json({ job_id: jobId, status: "pending" }, 202);
    } catch (error) {
        throw3dError(error);
    }
}

// track()'s request-phase tracking reads c.var.model before the handler
// runs, so the job (and its model) must be resolved in middleware ahead of
// track() in the chain, not inside the handler itself. 404s here short-
// circuit before track()/the handler ever see the request.
export const resolveModel3dJobModel = createMiddleware<Env>(async (c, next) => {
    syncModel3dEnvironment(c.env);
    const jobId = c.req.param("job_id") || "";
    const job = await getModel3dJob(c.env.KV, jobId);
    if (!job) {
        return c.json({ error: `No job found for id "${jobId}"` }, 404);
    }
    c.set("model", {
        requested: job.model,
        resolved: job.resolvedModel as ModelName,
    });
    await next();
});

export async function checkModel3dJobHandler(
    c: Model3dContext,
): Promise<Response> {
    const jobId = c.req.param("job_id") || "";
    // Already validated to exist by resolveModel3dJobModel; re-fetch here
    // since middleware and handler don't share typed context state.
    const job = await getModel3dJob(c.env.KV, jobId);
    if (!job) {
        return c.json({ error: `No job found for id "${jobId}"` }, 404);
    }

    if (job.status === "failed") {
        return c.json(
            { job_id: jobId, status: "failed", error: job.error },
            200,
        );
    }

    if (job.status === "completed") {
        return await serveCachedJob(c, jobId, job);
    }

    // Another poll already observed completion and is mid-download —
    // back off instead of re-observing completion and double-billing.
    if (job.status === "completing") {
        return c.json({ job_id: jobId, status: "pending" }, 200);
    }

    try {
        const result = await checkModel3dJob(job.submission, async () => {
            await putModel3dJob(c.env.KV, jobId, {
                ...job,
                status: "completing",
            });
        });
        if (result.status === "pending") {
            return c.json({ job_id: jobId, status: "pending" }, 200);
        }

        const r2Key = `3d-jobs/${jobId}`;
        await c.env.IMAGE_BUCKET.put(r2Key, bufferToUint8Array(result.buffer), {
            httpMetadata: { contentType: result.contentType },
        });
        await putModel3dJob(c.env.KV, jobId, {
            ...job,
            status: "completed",
            contentType: result.contentType,
            r2Key,
        });

        // This call is the one that observed completion — bill it (usage
        // headers below). The "completing" claim above (written before the
        // download) is what stops a concurrent poll from double-billing;
        // there's still a sub-millisecond window between two polls reading
        // KV=pending before either claims, but closing that fully would need
        // a real lock KV doesn't offer — acceptable for v1.
        return new Response(bufferToUint8Array(result.buffer), {
            headers: billableHeaders(job.resolvedModel, result.contentType),
        });
    } catch (error) {
        await putModel3dJob(c.env.KV, jobId, {
            ...job,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
        });
        throw3dError(error);
    }
}

async function serveCachedJob(
    c: Model3dContext,
    jobId: string,
    job: Model3dJobRecord,
): Promise<Response> {
    if (!job.r2Key || !job.contentType) {
        return c.json(
            { job_id: jobId, status: "completed", error: "Asset expired" },
            410,
        );
    }
    const object = await c.env.IMAGE_BUCKET.get(job.r2Key);
    if (!object) {
        return c.json(
            { job_id: jobId, status: "completed", error: "Asset expired" },
            410,
        );
    }
    // Already billed on the call that first observed completion. track()
    // skips billing for any response carrying "X-Cache: HIT" (the same
    // convention model3dCache/imageCache use) — just omitting usage headers
    // isn't enough, since track() throws if a model/* response is missing
    // x-model-used rather than silently skipping it.
    const headers = assetHeaders(job.contentType);
    headers.set("X-Cache", "HIT");
    return new Response(object.body, { headers });
}

function assetHeaders(contentType: string): Headers {
    const headers = new Headers({
        "Content-Type": contentType,
        "Cache-Control": IMMUTABLE_CACHE_CONTROL,
    });
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType] || "glb";
    headers.set(
        "Content-Disposition",
        `inline; filename="generated-model.${extension}"`,
    );
    return headers;
}

function billableHeaders(resolvedModel: string, contentType: string): Headers {
    const headers = assetHeaders(contentType);
    const trackingHeaders = buildUsageHeaders(resolvedModel, {
        completionImageTokens: 1,
    });
    for (const [key, value] of Object.entries(trackingHeaders)) {
        headers.set(key, value);
    }
    return headers;
}
