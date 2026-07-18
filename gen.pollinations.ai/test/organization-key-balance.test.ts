import { env } from "cloudflare:test";
import {
    organization as organizationTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { handleError } from "@shared/error.ts";
import { ensureConfigured } from "@shared/logger.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { beforeAll, describe, expect, it } from "vitest";
import type { AuthVariables } from "@/middleware/auth.ts";
import { balance as balanceMiddleware } from "@/middleware/balance.ts";
import { logger } from "@/middleware/logger.ts";
import { checkBalance } from "@/utils/generation-access.ts";

const db = drizzle(env.DB);
const MODEL_ID = "openai";

beforeAll(async () => {
    await ensureConfigured({ level: "trace" });
    // Pre-seed the model-stats KV cache so checkBalance's cost lookup never
    // hits the real network in tests (see shared/utils/model-stats.ts's
    // `cached()` wrapper — this is its exact on-disk envelope shape).
    await env.KV.put(
        "model-stats",
        JSON.stringify({
            value: { data: [{ model: MODEL_ID, avg_cost_usd: 2 }] },
            ttl: 3600,
        }),
    );
});

async function createOwnerAndOrg(packBalance: number) {
    const ownerUserId = `org-balance-owner-${crypto.randomUUID()}`;
    await db.insert(userTable).values({
        id: ownerUserId,
        email: `${ownerUserId}@test.local`,
        name: "Org Balance Owner",
        tierBalance: 1000, // deliberately large — must never be reachable via an org key
        packBalance: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const organizationId = `org-balance-${crypto.randomUUID()}`;
    await db.insert(organizationTable).values({
        id: organizationId,
        name: "Balance Test Org",
        ownerUserId,
        packBalance,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return organizationId;
}

/**
 * Drives `checkBalance` through a minimal Hono app so it gets a real
 * request-scoped logger and the real `balance` middleware (backed by the
 * test D1 instance) — everything else is a hand-built fake, same approach
 * as `tracking-observability.test.ts`.
 */
function buildApp(organizationId: string) {
    const app = new Hono<{
        Bindings: CloudflareBindings;
        Variables: AuthVariables & { model: unknown };
    }>();
    app.use("*", requestId());
    app.use("*", logger);
    app.use("*", async (c, next) => {
        c.set("auth", {
            user: { id: "some-user-id" } as never,
            apiKey: { id: "org-key", organizationId } as never,
            requireAuthorization: async () => {},
            requireUser: () => ({ id: "some-user-id" }) as never,
            requireModelAccess: () => {},
        });
        c.set("model", {
            requested: MODEL_ID,
            resolved: MODEL_ID,
            definition: getRegistryModelDefinition(MODEL_ID),
        });
        await next();
    });
    app.use("*", balanceMiddleware);
    app.onError(handleError as never);
    app.get("/", async (c) => {
        await checkBalance(c.var as never, c.env);
        return c.json({ ok: true });
    });
    return app;
}

describe("organization-owned key balance enforcement", () => {
    it("allows the request and never reaches the creator's personal balance when the org can cover it", async () => {
        const organizationId = await createOwnerAndOrg(10);
        const app = buildApp(organizationId);

        const response = await app.request("/", {}, env);
        expect(response.status).toBe(200);
    });

    it("hard-rejects with 402 when the org balance can't cover the cost — no tier/quest fallback exists to catch it", async () => {
        const organizationId = await createOwnerAndOrg(1);
        const app = buildApp(organizationId);

        const response = await app.request("/", {}, env);
        expect(response.status).toBe(402);
        const body = (await response.json()) as { error: { message: string } };
        expect(body.error.message).toContain("Organization balance too low");
    });
});
