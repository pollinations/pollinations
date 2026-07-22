import { createMiddleware } from "hono/factory";
import type { CommunityModelLimiter } from "../durable-objects/CommunityModelLimiter.ts";
import type { AuthVariables } from "./auth.ts";
import type { LoggerVariables } from "./logger.ts";
import type { ModelVariables } from "./model.ts";

type CommunityConcurrencyEnv = {
    Bindings: CloudflareBindings;
    Variables: AuthVariables & LoggerVariables & ModelVariables;
};

function releaseAfterBody(
    body: ReadableStream<Uint8Array>,
    release: () => Promise<void>,
): ReadableStream<Uint8Array> {
    const reader = body.getReader();
    let released = false;

    const releaseOnce = async () => {
        if (released) return;
        released = true;
        await release();
    };

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const result = await reader.read();
                if (result.done) {
                    controller.close();
                    await releaseOnce();
                    return;
                }
                controller.enqueue(result.value);
            } catch (error) {
                controller.error(error);
                await releaseOnce();
            }
        },
        async cancel(reason) {
            try {
                await reader.cancel(reason);
            } finally {
                await releaseOnce();
            }
        },
    });
}

/** Limits each authenticated account to one active request per community model. */
export const communityConcurrencyLimit =
    createMiddleware<CommunityConcurrencyEnv>(async (c, next) => {
        const endpoint = c.var.model.communityEndpoint;
        const userId = c.var.auth.user?.id;
        if (!endpoint || !userId) return next();

        const namespace = c.env.COMMUNITY_MODEL_LIMITER;

        const id = namespace.idFromName(`${endpoint.id}:${userId}`);
        const stub = namespace.get(
            id,
        ) as DurableObjectStub<CommunityModelLimiter>;
        const lease = await stub.acquire();

        if (!lease.allowed) {
            c.header("Retry-After", "1");
            return c.json(
                {
                    error: "concurrency_limit_exceeded",
                    message:
                        "Another request for this community model is still running.",
                },
                429,
            );
        }

        const release = async () => {
            try {
                await stub.release(lease.leaseId);
            } catch (error) {
                c.var.log.error(
                    "Failed to release community concurrency lease: {error}",
                    { error },
                );
            }
        };

        try {
            await next();
        } catch (error) {
            await release();
            throw error;
        }

        const response = c.res;
        if (!response.body) {
            await release();
            return;
        }

        c.res = new Response(releaseAfterBody(response.body, release), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    });
