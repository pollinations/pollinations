import { env } from "cloudflare:test";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import {
    authorizeServiceRequest,
    introspectServiceToken,
    settleServiceEvents,
} from "@/services/service-billing.ts";
import { test } from "./fixtures.ts";

const SERVICE = "media.pollinations.ai";

const db = () => drizzle(env.DB);

async function userBalances() {
    const [row] = await db()
        .select({
            tierBalance: userTable.tierBalance,
            packBalance: userTable.packBalance,
        })
        .from(userTable);
    return { tier: row.tierBalance ?? 0, pack: row.packBalance ?? 0 };
}

async function keyBudget(apiKeyId: string): Promise<number | null> {
    const [row] = await db()
        .select({ pollenBalance: apikeyTable.pollenBalance })
        .from(apikeyTable)
        .where(eq(apikeyTable.id, apiKeyId));
    return row.pollenBalance;
}

function authorizeInput(token: string, overrides = {}) {
    return {
        token,
        service: SERVICE,
        requestId: crypto.randomUUID(),
        requestPath: "/upload",
        estimatedPrice: 0,
        ...overrides,
    };
}

describe("ServiceGateway", () => {
    test("rejects an unknown token with a 401 denial", async () => {
        const result = await authorizeServiceRequest(
            env,
            authorizeInput("sk_not_a_real_key"),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.denial.status).toBe(401);

        const introspection = await introspectServiceToken(
            env,
            "sk_not_a_real_key",
        );
        expect(introspection.valid).toBe(false);
    });

    test("introspect returns the key identity without the raw key", async ({
        apiKey,
    }) => {
        const result = await introspectServiceToken(env, apiKey);
        expect(result.valid).toBe(true);
        if (!result.valid) return;
        expect(result.user.id).toBeTruthy();
        expect(result.apiKey.metadata?.keyType).toBe("secret");
        expect("rawKey" in result.apiKey).toBe(false);
    });

    test("settle rejects an unknown authorization", async () => {
        const result = await settleServiceEvents(env, {
            authorizationId: crypto.randomUUID(),
            events: [{ eventId: "e1", eventType: "media.upload", price: 1 }],
        });
        expect(result).toEqual({ ok: false, error: "unknown_authorization" });
    });

    test("authorize + settle debits the user once per event, idempotently", async ({
        mocks,
        paidApiKey,
    }) => {
        await mocks.enable("tinybird");
        const before = await userBalances();

        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(paidApiKey, { estimatedPrice: 1 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;

        const events = [
            {
                eventId: "generate",
                eventType: "media.upload" as const,
                price: 2,
            },
            {
                eventId: "upload",
                eventType: "media.upload" as const,
                price: 0.5,
            },
        ];
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events,
        });
        expect(settled).toEqual({
            ok: true,
            settled: ["generate", "upload"],
            duplicates: [],
        });

        const after = await userBalances();
        expect(
            before.tier + before.pack - (after.tier + after.pack),
        ).toBeCloseTo(2.5);

        const billed = mocks.tinybird.state.events;
        expect(billed).toHaveLength(2);
        expect(billed[0]).toMatchObject({
            eventType: "media.upload",
            requestPath: "/upload",
            isBilledUsage: true,
            totalPrice: 2,
        });

        // Redelivery (e.g. from a daily settlement batch) must not double-bill.
        const redelivered = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events,
        });
        expect(redelivered).toEqual({
            ok: true,
            settled: [],
            duplicates: ["generate", "upload"],
        });
        const unchanged = await userBalances();
        expect(unchanged).toEqual(after);
        expect(mocks.tinybird.state.events).toHaveLength(2);
    });

    test("finite key budget: reserved at authorize, reconciled at settle", async ({
        mocks,
        budgetedApiKey,
    }) => {
        await mocks.enable("tinybird");
        await db().update(userTable).set({ packBalance: 100 });

        // More than the live budget → denied before any work happens.
        const denied = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 200 }),
        );
        expect(denied.ok).toBe(false);
        if (!denied.ok) expect(denied.denial.status).toBe(402);

        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(95);

        // Actual cost below the estimate: the surplus reservation is released.
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                { eventId: "upload", eventType: "media.upload", price: 2 },
            ],
        });
        expect(settled.ok).toBe(true);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(98);
    });

    test("zero-price settlement releases the whole reservation", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ packBalance: 100 });

        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(95);

        const before = await userBalances();
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                { eventId: "upload", eventType: "media.upload", price: 0 },
            ],
        });
        expect(settled.ok).toBe(true);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(100);
        expect(await userBalances()).toEqual(before);
    });

    test("retried authorize for the same request reuses the authorization", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ packBalance: 100 });
        const requestId = crypto.randomUUID();

        const first = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, {
                requestId,
                estimatedPrice: 5,
            }),
        );
        const second = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, {
                requestId,
                estimatedPrice: 5,
            }),
        );
        expect(first.ok && second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.authorizationId).toBe(first.authorizationId);
        // The retry must not stack a second reservation.
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(95);
    });
});
