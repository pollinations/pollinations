import type { Logger } from "@logtape/logtape";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import {
    type FrontendKeyRateLimitVariables,
    frontendKeyBilling,
} from "@/middleware/rate-limit-durable.ts";

const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as Logger;

type TestEnv = {
    Bindings: CloudflareBindings;
    Variables: AuthVariables & LoggerVariables & FrontendKeyRateLimitVariables;
};

function createApp() {
    return new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("auth", {
                apiKey: {
                    id: "publishable-key",
                    metadata: { keyType: "publishable" },
                } as never,
                requireAuthorization: async () => {},
                requireUser: () => ({ id: "user-1", tier: "seed" }) as never,
                requireModelAccess: () => {},
            });
            await next();
        })
        .use(frontendKeyBilling)
        .get("/", async (c) => {
            await c.var.frontendKeyRateLimit?.consumePollen(0.25);
            return c.text("ok");
        });
}

describe("publishable key rate limiting", () => {
    it("consumes detached generation cost without a second admission", async () => {
        const checkRateLimit = vi.fn(async () => ({ allowed: true }));
        const consumePollen = vi.fn(async () => {});
        const env = {
            POLLEN_RATE_LIMITER: {
                idFromName: () => ({ toString: () => "limiter" }),
                get: () => ({ checkRateLimit, consumePollen }),
            },
        } as unknown as CloudflareBindings;
        const response = await createApp().fetch(
            new Request("https://gen.pollinations.ai/", {
                headers: { "CF-Connecting-IP": "203.0.113.42" },
            }),
            env,
        );

        expect(response.status).toBe(200);
        expect(checkRateLimit).not.toHaveBeenCalled();
        expect(consumePollen).toHaveBeenCalledWith(0.25);
    });
});
