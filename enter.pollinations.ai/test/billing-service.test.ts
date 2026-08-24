import { createExecutionContext, env } from "cloudflare:test";
import { authenticateApiKeyRequest } from "@shared/auth/api-key.ts";
import type {
    BillableEvent,
    BillingAuthorization,
} from "@shared/schemas/billable-event.ts";
import { expect } from "vitest";
import { BillingService } from "../src/index.ts";
import { test } from "./fixtures.ts";

function service() {
    return new BillingService(createExecutionContext(), env);
}

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

function authorization(
    requestId: string,
    estimatedPrice: number,
    overrides: Partial<BillingAuthorization> = {},
): BillingAuthorization {
    return {
        producer: "test-service",
        requestId,
        estimatedPrice,
        paidOnly: false,
        ...overrides,
    };
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

async function authorize(
    apiKey: string,
    input: BillingAuthorization,
): Promise<string> {
    const result = await service().authorize(apiKey, input);
    if (!result.ok) throw new Error(`Authorization failed: ${result.error}`);
    return result.authorization.grant.id;
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

test("the internal entrypoint authenticates and reserves a request", async ({
    budgetedApiKey,
}) => {
    const billing = service();
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const input = authorization("request-1", 1);
    const result = await billing.authorize(budgetedApiKey.key, input);
    expect(result).toMatchObject({
        ok: true,
        authorization: {
            apiKey: { id: budgetedApiKey.id },
            grant: { reservedPrice: 1, duplicate: false },
        },
    });
    if (!result.ok) throw new Error("Expected authorization to succeed");

    await expect(
        billing.authorize(budgetedApiKey.key, input),
    ).resolves.toMatchObject({
        ok: true,
        authorization: {
            grant: { id: result.authorization.grant.id, duplicate: true },
        },
    });
    await expect(
        billing.settle(result.authorization.grant.id, [
            event("entrypoint-event", 1),
        ]),
    ).resolves.toMatchObject({
        ok: true,
        events: [{ id: "entrypoint-event", status: "settled" }],
    });
    await expect(
        billing.authorize("invalid", authorization("invalid", 1)),
    ).resolves.toEqual({ ok: false, error: "invalid_api_key" });
    await expect(billing.authorize(budgetedApiKey.key, {})).resolves.toEqual({
        ok: false,
        error: "invalid_authorization",
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
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 3.75),
    );

    await expect(service().settle(grantId, events)).resolves.toEqual({
        ok: true,
        events: [
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
        ],
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 6.25, pack: 10 },
        key: { budget: 96.25 },
    });

    const retry = await service().settle(grantId, events);
    expect(retry.ok && retry.events.map(({ status }) => status)).toEqual([
        "duplicate",
        "duplicate",
    ]);
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 6.25, pack: 10 },
        key: { budget: 96.25 },
    });
});

test("finite key budget is reserved before service work", async ({
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

    const first = await service().authorize(
        budgetedApiKey.key,
        authorization("first-reservation", 1.5),
    );
    expect(first).toMatchObject({ ok: true });
    await expect(
        service().authorize(
            budgetedApiKey.key,
            authorization("second-reservation", 1),
        ),
    ).resolves.toEqual({
        ok: false,
        error: "insufficient_balance_or_budget",
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 10, pack: 10 },
        key: { budget: 0.5 },
    });
});

test("authorization enforces the key's model permissions", async ({
    restrictedApiKey,
}) => {
    await expect(
        service().authorize(
            restrictedApiKey,
            authorization("restricted-request", 0, {
                model: "not-allowed",
            }),
        ),
    ).resolves.toEqual({ ok: false, error: "model_not_allowed" });
});

test("reconciles the estimate with multiple actual events", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 4),
    );
    await service().settle(grantId, [
        event("reconcile-1", 1),
        event("reconcile-2", 2),
    ]);

    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 7, pack: 10 },
        key: { budget: 97 },
    });
});

test("actual cost cannot exceed the remaining finite key budget", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.batch([
        env.DB.prepare(
            "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
        ).bind(auth.user.id),
        env.DB.prepare(
            "UPDATE apikey SET pollen_balance = 1.5 WHERE id = ?",
        ).bind(auth.apiKey.id),
    ]);
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 1),
    );

    await expect(
        service().settle(grantId, [event("over-approved-budget", 2)]),
    ).resolves.toEqual({
        ok: true,
        events: [
            {
                id: "over-approved-budget",
                status: "rejected",
                reason: "authorization_unavailable",
            },
        ],
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 10, pack: 10 },
        key: { budget: 0.5 },
    });
});

test("revoking a key after reservation does not erase completed usage", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 2),
    );
    await env.DB.prepare("DELETE FROM apikey WHERE id = ?")
        .bind(auth.apiKey.id)
        .run();

    await expect(
        service().settle(grantId, [event("revoked-key-event", 2)]),
    ).resolves.toMatchObject({
        ok: true,
        events: [{ id: "revoked-key-event", status: "settled" }],
    });
    const user = await env.DB.prepare(
        "SELECT tier_balance AS tier, pack_balance AS pack FROM user WHERE id = ?",
    )
        .bind(auth.user.id)
        .first<{ tier: number; pack: number }>();
    expect(user).toEqual({ tier: 8, pack: 10 });
});

test("paid-only events debit paid balance", async ({ budgetedApiKey }) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 5 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 2, { paidOnly: true }),
    );
    const result = await service().settle(grantId, [
        event("paid-event", 2, { paidOnly: true }),
    ]);

    expect(result.ok && result.events[0]).toMatchObject({
        status: "settled",
        payerBucket: "pack",
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 10, pack: 3 },
        key: { budget: 98 },
    });
});

test("conflicting reuse of a grant-scoped event id does not charge again", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 1),
    );

    await service().settle(grantId, [event("stable-id", 1)]);
    const result = await service().settle(grantId, [event("stable-id", 4)]);

    expect(result).toEqual({
        ok: true,
        events: [
            {
                id: "stable-id",
                status: "conflict",
                reason: "event_id_already_used",
            },
        ],
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 9, pack: 10 },
        key: { budget: 99 },
    });
});

test("events cannot escape their authorization request", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("authorized-request", 2),
    );

    await expect(
        service().settle(grantId, [
            event("wrong-request-event", 2, {
                requestId: "different-request",
            }),
        ]),
    ).resolves.toEqual({
        ok: true,
        events: [
            {
                id: "wrong-request-event",
                status: "rejected",
                reason: "authorization_unavailable",
            },
        ],
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 10, pack: 10 },
        key: { budget: 98 },
    });
    await service().cancel(grantId);
});

test("cancelling unused work releases the finite-key reservation", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 10 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("cancel-request", 3),
    );
    expect((await balances(auth.user.id, auth.apiKey.id)).key).toEqual({
        budget: 97,
    });

    await expect(service().cancel(grantId)).resolves.toEqual({
        cancelled: true,
    });
    await expect(service().cancel(grantId)).resolves.toEqual({
        cancelled: false,
    });
    expect((await balances(auth.user.id, auth.apiKey.id)).key).toEqual({
        budget: 100,
    });
    await expect(
        service().settle(grantId, [event("cancelled-event", 1)]),
    ).resolves.toEqual({
        ok: true,
        events: [
            {
                id: "cancelled-event",
                status: "rejected",
                reason: "authorization_unavailable",
            },
        ],
    });
});
