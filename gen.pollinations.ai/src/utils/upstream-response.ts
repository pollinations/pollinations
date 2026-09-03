import { UpstreamError } from "@shared/error.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";

export function assertStreamContentType(
    c: Context<Env>,
    response: Response,
    upstreamRequestUrl: URL | undefined,
): void {
    if (!c.var.track.streamRequested) return;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
        throw new UpstreamError(502, {
            message: `Stream requested for model ${c.var.model.resolved} but upstream returned content-type: ${contentType}`,
            requestUrl: upstreamRequestUrl,
            responseBody: contentType,
        });
    }
}
