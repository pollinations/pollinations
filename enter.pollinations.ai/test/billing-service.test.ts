import { createExecutionContext, env } from "cloudflare:test";
import { authenticateApiKeyRequest } from "@shared/auth/api-key.ts";
import type { BillableEvent } from "@shared/schemas/billable-event.ts";
import { expect } from "vitest";
import { settleBillableEvents } from "@/services/billing-service.ts";
import { BillingService } from "../src/index.ts";
import { test } from "./fixtures.ts";

async function authenticate(apiKey: string) {
    const auth = await authenticateApiKeyRequest({
        request: new Request("http://localhost", {
            headers: { Authorization: `Bearer ${apiKey}` },
        }),
        env,
    });
    if (!auth?.user) throw new Error("Test API key did not authenticate");
    return auth;
}

function event(
    id: string,
    price: number,
    overrides: Partial<BillableEvent> = {},
): BillableEvent {
    return {
        id,
        requestId: "request-1",
        meter: "test.generation",
        price,
        paidOnly: false,
        occurredAt: 1_787_500_000_000,
        ...overrides,
    };
}

async function balances(userId: string, apiKeyId: string) {
    const user = await env.DB.prepare(
        `SELECT tier_balance AS tier, pack_balance AS pack
         FROM user WHERE id = ?`,
    )
        .bind(userId)
        .first<{ tier: number; pack: number }>();
    const key = await env.DB.prepare(
        "SELECT pollen_balance AS budget FROM apikey WHERE id = ?",
    )
        .bind(apiKeyId)
        .first<{ budget: number }>();
    return { user, key };
}

test("the internal entrypoint authenticates the caller token", async ({
    budgetedApiKey,
}) => {
    const service = new BillingService(createExecutionContext(), env);
    const authorization = await service.authorize(budgetedApiKey.key);
    expect(authorization).toMatchObject({
        ok: true,
        authorization: {
            apiKey: {
                id: budgetedApiKey.id,
                pollenBudget: 100,
            },
            balance: {
                tier: expect.any(Number),
                paid: expect.any(Number),
            },
        },
    });
    const result = await service.settle(budgetedApiKey.key, [
        event("entrypoint-event", 0),
    ]);

    expect(result).toEqual({
        ok: true,
        events: [
            {
                id: "entrypoint-event",
                status: "settled",
                billedPrice: 0,
                payerBucket: null,
            },
        ],
    });
    await expect(
        service.settle("invalid", [event("invalid", 1)]),
    ).resolves.toEqual({ ok: false, error: "invalid_api_key" });
    await expect(service.authorize("invalid")).resolves.toEqual({
        ok: false,
        error: "invalid_api_key",
    });
});

test("settles multiple events and makes retries no-ops", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const events = [event("event-1", 1.5), event("event-2", 2.25)];

    await expect(settleBillableEvents(env.DB, auth, events)).resolves.toEqual([
        {
            id: "event-1",
            status: "settled",
            billedPrice: 1.5,
            payerBucket: "tier",
        },
        {
            id: "event-2",
            status: "settled",
            billedPrice: 2.25,
            payerBucket: "tier",
        },
    ]);
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 6.25, pack: 10 },
        key: { budget: 96.25 },
    });

    const retry = await settleBillableEvents(env.DB, auth, events);
    expect(retry.map(({ status }) => status)).toEqual([
        "duplicate",
        "duplicate",
    ]);
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 6.25, pack: 10 },
        key: { budget: 96.25 },
    });
});

test("rejects only the events that exceed the remaining API key budget", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.batch([
        env.DB.prepare(
            "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
        ).bind(auth.user.id),
        env.DB.prepare(
            "UPDATE apikey SET pollen_balance = 2 WHERE id = ?",
        ).bind(auth.apiKey.id),
    ]);

    const result = await settleBillableEvents(env.DB, auth, [
        event("within-budget", 1.5),
        event("over-budget", 1),
    ]);

    expect(result).toEqual([
        {
            id: "within-budget",
            status: "settled",
            billedPrice: 1.5,
            payerBucket: "tier",
        },
        {
            id: "over-budget",
            status: "rejected",
            reason: "api_key_unavailable_or_budget_exhausted",
        },
    ]);
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 8.5, pack: 10 },
        key: { budget: 0.5 },
    });
});

test("paid-only events debit paid balance", async ({ budgetedApiKey }) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 5 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();

    const result = await settleBillableEvents(env.DB, auth, [
        event("paid-event", 2, { paidOnly: true }),
    ]);

    expect(result[0]).toMatchObject({
        status: "settled",
        payerBucket: "pack",
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 10, pack: 3 },
        key: { budget: 98 },
    });
});

test("conflicting reuse of an event id does not charge again", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();

    await settleBillableEvents(env.DB, auth, [event("stable-id", 1)]);
    const result = await settleBillableEvents(env.DB, auth, [
        event("stable-id", 4),
    ]);

    expect(result).toEqual([
        {
            id: "stable-id",
            status: "conflict",
            reason: "event_id_already_used",
        },
    ]);
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 9, pack: 10 },
        key: { budget: 99 },
    });
});
