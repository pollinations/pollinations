import { createMiddleware } from "hono/factory";
import type { AccountConcurrencyLimiter } from "../durable-objects/AccountConcurrencyLimiter.ts";
import type { AuthVariables } from "./auth.ts";
import type { LoggerVariables } from "./logger.ts";

type AccountConcurrencyEnv = {
    Bindings: CloudflareBindings;
    Variables: AuthVariables & LoggerVariables;
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

/**
 * Emergency abuse mitigation: limits an account with no paid balance to a
 * single active provider-backed generation across all API keys and modalities.
 *
 * Accounts that have ever been funded (`packBalance !== 0`) bypass the limiter,
 * so this only constrains free / quest-only accounts — the population a
 * coordinated flood is cheapest to run from. Cache hits never reach this
 * middleware, so they don't occupy the slot. The slot is held for the full
 * response, including streaming, and released on completion, cancellation, or
 * error.
 */
export const accountConcurrencyLimit = createMiddleware<AccountConcurrencyEnv>(
    async (c, next) => {
        const user = c.var.auth.user;
        const userId = user?.id;
        // Unauthenticated requests are rejected upstream by generationAccess.
        if (!userId) return next();

        // Accounts that have ever been funded bypass the gate entirely. A
        // non-zero pack balance is a sufficient in-request signal: positive
        // means they hold credit now, negative means they paid and then spent
        // past zero (deductions aren't floored at 0, so spent-down payers land
        // negative, never exactly 0). Only null (never funded) and 0 (free
        // account, never purchased a pack) are limited. packBalance is already
        // on the full user row loaded by auth (SELECT *), so this is free.
        // biome-ignore lint/suspicious/noExplicitAny: packBalance comes from SELECT *, not on the narrow AuthUser type
        const packBalance = ((user as any).packBalance ?? 0) as number;
        if (packBalance !== 0) return next();

        const namespace = c.env.ACCOUNT_CONCURRENCY_LIMITER;
        // A missing binding is a deployment/configuration failure, not a silent
        // bypass — surfacing it loudly is safer than shipping with no limiter.
        if (!namespace) {
            throw new Error(
                "ACCOUNT_CONCURRENCY_LIMITER binding is not configured",
            );
        }

        const stub = namespace.get(
            namespace.idFromName(userId),
        ) as DurableObjectStub<AccountConcurrencyLimiter>;

        let lease: Awaited<ReturnType<AccountConcurrencyLimiter["acquire"]>>;
        try {
            lease = await stub.acquire();
        } catch (error) {
            // A transient Durable Object error must not take down generation for
            // every free account during a Cloudflare incident. Fail open, but
            // log prominently so the outage is visible.
            c.var.log.error(
                "Account concurrency limiter unavailable, failing open: {error}",
                { error },
            );
            return next();
        }

        if (!lease.allowed) {
            c.header("Retry-After", "1");
            return c.json(
                {
                    error: "concurrency_limit_exceeded",
                    message:
                        "Another generation is still running on this account. Add credits for concurrent requests, or retry when it finishes.",
                },
                429,
            );
        }

        const release = async () => {
            try {
                await stub.release(lease.leaseId);
            } catch (error) {
                c.var.log.error(
                    "Failed to release account concurrency lease: {error}",
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
    },
);
