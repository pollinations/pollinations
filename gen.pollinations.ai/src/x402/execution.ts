import { Hono } from "hono";
import type { Env } from "@/env.ts";
import type { X402Variables } from "./payment.ts";

/** Replay the original request through the same routes, owned by the alarm. */
export async function executeX402Request(
    request: Request,
    env: CloudflareBindings,
    ctx: ExecutionContext,
    execution: NonNullable<X402Variables["x402Execution"]>,
): Promise<Response> {
    const { app } = await import("../index.ts");
    return new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("x402Execution", execution);
            await next();
        })
        .route("/", app)
        .fetch(request, env, ctx);
}
