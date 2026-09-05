import { UpstreamError } from "@shared/error.ts";
import type { Context } from "hono";
import type { CommunityModelRateLimiter } from "../durable-objects/CommunityModelRateLimiter.ts";
import type { Env } from "../env.ts";
import type { FallbackCandidate } from "../fallback.ts";

export async function enforceModelRateLimit(
    c: Context<Env>,
    candidate: FallbackCandidate,
): Promise<void> {
    const limit = candidate.definition?.perUserRpm;
    if (limit == null) return;

    const userId = c.var.auth.paymentPayer
        ? `x402:${c.var.auth.paymentPayer}`
        : c.var.auth.requireUser().id;
    const namespace = c.env.COMMUNITY_MODEL_RATE_LIMITER;
    const stub = namespace.get(
        namespace.idFromName(`${candidate.id}:${userId}`),
    ) as DurableObjectStub<CommunityModelRateLimiter>;
    const result = await stub.check(limit);
    if (result.allowed) return;

    c.header("Retry-After", String(result.retryAfterSeconds));
    throw new UpstreamError(429, {
        message: `Per-user limit of ${limit} RPM exceeded for model ${candidate.id}`,
        // Kept for API compatibility and the existing model-health exclusion.
        errorCode: "community_model_rate_limit",
    });
}
