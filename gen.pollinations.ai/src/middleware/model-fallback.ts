import { FALLBACK_TARGET_HEADER } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/env.ts";

type RetryRequest = (
    request: Request,
    context: Context<Env>,
) => Response | Promise<Response>;

function isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const status = (error as { status?: unknown }).status;
    return (
        (typeof status === "number" && status >= 500 && status < 600) ||
        error.name === "TypeError"
    );
}

function withFallbackHeader(response: Response, model: string): Response {
    const headers = new Headers(response.headers);
    headers.set(FALLBACK_TARGET_HEADER, model);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

export function modelFallback(retryRequest: RetryRequest) {
    return createMiddleware<Env>(async (c, next) => {
        try {
            await next();
        } catch (error) {
            const fallbackRequest = c.var.fallbackRequest;
            const fallbackModel = c.var.model?.fallbackModel;
            if (
                !fallbackRequest ||
                !fallbackModel ||
                !isRetryableError(error)
            ) {
                throw error;
            }
            c.res = withFallbackHeader(
                await retryRequest(fallbackRequest, c),
                fallbackModel,
            );
            return;
        }

        const fallbackRequest = c.var.fallbackRequest;
        const fallbackModel = c.var.model?.fallbackModel;
        if (c.res.status < 500 || !fallbackRequest || !fallbackModel) return;
        c.res = withFallbackHeader(
            await retryRequest(fallbackRequest, c),
            fallbackModel,
        );
    });
}
