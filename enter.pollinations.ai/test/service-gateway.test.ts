import { env } from "cloudflare:test";
import { createApiKeyAuth } from "@shared/auth/api-key.ts";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import {
    serviceAuthorization,
    serviceBillingEvent,
} from "@shared/db/service-billing.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import {
    authorizeServiceRequest,
    cancelServiceRequest,
    introspectServiceToken,
    settleServiceEvents,
    sweepServiceGateway,
} from "@/services/service-billing.ts";
import { test } from "./fixtures.ts";

const SERVICE = "media.pollinations.ai";

const db = () => drizzle(env.DB);

async function userBalances(userId?: string) {
    const query = db()
        .select({
            id: userTable.id,
            tierBalance: userTable.tierBalance,
            packBalance: userTable.packBalance,
        })
        .from(userTable);
    const rows = userId
        ? await query.where(eq(userTable.id, userId))
        : await query;
    const [row] = rows;
    return { tier: row?.tierBalance ?? 0, pack: row?.packBalance ?? 0 };
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

/** Seed an extra user (beyond the fixture's signed-up one) with real keys. */
async function seedUser(
    id: string,
    balances: { tierBalance?: number; packBalance?: number } = {},
) {
    const now = new Date();
    await db()
        .insert(userTable)
        .values({
            id,
            name: id,
            email: `${id}@test.com`,
            createdAt: now,
            updatedAt: now,
            ...balances,
        })
        .onConflictDoNothing({ target: userTable.id });
}

async function createKey(
    userId: string,
    prefix: "pk" | "sk",
    metadata?: Record<string, unknown>,
) {
    const created = await createApiKeyAuth(env).api.createApiKey({
        body: {
            name: `${userId}-${prefix}`,
            prefix,
            userId,
            ...(metadata && { metadata }),
        },
    });
    if (!created.id || !created.key) throw new Error("key creation failed");
    return { id: created.id, key: created.key };
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
                // Service telemetry may add detail, never rewrite identity
                // or money.
                telemetry: {
                    userId: "someone-else",
                    apiKeyId: "not-this-key",
                    requestPath: "/forged",
                    totalPrice: 0,
                    isBilledUsage: false,
                    responseStatus: 201,
                },
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

        // One derived Tinybird row per settled event.
        const billed = mocks.tinybird.state.events;
        expect(billed).toHaveLength(2);
        expect(billed[0]).toMatchObject({
            eventType: "media.upload",
            requestPath: "/upload",
            userId: authorized.user.id,
            apiKeyId: authorized.apiKey.id,
            isBilledUsage: true,
            totalPrice: 2,
            responseStatus: 201,
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
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ packBalance: 100 });

        // More than the live budget → denied before any work happens, and
        // atomically: no authorization row, no budget movement.
        const denied = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 200 }),
        );
        expect(denied.ok).toBe(false);
        if (!denied.ok) expect(denied.denial.status).toBe(402);
        expect(await db().select().from(serviceAuthorization)).toHaveLength(0);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(100);

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
        const before = await userBalances();

        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(95);
        expect((await userBalances()).pack).toBeCloseTo(95);

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
        // The retry must not stack a second reserve, on the key or the wallet.
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(95);
        expect((await userBalances()).pack).toBeCloseTo(95);
    });

    test("an exact retry after the whole balance was reserved returns the same authorization", async ({
        paidApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 5 });
        const requestId = crypto.randomUUID();
        const exact = () =>
            authorizeServiceRequest(
                env,
                authorizeInput(paidApiKey, { requestId, estimatedPrice: 5 }),
            );

        const first = await exact();
        expect(first.ok).toBe(true);
        expect((await userBalances()).pack).toBe(0);

        // The wallet now holds nothing, but the retry is the same request:
        // it gets the open authorization back, not a 402 and not a second
        // reserve.
        const second = await exact();
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.authorizationId).toBe(first.authorizationId);
        expect((await userBalances()).pack).toBe(0);
        expect(await db().select().from(serviceAuthorization)).toHaveLength(1);
    });

    test("a retry of a closed authorization is rejected, not reused", async ({
        paidApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 100 });
        const retry = (requestId: string) =>
            authorizeServiceRequest(
                env,
                authorizeInput(paidApiKey, { requestId, estimatedPrice: 5 }),
            );

        const canceledId = crypto.randomUUID();
        const canceled = await retry(canceledId);
        expect(canceled.ok).toBe(true);
        if (!canceled.ok) return;
        await cancelServiceRequest(env, canceled.authorizationId);
        expect((await userBalances()).pack).toBeCloseTo(100);

        const afterCancel = await retry(canceledId);
        expect(afterCancel.ok).toBe(false);
        if (!afterCancel.ok) expect(afterCancel.denial.status).toBe(409);

        const expiredId = crypto.randomUUID();
        const expired = await retry(expiredId);
        expect(expired.ok).toBe(true);
        if (!expired.ok) return;
        await db()
            .update(serviceAuthorization)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(serviceAuthorization.id, expired.authorizationId));
        const afterExpiry = await retry(expiredId);
        expect(afterExpiry.ok).toBe(false);
        if (!afterExpiry.ok) expect(afterExpiry.denial.status).toBe(409);

        // Neither retry reserved or debited anything.
        expect((await userBalances()).pack).toBeCloseTo(100);
        expect(await db().select().from(serviceAuthorization)).toHaveLength(2);
    });

    test("an abandoned wallet-only reservation is released before the next authorize", async ({
        paidApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 60 });
        const first = await authorizeServiceRequest(
            env,
            authorizeInput(paidApiKey, { estimatedPrice: 60 }),
        );
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        expect((await userBalances()).pack).toBe(0);
        await db()
            .update(serviceAuthorization)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(serviceAuthorization.id, first.authorizationId));

        // An unlimited key holds no budget, so only the wallet reserve is
        // outstanding; it is still refunded before the new request's
        // affordability is judged, so the whole 60 is available again.
        const second = await authorizeServiceRequest(
            env,
            authorizeInput(paidApiKey, { estimatedPrice: 60 }),
        );
        expect(second.ok).toBe(true);
        expect((await userBalances()).pack).toBe(0);
        const row = await db()
            .select()
            .from(serviceAuthorization)
            .where(eq(serviceAuthorization.id, first.authorizationId))
            .get();
        expect(row?.expiredAt).toBeInstanceOf(Date);
    });

    test("cancel releases the reservation exactly once", async ({
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
        expect((await userBalances()).pack).toBeCloseTo(95);

        const canceled = await cancelServiceRequest(
            env,
            authorized.authorizationId,
        );
        expect(canceled).toEqual({ ok: true, released: true });
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(100);
        expect((await userBalances()).pack).toBeCloseTo(100);

        const again = await cancelServiceRequest(
            env,
            authorized.authorizationId,
        );
        expect(again).toEqual({ ok: true, released: false });
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(100);
        expect((await userBalances()).pack).toBeCloseTo(100);

        // Canceled means canceled: a late settlement charges nothing.
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [{ eventId: "late", eventType: "media.upload", price: 2 }],
        });
        expect(settled).toEqual({ ok: false, error: "authorization_canceled" });
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(100);
        expect(await db().select().from(serviceBillingEvent)).toHaveLength(0);
    });

    test("the expiry sweep releases abandoned reservations", async ({
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

        // The service died without settling or canceling: age the
        // authorization past its TTL and run the expiry sweep.
        await db()
            .update(serviceAuthorization)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(serviceAuthorization.id, authorized.authorizationId));
        await sweepServiceGateway(env);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(100);
        expect((await userBalances()).pack).toBeCloseTo(100);
        const row = await db()
            .select()
            .from(serviceAuthorization)
            .where(eq(serviceAuthorization.id, authorized.authorizationId))
            .get();
        expect(row?.expiredAt).toBeInstanceOf(Date);

        // Sweeping again must not release twice.
        await sweepServiceGateway(env);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(100);
        expect((await userBalances()).pack).toBeCloseTo(100);

        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [{ eventId: "late", eventType: "media.upload", price: 2 }],
        });
        expect(settled).toEqual({ ok: false, error: "authorization_expired" });
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(100);
    });

    test("an expired authorization rejects settlement and returns its reservation", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ packBalance: 100 });
        const before = await userBalances();
        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;
        expect((await userBalances()).pack).toBeCloseTo(95);
        await db()
            .update(serviceAuthorization)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(serviceAuthorization.id, authorized.authorizationId));

        // No sweep has run yet: the settlement itself notices the expiry
        // and returns the reserve to the wallet and the key.
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [{ eventId: "late", eventType: "media.upload", price: 2 }],
        });
        expect(settled).toEqual({ ok: false, error: "authorization_expired" });
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(100);
        expect(await userBalances()).toEqual(before);
    });

    test("an abandoned reservation cannot cause a false budget denial", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ packBalance: 100 });
        const first = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 60 }),
        );
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(40);
        await db()
            .update(serviceAuthorization)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(serviceAuthorization.id, first.authorizationId));

        // The key's expired reservation is released before the new one is
        // taken, so the second request is authorized against 100, not 40.
        const second = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 60 }),
        );
        expect(second.ok).toBe(true);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(40);
    });

    test("a reused request id only reuses the identical authorization", async ({
        budgetedApiKey,
        paidApiKey,
    }) => {
        await db().update(userTable).set({ packBalance: 100 });
        const requestId = crypto.randomUUID();
        const original = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, {
                requestId,
                estimatedPrice: 5,
            }),
        );
        expect(original.ok).toBe(true);

        // Same credential, different estimate → conflict.
        const changed = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, {
                requestId,
                estimatedPrice: 6,
            }),
        );
        expect(changed.ok).toBe(false);
        if (!changed.ok) expect(changed.denial.status).toBe(409);

        // Another credential under the same request id must never be
        // handed the first payer's authorization.
        const otherPayer = await authorizeServiceRequest(
            env,
            authorizeInput(paidApiKey, { requestId, estimatedPrice: 5 }),
        );
        expect(otherPayer.ok).toBe(false);
        if (!otherPayer.ok) expect(otherPayer.denial.status).toBe(409);

        expect(await db().select().from(serviceAuthorization)).toHaveLength(1);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(95);
    });

    test("reusing an event id with a different price is a conflict", async ({
        paidApiKey,
    }) => {
        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(paidApiKey),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;
        const untouched = await userBalances();

        // Within one call too: a repeated id with a different payload
        // settles nothing, an identical repeat is one event.
        const inCall = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                { eventId: "gen", eventType: "media.upload", price: 2 },
                { eventId: "gen", eventType: "media.upload", price: 3 },
            ],
        });
        expect(inCall).toEqual({ ok: false, error: "event_conflict" });
        expect(await userBalances()).toEqual(untouched);
        const repeated = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                { eventId: "dup", eventType: "media.upload", price: 1 },
                { eventId: "dup", eventType: "media.upload", price: 1 },
            ],
        });
        expect(repeated).toEqual({
            ok: true,
            settled: ["dup"],
            duplicates: [],
        });
        expect(untouched.pack - (await userBalances()).pack).toBeCloseTo(1);
        const first = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [{ eventId: "gen", eventType: "media.upload", price: 2 }],
        });
        expect(first.ok).toBe(true);
        const after = await userBalances();

        // Nothing in a conflicting delivery settles — not even new events
        // beside the conflicting one.
        const conflicting = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                { eventId: "gen", eventType: "media.upload", price: 3 },
                { eventId: "extra", eventType: "media.upload", price: 1 },
            ],
        });
        expect(conflicting).toEqual({ ok: false, error: "event_conflict" });
        expect(await userBalances()).toEqual(after);
        expect(await db().select().from(serviceBillingEvent)).toHaveLength(2);
    });

    test("a key deleted after authorize settles below its reserve at the actual price", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ packBalance: 100 });

        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;
        await db()
            .delete(apikeyTable)
            .where(eq(apikeyTable.id, budgetedApiKey.id));

        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [{ eventId: "small", eventType: "media.upload", price: 3 }],
        });
        expect(settled.ok).toBe(true);
        // Charged 3 of the reserved 5; the unused 2 returns to the wallet.
        expect((await userBalances()).pack).toBeCloseTo(97);
        const [event] = await db().select().from(serviceBillingEvent);
        expect(event.billedPrice).toBeCloseTo(3);
    });

    test("a key deleted after authorize cannot be charged past its reserve", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 100 });
        const before = await userBalances();

        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;

        await db()
            .delete(apikeyTable)
            .where(eq(apikeyTable.id, budgetedApiKey.id));

        // Revocation cannot make completed work free, but a deleted key
        // covers nothing beyond its reserve: a price past it is rejected
        // whole — nothing capped, nothing charged, nothing written.
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [{ eventId: "big", eventType: "media.upload", price: 50 }],
        });
        expect(settled).toEqual({ ok: false, error: "insufficient_budget" });
        expect((await userBalances()).pack).toBeCloseTo(95);
        expect(await db().select().from(serviceBillingEvent)).toHaveLength(0);

        // The reserve is still held for the service to release.
        await cancelServiceRequest(env, authorized.authorizationId);
        expect(await userBalances()).toEqual(before);
    });

    test("a charge beyond reservation plus live key budget is rejected whole", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 500 });

        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(95);

        // Price beyond reserve (5) + remaining budget (95): the wallet could
        // pay, the key cannot — the whole call is refused, never capped.
        const refused = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                { eventId: "huge", eventType: "media.upload", price: 300 },
            ],
        });
        expect(refused).toEqual({ ok: false, error: "insufficient_budget" });
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(95);
        expect((await userBalances()).pack).toBeCloseTo(495);
        expect(await db().select().from(serviceBillingEvent)).toHaveLength(0);

        // Exactly reserve + budget is a funded overage and settles in full.
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                { eventId: "huge", eventType: "media.upload", price: 100 },
            ],
        });
        expect(settled).toMatchObject({ ok: true, settled: ["huge"] });
        expect(await keyBudget(budgetedApiKey.id)).toBe(0);
        expect((await userBalances()).pack).toBeCloseTo(400);
    });

    test("BYOP markup bills the payer and credits the app owner", async ({
        paidApiKey,
    }) => {
        const introspected = await introspectServiceToken(env, paidApiKey);
        expect(introspected.valid).toBe(true);
        if (!introspected.valid) return;
        const payerId = introspected.user.id;
        // Make tier unable to cover so the pack bucket pays deterministically.
        await db().update(userTable).set({ tierBalance: 0 });

        await seedUser("dev_owner");
        const clientKey = await createKey("dev_owner", "pk", {
            keyType: "publishable",
            earningsEnabled: true,
        });
        await db()
            .update(apikeyTable)
            .set({ byopClientKeyId: clientKey.id })
            .where(eq(apikeyTable.id, introspected.apiKey.id));

        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(paidApiKey, { estimatedPrice: 4 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;

        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [{ eventId: "gen", eventType: "media.upload", price: 4 }],
        });
        expect(settled.ok).toBe(true);

        // Payer pays baseline + 25% markup from pack; the dev is credited
        // the markup into the same bucket.
        const payer = await userBalances(payerId);
        expect(payer.pack).toBeCloseTo(95);
        const dev = await userBalances("dev_owner");
        expect(dev.pack).toBeCloseTo(1);
        const [event] = await db().select().from(serviceBillingEvent);
        expect(event.billedPrice).toBeCloseTo(5);
        expect(event.markupRate).toBeCloseTo(0.25);
    });

    test("community rewards credit the model owner, but never the payer themselves", async ({
        paidApiKey,
    }) => {
        const introspected = await introspectServiceToken(env, paidApiKey);
        expect(introspected.valid).toBe(true);
        if (!introspected.valid) return;
        const payerId = introspected.user.id;
        await db().update(userTable).set({ tierBalance: 0 });
        await seedUser("model_owner");

        const authorize = () =>
            authorizeServiceRequest(env, authorizeInput(paidApiKey));

        const first = await authorize();
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const rewarded = await settleServiceEvents(env, {
            authorizationId: first.authorizationId,
            events: [
                {
                    eventId: "gen",
                    eventType: "media.upload",
                    price: 4,
                    communityReward: {
                        ownerUserId: "model_owner",
                        rewardRate: 0.5,
                    },
                },
            ],
        });
        expect(rewarded.ok).toBe(true);
        expect((await userBalances("model_owner")).pack).toBeCloseTo(2);
        expect((await userBalances(payerId)).pack).toBeCloseTo(96);

        // The caller's own community endpoint bills nothing and rewards
        // nothing — they already bear the upstream cost themselves.
        const second = await authorize();
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        const selfServed = await settleServiceEvents(env, {
            authorizationId: second.authorizationId,
            events: [
                {
                    eventId: "self",
                    eventType: "media.upload",
                    price: 4,
                    communityReward: {
                        ownerUserId: payerId,
                        rewardRate: 0.5,
                    },
                },
            ],
        });
        expect(selfServed.ok).toBe(true);
        expect((await userBalances(payerId)).pack).toBeCloseTo(96);
        const [selfEvent] = await db()
            .select()
            .from(serviceBillingEvent)
            .where(
                eq(serviceBillingEvent.authorizationId, second.authorizationId),
            );
        expect(selfEvent.billedPrice).toBe(0);
    });

    test("a charge the payer's bucket cannot cover is rejected whole, never as debt", async ({
        mocks,
        apiKey,
    }) => {
        await mocks.enable("tinybird");
        const introspected = await introspectServiceToken(env, apiKey);
        expect(introspected.valid).toBe(true);
        if (!introspected.valid) return;
        const payerId = introspected.user.id;
        await db()
            .update(userTable)
            .set({ tierBalance: 1, packBalance: 0 })
            .where(eq(userTable.id, payerId));
        await seedUser("unpaid_owner");

        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(apiKey),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                {
                    eventId: "unfunded",
                    eventType: "media.upload",
                    price: 5,
                    communityReward: {
                        ownerUserId: "unpaid_owner",
                        rewardRate: 0.5,
                    },
                },
            ],
        });
        expect(settled).toEqual({ ok: false, error: "insufficient_balance" });

        // No Quest-Pollen debt, no reward paid out of a shortfall, no
        // ledger row and no analytics row: the call never happened.
        expect(await userBalances(payerId)).toEqual({ tier: 1, pack: 0 });
        expect(await userBalances("unpaid_owner")).toEqual({
            tier: 0,
            pack: 0,
        });
        expect(await db().select().from(serviceBillingEvent)).toHaveLength(0);
        expect(mocks.tinybird.state.events).toHaveLength(0);
    });

    test("the wallet bucket is fixed at authorize and every event bills it", async ({
        mocks,
        apiKey,
        paidApiKey,
    }) => {
        await mocks.enable("tinybird");
        await db().update(userTable).set({ tierBalance: 10, packBalance: 100 });

        // Quest Pollen covers the estimate → tier, reserved right away.
        const tier = await authorizeServiceRequest(
            env,
            authorizeInput(apiKey, { estimatedPrice: 5 }),
        );
        expect(tier.ok).toBe(true);
        if (!tier.ok) return;
        expect(await userBalances()).toEqual({ tier: 5, pack: 100 });
        // A price beyond the estimate stays on the chosen bucket — even
        // though the pack could cover it — and never falls across.
        const settled = await settleServiceEvents(env, {
            authorizationId: tier.authorizationId,
            events: [{ eventId: "gen", eventType: "media.upload", price: 8 }],
        });
        expect(settled.ok).toBe(true);
        expect(await userBalances()).toEqual({ tier: 2, pack: 100 });
        expect(mocks.tinybird.state.events[0]).toMatchObject({
            selectedMeterSlug: "v1:meter:tier",
            totalPrice: 8,
        });

        // Quest Pollen no longer covers the estimate → pack.
        const pack = await authorizeServiceRequest(
            env,
            authorizeInput(apiKey, { estimatedPrice: 5 }),
        );
        expect(pack.ok).toBe(true);
        expect(await userBalances()).toEqual({ tier: 2, pack: 95 });

        // Paid-only work is always billed to the pack.
        const paidOnly = await authorizeServiceRequest(
            env,
            authorizeInput(paidApiKey, { estimatedPrice: 1, paidOnly: true }),
        );
        expect(paidOnly.ok).toBe(true);
        expect(await userBalances()).toEqual({ tier: 2, pack: 94 });
        const rows = await db().select().from(serviceAuthorization);
        expect(rows.map((row) => row.payerBucket).sort()).toEqual([
            "pack",
            "pack",
            "tier",
        ]);
    });

    test("concurrent authorizations against one exact balance admit only funded work", async ({
        paidApiKey,
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 10 });
        const exact = () =>
            authorizeServiceRequest(
                env,
                authorizeInput(paidApiKey, { estimatedPrice: 10 }),
            );
        const results = await Promise.all([exact(), exact()]);
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(results.filter((result) => !result.ok)).toHaveLength(1);
        expect((await userBalances()).pack).toBe(0);
        expect(await db().select().from(serviceAuthorization)).toHaveLength(1);

        // Same for a finite key budget: two requests for the whole budget
        // cannot both reserve it.
        await db().update(userTable).set({ packBalance: 1000 });
        const wholeBudget = () =>
            authorizeServiceRequest(
                env,
                authorizeInput(budgetedApiKey.key, { estimatedPrice: 100 }),
            );
        const keyed = await Promise.all([wholeBudget(), wholeBudget()]);
        expect(keyed.filter((result) => result.ok)).toHaveLength(1);
        expect(await keyBudget(budgetedApiKey.id)).toBe(0);
        // The wallet moved exactly once for the one admitted request.
        expect((await userBalances()).pack).toBe(900);
    });

    test("an overage the wallet cannot cover rejects the whole call", async ({
        paidApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 6 });
        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(paidApiKey, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;
        expect((await userBalances()).pack).toBeCloseTo(1);

        // Reserve 5 + live 1 covers 6, not 8: nothing moves, nothing lands.
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [{ eventId: "gen", eventType: "media.upload", price: 8 }],
        });
        expect(settled).toEqual({ ok: false, error: "insufficient_balance" });
        expect((await userBalances()).pack).toBeCloseTo(1);
        expect(await db().select().from(serviceBillingEvent)).toHaveLength(0);

        // The service abandons the request; the reserve comes back whole.
        await cancelServiceRequest(env, authorized.authorizationId);
        expect((await userBalances()).pack).toBeCloseTo(6);
    });

    test("an overage a finite key cannot cover rejects the whole call", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 1000 });
        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;

        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [{ eventId: "gen", eventType: "media.upload", price: 200 }],
        });
        expect(settled).toEqual({ ok: false, error: "insufficient_budget" });
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(95);
        expect((await userBalances()).pack).toBeCloseTo(995);
        expect(await db().select().from(serviceBillingEvent)).toHaveLength(0);
    });

    test("concurrent overages cannot both spend one wallet headroom", async ({
        paidApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 13 });
        const authorize = () =>
            authorizeServiceRequest(
                env,
                authorizeInput(paidApiKey, { estimatedPrice: 5 }),
            );
        const [a, b] = await Promise.all([authorize(), authorize()]);
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        // Two reserves of 5 leave 3 live; each request now needs 3 more.
        expect((await userBalances()).pack).toBeCloseTo(3);
        const settle = (authorizationId: string) =>
            settleServiceEvents(env, {
                authorizationId,
                events: [
                    { eventId: "gen", eventType: "media.upload", price: 8 },
                ],
            });

        const results = await Promise.all([
            settle(a.authorizationId),
            settle(b.authorizationId),
        ]);
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(results.filter((result) => !result.ok)).toEqual([
            { ok: false, error: "insufficient_balance" },
        ]);
        expect((await userBalances()).pack).toBe(0);
        expect(await db().select().from(serviceBillingEvent)).toHaveLength(1);
    });

    test("settlement reconciles the call total against the reserve", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 100 });
        const settleFor = async (price: number) => {
            const authorized = await authorizeServiceRequest(
                env,
                authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
            );
            expect(authorized.ok).toBe(true);
            if (!authorized.ok) throw new Error("not authorized");
            const settled = await settleServiceEvents(env, {
                authorizationId: authorized.authorizationId,
                events: [{ eventId: "gen", eventType: "media.upload", price }],
            });
            expect(settled.ok).toBe(true);
        };

        // Lower: the unused 3 returns to wallet and key.
        await settleFor(2);
        expect((await userBalances()).pack).toBeCloseTo(98);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(98);
        // Equal: nothing more moves.
        await settleFor(5);
        expect((await userBalances()).pack).toBeCloseTo(93);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(93);
        // Higher: the extra 3 comes from the live wallet and key.
        await settleFor(8);
        expect((await userBalances()).pack).toBeCloseTo(85);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(85);
    });

    test("a leading zero-price event neither consumes nor refunds the reserve", async ({
        budgetedApiKey,
    }) => {
        await db().update(userTable).set({ tierBalance: 0, packBalance: 100 });
        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;

        // An abandoned fallback attempt is reported before the charged
        // outcome, as gen does; the reserve still covers the outcome.
        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                { eventId: "attempt-0", eventType: "media.upload", price: 0 },
                { eventId: "generation", eventType: "media.upload", price: 2 },
            ],
        });
        expect(settled).toMatchObject({
            ok: true,
            settled: ["attempt-0", "generation"],
        });
        expect((await userBalances()).pack).toBeCloseTo(98);
        expect(await keyBudget(budgetedApiKey.id)).toBeCloseTo(98);
        const billed = Object.fromEntries(
            (await db().select().from(serviceBillingEvent)).map((row) => [
                row.eventId,
                row.billedPrice,
            ]),
        );
        expect(billed).toEqual({ "attempt-0": 0, generation: 2 });
    });

    test("one event, split calls and reordered delivery settle identically", async ({
        mocks,
        budgetedApiKey,
    }) => {
        await mocks.enable("tinybird");
        await db().update(userTable).set({ tierBalance: 0, packBalance: 100 });
        await seedUser("split_owner");
        const rewarded = {
            eventId: "a",
            eventType: "media.upload" as const,
            price: 2,
            communityReward: { ownerUserId: "split_owner", rewardRate: 0.5 },
        };
        const plain = {
            eventId: "b",
            eventType: "media.upload" as const,
            price: 1,
        };

        const run = async (calls: (typeof rewarded | typeof plain)[][]) => {
            const payerBefore = (await userBalances()).pack;
            const ownerBefore = (await userBalances("split_owner")).pack;
            const keyBefore = await keyBudget(budgetedApiKey.id);
            const authorized = await authorizeServiceRequest(
                env,
                authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
            );
            expect(authorized.ok).toBe(true);
            if (!authorized.ok) throw new Error("not authorized");
            const meters = new Set<string>();
            for (const events of calls) {
                const settled = await settleServiceEvents(env, {
                    authorizationId: authorized.authorizationId,
                    events,
                });
                expect(settled.ok).toBe(true);
            }
            for (const event of mocks.tinybird.state.events.splice(0)) {
                meters.add(event.selectedMeterSlug as string);
            }
            const rows = await db()
                .select()
                .from(serviceBillingEvent)
                .where(
                    eq(
                        serviceBillingEvent.authorizationId,
                        authorized.authorizationId,
                    ),
                );
            return {
                payer: payerBefore - (await userBalances()).pack,
                owner: (await userBalances("split_owner")).pack - ownerBefore,
                key:
                    (keyBefore ?? 0) -
                    ((await keyBudget(budgetedApiKey.id)) ?? 0),
                meters: [...meters],
                rewards: rows.map((row) => row.communityRewardCredit).sort(),
            };
        };

        const single = await run([[rewarded, plain]]);
        expect(single).toEqual({
            payer: 3,
            owner: 1,
            key: 3,
            meters: ["v1:meter:pack"],
            rewards: [0, 1],
        });
        expect(await run([[rewarded], [plain]])).toEqual(single);
        expect(await run([[plain], [rewarded]])).toEqual(single);
    });

    test("an underfunded request is rejected identically however its events are split or ordered", async ({
        mocks,
        budgetedApiKey,
    }) => {
        await mocks.enable("tinybird");
        await db().update(userTable).set({ tierBalance: 0, packBalance: 6 });
        await seedUser("starved_owner");
        const rewarded = {
            eventId: "a",
            eventType: "media.upload" as const,
            price: 7,
            communityReward: { ownerUserId: "starved_owner", rewardRate: 0.5 },
        };
        const plain = {
            eventId: "b",
            eventType: "media.upload" as const,
            price: 7,
        };

        // Reserve 5 + live 1: neither event, nor both, fits.
        const run = async (calls: (typeof rewarded | typeof plain)[][]) => {
            const payerBefore = await userBalances();
            const ownerBefore = await userBalances("starved_owner");
            const keyBefore = await keyBudget(budgetedApiKey.id);
            const authorized = await authorizeServiceRequest(
                env,
                authorizeInput(budgetedApiKey.key, { estimatedPrice: 5 }),
            );
            expect(authorized.ok).toBe(true);
            if (!authorized.ok) throw new Error("not authorized");
            const errors: string[] = [];
            for (const events of calls) {
                const settled = await settleServiceEvents(env, {
                    authorizationId: authorized.authorizationId,
                    events,
                });
                if (!settled.ok) errors.push(settled.error);
            }
            const receipts = await db()
                .select()
                .from(serviceBillingEvent)
                .where(
                    eq(
                        serviceBillingEvent.authorizationId,
                        authorized.authorizationId,
                    ),
                );
            await cancelServiceRequest(env, authorized.authorizationId);
            return {
                errors,
                receipts: receipts.length,
                analytics: mocks.tinybird.state.events.splice(0).length,
                payer: await userBalances(),
                owner: await userBalances("starved_owner"),
                key: await keyBudget(budgetedApiKey.id),
                payerBefore,
                ownerBefore,
                keyBefore,
            };
        };

        for (const calls of [
            [[rewarded, plain]],
            [[rewarded], [plain]],
            [[plain], [rewarded]],
        ]) {
            const outcome = await run(calls);
            expect(outcome.errors).toEqual(
                calls.map(() => "insufficient_balance"),
            );
            expect(outcome.receipts).toBe(0);
            expect(outcome.analytics).toBe(0);
            expect(outcome.payer).toEqual(outcome.payerBefore);
            expect(outcome.owner).toEqual(outcome.ownerBefore);
            expect(outcome.key).toEqual(outcome.keyBefore);
        }
    });

    test("zero-price events keep the producer's billed verdict", async ({
        mocks,
        paidApiKey,
    }) => {
        await mocks.enable("tinybird");
        const authorized = await authorizeServiceRequest(
            env,
            authorizeInput(paidApiKey),
        );
        expect(authorized.ok).toBe(true);
        if (!authorized.ok) return;

        const settled = await settleServiceEvents(env, {
            authorizationId: authorized.authorizationId,
            events: [
                {
                    eventId: "free-but-billed",
                    eventType: "media.upload",
                    price: 0,
                    // A zero-priced listing still counts as billed usage
                    // when the producer says so.
                    telemetry: { isBilledUsage: true },
                },
                {
                    eventId: "silent",
                    eventType: "media.upload",
                    price: 0,
                },
            ],
        });
        expect(settled.ok).toBe(true);
        const [billed, silent] = mocks.tinybird.state.events;
        expect(billed).toMatchObject({ isBilledUsage: true, totalPrice: 0 });
        expect(silent.totalPrice).toBe(0);
        expect(Object.hasOwn(silent, "isBilledUsage")).toBe(false);
    });
});
