import { getPublicOrigin } from "@shared/public-origin.ts";
import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import type { Env } from "@/env.ts";

// A job id is the name of its coordinator: a SHA-256 hex digest.
const JOB_ID = /^[0-9a-f]{64}$/;

/** Everything a caller can learn about a job comes through here. */
async function jobOf(c: Context<Env>, id: string) {
    const view = JOB_ID.test(id)
        ? await c.env.GENERATION_COORDINATOR.getByName(id).lookup(
              c.var.auth.requireUser().id,
          )
        : null;
    // The same answer for an unknown job and for somebody else's.
    if (!view) throw new HTTPException(404, { message: "Job not found" });
    return view;
}

export const jobRoutes = new Hono<Env>()
    .get(
        "/:id",
        describeRoute({
            tags: ["🖼️ Image"],
            summary: "Get Async Job",
            description: [
                "Status of a generation that was started with `Prefer: respond-async`. Image, video, audio and 3D requests accept the header and answer `202` with `{id, status, status_url}` instead of holding the connection open. A result that is already cached is returned at once, as for any request.",
                "",
                "`status` is `pending`, `succeeded` (with `result_url`) or `failed` (with `error`). Sending the identical request again joins the same job, so it runs and is billed once. A job can be read only by an account that sent it, and for 24 hours after it settles.",
            ].join("\n"),
            responses: {
                200: { description: "Job status" },
                ...errorResponseDescriptions(401, 404, 500),
            },
        }),
        async (c) => {
            const id = c.req.param("id");
            const view = await jobOf(c, id);
            if (view.state === "pending") {
                c.header("Retry-After", "5");
                return c.json({ id, status: "pending" });
            }
            if (view.state === "failed") {
                return c.json({
                    id,
                    status: "failed",
                    error: {
                        status: view.failure.httpStatus,
                        message: new TextDecoder().decode(view.failure.body),
                    },
                });
            }
            return c.json({
                id,
                status: "succeeded",
                result_url: `${getPublicOrigin(c)}/v1/jobs/${id}/result`,
            });
        },
    )
    .get(
        "/:id/result",
        describeRoute({
            tags: ["🖼️ Image"],
            summary: "Get Async Job Result",
            description:
                "Downloads the file of a succeeded async job. Answers `409` while the job is pending and after it failed.",
            responses: {
                200: { description: "The generated media file" },
                ...errorResponseDescriptions(401, 404, 409, 500),
            },
        }),
        async (c) => {
            const view = await jobOf(c, c.req.param("id"));
            if (view.state !== "done") {
                c.header("Retry-After", "5");
                throw new HTTPException(409, {
                    message: `The job is ${view.state}`,
                });
            }
            const file = await c.env.MEDIA.get(view.cache.key);
            if (!file) {
                throw new HTTPException(404, { message: "The result expired" });
            }
            // Only the account that sent the job may keep this.
            file.headers.set("Cache-Control", "private, max-age=3600");
            file.headers.set("X-Cache", "HIT");
            return file;
        },
    );
