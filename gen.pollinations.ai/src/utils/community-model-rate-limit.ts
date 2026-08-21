import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import { UpstreamError } from "@shared/error.ts";
import type { Context } from "hono";
import type { CommunityModelRateLimiter } from "../durable-objects/CommunityModelRateLimiter.ts";
import type { Env } from "../env.ts";

export async function enforceCommunityModelRateLimit(
    c: Context<Env>,
    endpoint: CommunityEndpointRuntime | undefined,
): Promise<void> {
    if (!endpoint || endpoint.perUserRpm == null) return;
    const limit = endpoint.perUserRpm;

    const userId = c.var.auth.requireUser().id;
    const namespace = c.env.COMMUNITY_MODEL_RATE_LIMITER;
    const stub = namespace.get(
        namespace.idFromName(`${endpoint.id}:${userId}`),
    ) as DurableObjectStub<CommunityModelRateLimiter>;
    const result = await stub.check(limit);
    if (result.allowed) return;

    c.header("Retry-After", String(result.retryAfterSeconds));
    throw new UpstreamError(429, {
        message: `Per-user limit of ${limit} RPM exceeded for this community model`,
        errorCode: "community_model_rate_limit",
    });
}
