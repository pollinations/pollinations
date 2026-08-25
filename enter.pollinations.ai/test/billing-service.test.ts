import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import { authenticateApiKeyRequest } from "@shared/auth/api-key.ts";
import type {
    BillableEvent,
    BillingAuthorization,
} from "@shared/schemas/billable-event.ts";
import { expect } from "vitest";
import { BillingService } from "../src/billing-entrypoint.ts";
import { runBillingMaintenance } from "../src/services/billing-maintenance.ts";
import { BILLING_AUTHORIZATION_TTL_MS } from "../src/services/billing-service.ts";
import { test } from "./fixtures.ts";

function service(ctx = createExecutionContext()) {
    return new BillingService(ctx, env);
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
        telemetry: {
            eventType: "test.generation",
            startTime: "2026-08-24T00:00:00.000Z",
            duration: 100,
            model: "test-model",
        },
        ...overrides,
    };
}

async function authorize(
    apiKey: string,
    input: BillingAuthorization,
): Promise<string> {
    const result = await service().authorize(apiKey, input);
    if (!result.ok) throw new Error(`Authorization failed: ${result.error}`);
    return result.grant.id;
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
    mocks,
}) => {
    await mocks.enable("tinybird");
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
        identity: { apiKey: { id: budgetedApiKey.id } },
        grant: { reservedPrice: 1, duplicate: false },
    });
    if (!result.ok) throw new Error("Expected authorization to succeed");

    await expect(
        billing.authorize(budgetedApiKey.key, input),
    ).resolves.toMatchObject({
        ok: true,
        grant: { id: result.grant.id, duplicate: true },
    });
    await expect(
        billing.settle(result.grant.id, [event("entrypoint-event", 1)]),
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

test("introspection returns balances, key provenance, and verified run claims", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        `UPDATE user SET tier_balance = 4, pack_balance = 7 WHERE id = ?`,
    )
        .bind(auth.user.id)
        .run();
    const parentRequestId = crypto.randomUUID();
    const token = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: auth.apiKey.id,
        parentRequestId,
        managedAgentId: "agent-1",
    });

    const result = await service().introspect(token);

    expect(result).toMatchObject({
        ok: true,
        identity: {
            userId: auth.user.id,
            balances: { tier: 4, pack: 7, apiKey: 100 },
            apiKey: {
                id: auth.apiKey.id,
                name: "budgeted-test-key",
                createdVia: "api",
                clientName: null,
                clientUserId: null,
            },
            agentRun: {
                parentApiKeyId: auth.apiKey.id,
                parentRequestId,
                managedAgentId: "agent-1",
            },
        },
    });
    expect(JSON.stringify(result)).not.toContain(budgetedApiKey.key);
});

test("authorization accepts exact wallet and key balances", async ({
    budgetedApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.batch([
        env.DB.prepare(
            "UPDATE user SET tier_balance = 1, pack_balance = 0 WHERE id = ?",
        ).bind(auth.user.id),
        env.DB.prepare(
            "UPDATE apikey SET pollen_balance = 1 WHERE id = ?",
        ).bind(auth.apiKey.id),
    ]);

    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 1),
    );
    await expect(
        service().settle(grantId, [event("exact-balance", 1)]),
    ).resolves.toMatchObject({
        ok: true,
        events: [{ status: "settled" }],
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 0, pack: 0 },
        key: { budget: 0 },
    });
});

test("settles multiple events and makes retries no-ops", async ({
    budgetedApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
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

test("wallet and finite key budget are reserved before service work", async ({
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
        user: { tier: 8.5, pack: 10 },
        key: { budget: 0.5 },
    });
});

test("concurrent grants cannot oversubscribe an exact wallet balance", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.batch([
        env.DB.prepare(
            "UPDATE user SET tier_balance = 1, pack_balance = 0 WHERE id = ?",
        ).bind(auth.user.id),
        env.DB.prepare(
            "UPDATE apikey SET pollen_balance = 2 WHERE id = ?",
        ).bind(auth.apiKey.id),
    ]);

    const first = await service().authorize(
        budgetedApiKey.key,
        authorization("wallet-reservation-1", 1),
    );
    expect(first).toMatchObject({ ok: true });
    await expect(
        service().authorize(
            budgetedApiKey.key,
            authorization("wallet-reservation-2", 1),
        ),
    ).resolves.toEqual({
        ok: false,
        error: "insufficient_balance_or_budget",
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 0, pack: 0 },
        key: { budget: 1 },
    });
    if (!first.ok) throw new Error("Expected first authorization to succeed");
    await service().cancel(first.grant.id);
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 1, pack: 0 },
        key: { budget: 2 },
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
    mocks,
}) => {
    await mocks.enable("tinybird");
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

test("settlement selects the funded bucket from the measured total", async ({
    budgetedApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 2, pack_balance = 5 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("cross-bucket-actual", 1),
    );

    await expect(
        service().settle(grantId, [
            event("cross-bucket-event", 4, {
                requestId: "cross-bucket-actual",
            }),
        ]),
    ).resolves.toMatchObject({
        ok: true,
        events: [{ status: "settled", payerBucket: "pack" }],
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 2, pack: 1 },
        key: { budget: 96 },
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
        user: { tier: 9, pack: 10 },
        key: { budget: 0.5 },
    });
    await service().cancel(grantId);
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 10, pack: 10 },
        key: { budget: 1.5 },
    });
});

test("revoking a key after reservation does not erase completed usage", async ({
    budgetedApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
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

test("revoked keys cannot spend above their reserved budget", async ({
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
    await env.DB.prepare("DELETE FROM apikey WHERE id = ?")
        .bind(auth.apiKey.id)
        .run();

    await expect(
        service().settle(grantId, [event("revoked-key-overage", 1.01)]),
    ).resolves.toMatchObject({
        ok: true,
        events: [{ status: "rejected" }],
    });
    const user = await env.DB.prepare(
        "SELECT tier_balance AS tier, pack_balance AS pack FROM user WHERE id = ?",
    )
        .bind(auth.user.id)
        .first<{ tier: number; pack: number }>();
    expect(user).toEqual({ tier: 9, pack: 10 });
    await service().cancel(grantId);
    const restored = await env.DB.prepare(
        "SELECT tier_balance AS tier, pack_balance AS pack FROM user WHERE id = ?",
    )
        .bind(auth.user.id)
        .first<{ tier: number; pack: number }>();
    expect(restored).toEqual({ tier: 10, pack: 10 });
});

test("paid-only events debit paid balance", async ({
    budgetedApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 2 WHERE id = ?",
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
        user: { tier: 10, pack: 0 },
        key: { budget: 98 },
    });
});

test("zero-cost paid-only authorization still requires paid balance", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 0 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();

    await expect(
        service().authorize(
            budgetedApiKey.key,
            authorization("zero-paid-only", 0, { paidOnly: true }),
        ),
    ).resolves.toEqual({
        ok: false,
        error: "insufficient_balance_or_budget",
    });
});

test("settlement atomically applies BYOP and community credits with telemetry", async ({
    budgetedApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const auth = await authenticate(budgetedApiKey.key);
    const developerId = "billing-developer";
    const communityOwnerId = "community-owner";
    const clientKeyId = "billing-client-key";
    await env.DB.batch([
        env.DB.prepare(
            `INSERT INTO user (
                id, name, email, email_verified, tier, tier_balance, pack_balance
             ) VALUES (?, 'Developer', 'developer@example.test', 1, 'spore', 0, 0)`,
        ).bind(developerId),
        env.DB.prepare(
            `INSERT INTO user (
                id, name, email, email_verified, tier, tier_balance, pack_balance
             ) VALUES (?, 'Community', 'community@example.test', 1, 'spore', 0, 0)`,
        ).bind(communityOwnerId),
        env.DB.prepare(
            `INSERT INTO apikey (
                id, name, prefix, key, user_id, enabled, created_at, updated_at,
                metadata
             ) VALUES (?, 'Developer App', 'pk', 'unused-client-hash', ?, 1,
                unixepoch(), unixepoch(), ?)`,
        ).bind(
            clientKeyId,
            developerId,
            JSON.stringify({
                keyType: "publishable",
                createdVia: "api",
                earningsEnabled: true,
            }),
        ),
        env.DB.prepare(
            `UPDATE apikey SET byop_client_key_id = ? WHERE id = ?`,
        ).bind(clientKeyId, auth.apiKey.id),
        env.DB.prepare(
            `UPDATE user SET tier_balance = 10, pack_balance = 0 WHERE id = ?`,
        ).bind(auth.user.id),
    ]);

    const result = await service().authorize(
        budgetedApiKey.key,
        authorization("request-1", 1),
    );
    expect(result).toMatchObject({
        ok: true,
        identity: {
            apiKey: {
                clientId: clientKeyId,
                clientName: "Developer App",
                clientUserId: developerId,
                createdVia: "redirect-auth",
            },
        },
        grant: { reservedPrice: 1.25 },
    });
    if (!result.ok) throw new Error("Expected authorization to succeed");

    const settlement = await service().settle(result.grant.id, [
        event("credited-event", 1, {
            communityReward: {
                userId: communityOwnerId,
                rewardRate: 0.5,
            },
            telemetry: {
                eventType: "generate.text",
                isBilledUsage: false,
                startTime: "2026-08-24T00:00:00.000Z",
                duration: 100,
                model: "test-model",
                producerDetail: "preserved",
            },
        }),
    ]);
    expect(settlement).toMatchObject({
        ok: true,
        events: [{ status: "settled", billedPrice: 1.25 }],
    });

    const credited = await env.DB.prepare(
        `SELECT id, tier_balance AS tier FROM user WHERE id IN (?, ?, ?)`,
    )
        .bind(auth.user.id, developerId, communityOwnerId)
        .all<{ id: string; tier: number }>();
    const tiers = Object.fromEntries(
        credited.results.map(({ id, tier }) => [id, tier]),
    );
    expect(tiers).toEqual({
        [developerId]: 0.25,
        [communityOwnerId]: 0.5,
        [auth.user.id]: 8.75,
    });
    const receipt = await env.DB.prepare(
        `SELECT telemetry_json AS telemetryJson, settled_at AS settledAt
         FROM billable_event WHERE authorization_id = ? AND id = ?`,
    )
        .bind(result.grant.id, "credited-event")
        .first<{ telemetryJson: string; settledAt: number }>();
    expect(receipt?.settledAt).toBeTypeOf("number");
    expect(JSON.parse(receipt?.telemetryJson ?? "{}")).toMatchObject({
        id: `${result.grant.id}:credited-event`,
        eventType: "test.generation",
        isBilledUsage: true,
        requestId: "request-1",
        userId: auth.user.id,
        apiKeyId: auth.apiKey.id,
        apiKeyCreatedForApp: "Developer App",
        apiKeyCreatedForUserId: developerId,
        totalPrice: 1.25,
        devPrice: 1,
        markupRate: 0.25,
        communityModelRewardUserId: communityOwnerId,
        communityModelRewardRate: 0.5,
        communityModelRewardAmount: 0.5,
        producerDetail: "preserved",
    });
});

test("conflicting reuse of a grant-scoped event id does not charge again", async ({
    budgetedApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
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
        user: { tier: 8, pack: 10 },
        key: { budget: 98 },
    });
    await service().cancel(grantId);
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 10, pack: 10 },
        key: { budget: 100 },
    });
});

test("cancelling unused work releases wallet and key reservations", async ({
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
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 7, pack: 10 },
        key: { budget: 97 },
    });

    await expect(service().cancel(grantId)).resolves.toEqual({
        cancelled: true,
    });
    await expect(service().cancel(grantId)).resolves.toEqual({
        cancelled: false,
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 10, pack: 10 },
        key: { budget: 100 },
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

test("maintenance expires open grants through the atomic cancellation path", async ({
    budgetedApiKey,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 0 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("expiring-request", 3),
    );
    const now = Date.now();
    await env.DB.prepare(
        "UPDATE billing_authorization SET expires_at = ? WHERE id = ?",
    )
        .bind(now - 1, grantId)
        .run();

    await expect(runBillingMaintenance(env, now)).resolves.toMatchObject({
        expiredAuthorizations: 1,
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual({
        user: { tier: 10, pack: 0 },
        key: { budget: 100 },
    });
    const grant = await env.DB.prepare(
        `SELECT cancelled_at AS cancelledAt FROM billing_authorization WHERE id = ?`,
    )
        .bind(grantId)
        .first<{ cancelledAt: number }>();
    expect(grant?.cancelledAt).toBe(now);
    await expect(
        service().settle(grantId, [
            event("expired-event", 3, { requestId: "expiring-request" }),
        ]),
    ).resolves.toMatchObject({
        events: [{ status: "rejected" }],
    });
});

test("maintenance bounds the closed ledger while retaining pending auto top-ups", async ({
    budgetedApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const auth = await authenticate(budgetedApiKey.key);
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 0 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("prunable-request", 1),
    );
    await service().settle(grantId, [
        event("prunable-event", 1, { requestId: "prunable-request" }),
    ]);
    const now = Date.now();
    await env.DB.batch([
        env.DB.prepare(
            `UPDATE billing_authorization
             SET expires_at = ?
             WHERE id = ?`,
        ).bind(now - BILLING_AUTHORIZATION_TTL_MS - 1, grantId),
        env.DB.prepare(
            `UPDATE billable_event
             SET auto_top_up_required = 1,
                 auto_top_up_processed_at = NULL,
                 auto_top_up_next_attempt_at = ?
             WHERE authorization_id = ?`,
        ).bind(now + 1, grantId),
    ]);

    await expect(runBillingMaintenance(env, now)).resolves.toMatchObject({
        prunedAuthorizations: 0,
    });
    expect(
        await env.DB.prepare(
            "SELECT id FROM billing_authorization WHERE id = ?",
        )
            .bind(grantId)
            .first(),
    ).not.toBeNull();

    await env.DB.prepare(
        `UPDATE billable_event
         SET auto_top_up_processed_at = ?
         WHERE authorization_id = ?`,
    )
        .bind(now, grantId)
        .run();
    await expect(runBillingMaintenance(env, now)).resolves.toMatchObject({
        prunedAuthorizations: 1,
    });
    expect(
        await env.DB.prepare(
            `SELECT COUNT(*) AS count FROM billing_authorization
             WHERE id = ?`,
        )
            .bind(grantId)
            .first<{ count: number }>(),
    ).toEqual({ count: 0 });
    expect(
        await env.DB.prepare(
            `SELECT COUNT(*) AS count FROM billable_event
             WHERE authorization_id = ?`,
        )
            .bind(grantId)
            .first<{ count: number }>(),
    ).toEqual({ count: 0 });
});

test("maintenance prunes more than the request-processing batch size", async ({
    budgetedApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("prune-throughput", 0),
    );
    await service().settle(grantId, [
        event("prune-throughput-event", 0, {
            requestId: "prune-throughput",
        }),
    ]);
    const now = Date.now();
    const cutoff = now - BILLING_AUTHORIZATION_TTL_MS - 1;
    await env.DB.prepare(
        `UPDATE billing_authorization SET expires_at = ? WHERE id = ?`,
    )
        .bind(cutoff, grantId)
        .run();
    await env.DB.prepare(
        `WITH RECURSIVE sequence(n) AS (
             SELECT 1
             UNION ALL
             SELECT n + 1 FROM sequence WHERE n < 74
         )
         INSERT INTO billing_authorization (
             id, producer, request_id, model, api_key_id, api_key_name,
             api_key_type, api_key_created_via, api_key_client_name,
             api_key_client_user_id, user_id, user_tier, parent_request_id,
             estimated_price, reserved_price, reserved_bucket,
             settlement_bucket, actual_price, paid_only, byop_client_key_id,
             dev_user_id, markup_rate, key_budget_limited,
             reservation_applied, settled_at, cancelled_at, expires_at,
             created_at
         )
         SELECT
             id || '-' || n, producer, request_id || '-' || n, model,
             api_key_id, api_key_name, api_key_type, api_key_created_via,
             api_key_client_name, api_key_client_user_id, user_id, user_tier,
             parent_request_id, estimated_price, reserved_price,
             reserved_bucket, settlement_bucket, actual_price, paid_only,
             byop_client_key_id, dev_user_id, markup_rate,
             key_budget_limited, reservation_applied, settled_at,
             cancelled_at, expires_at, created_at
         FROM billing_authorization, sequence
         WHERE id = ?`,
    )
        .bind(grantId)
        .run();

    await expect(runBillingMaintenance(env, now)).resolves.toMatchObject({
        prunedAuthorizations: 75,
    });
});

test("settlement emits one derived Tinybird write after the ledger commit", async ({
    budgetedApiKey,
    mocks,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await mocks.enable("tinybird");
    await env.DB.prepare(
        "UPDATE user SET tier_balance = 10, pack_balance = 0 WHERE id = ?",
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 1),
    );
    const firstCtx = createExecutionContext();
    await service(firstCtx).settle(grantId, [
        event("billing-event", 1, {
            telemetry: {
                eventType: "generate.image",
                startTime: "2026-08-24T00:00:00.000Z",
                duration: 321,
                model: "flux",
                customPayload: { retained: true },
            },
        }),
    ]);
    await waitOnExecutionContext(firstCtx);

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        id: `${grantId}:billing-event`,
        userId: auth.user.id,
        customPayload: { retained: true },
    });
    expect(fetch).toHaveBeenCalledWith(
        env.TINYBIRD_INGEST_URL,
        expect.objectContaining({ method: "POST" }),
    );

    const retryCtx = createExecutionContext();
    await service(retryCtx).settle(grantId, [
        event("billing-event", 1, {
            telemetry: {
                eventType: "generate.image",
                startTime: "2026-08-24T00:00:00.000Z",
                duration: 321,
                model: "flux",
                customPayload: { retained: true },
            },
        }),
    ]);
    await waitOnExecutionContext(retryCtx);
    expect(mocks.tinybird.state.events).toHaveLength(1);
});

test("settlement durably hands low paid balance to auto top-up", async ({
    budgetedApiKey,
    mocks,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await mocks.enable("tinybird");
    await env.DB.prepare(
        `UPDATE user
         SET tier_balance = 0,
             pack_balance = 0.5,
             auto_top_up_enabled = 1,
             auto_top_up_amount_usd = 10
         WHERE id = ?`,
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 0.5, { paidOnly: true }),
    );
    await service().settle(grantId, [
        event("auto-top-up-event", 0.5, { paidOnly: true }),
    ]);
    const pending = await env.DB.prepare(
        `SELECT auto_top_up_required AS required,
                auto_top_up_processed_at AS processedAt
         FROM billable_event WHERE authorization_id = ? AND id = ?`,
    )
        .bind(grantId, "auto-top-up-event")
        .first<{ required: number; processedAt: number | null }>();
    expect(pending).toEqual({ required: 1, processedAt: null });

    const now = Date.now();
    await expect(runBillingMaintenance(env, now)).resolves.toMatchObject({
        autoTopUpsProcessed: 1,
    });
    const handedOff = await env.DB.prepare(
        `SELECT auto_top_up_processed_at AS processedAt,
                auto_top_up_attempts AS attempts,
                auto_top_up_error AS error
         FROM billable_event WHERE authorization_id = ? AND id = ?`,
    )
        .bind(grantId, "auto-top-up-event")
        .first<{
            processedAt: number;
            attempts: number;
            error: string | null;
        }>();
    expect(handedOff).toEqual({ processedAt: now, attempts: 1, error: null });
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS reason
         FROM stripe_auto_top_up_attempt WHERE user_id = ?`,
    )
        .bind(auth.user.id)
        .first<{ status: string; reason: string }>();
    expect(attempt).toEqual({
        status: "failed",
        reason: "missing Stripe customer",
    });

    await expect(runBillingMaintenance(env, now + 1)).resolves.toMatchObject({
        autoTopUpsProcessed: 0,
    });
});

test("multi-event settlement uses the authorization's reserved bucket", async ({
    budgetedApiKey,
    mocks,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await mocks.enable("tinybird");
    await env.DB.prepare(
        `UPDATE user
         SET tier_balance = 1,
             pack_balance = 3,
             auto_top_up_enabled = 1,
             auto_top_up_amount_usd = 10
         WHERE id = ?`,
    )
        .bind(auth.user.id)
        .run();
    const grantId = await authorize(
        budgetedApiKey.key,
        authorization("request-1", 3),
    );

    await service().settle(grantId, [
        event("paid-event", 2),
        event("tier-event", 1),
    ]);

    const { results } = await env.DB.prepare(
        `SELECT id, payer_bucket AS payerBucket,
                auto_top_up_required AS autoTopUpRequired
         FROM billable_event
         WHERE authorization_id = ?
         ORDER BY id`,
    )
        .bind(grantId)
        .all<{
            id: string;
            payerBucket: string;
            autoTopUpRequired: number;
        }>();
    expect(results).toEqual([
        {
            id: "paid-event",
            payerBucket: "pack",
            autoTopUpRequired: 0,
        },
        {
            id: "tier-event",
            payerBucket: "pack",
            autoTopUpRequired: 1,
        },
    ]);
    expect((await balances(auth.user.id, auth.apiKey.id)).user).toEqual({
        tier: 1,
        pack: 0,
    });
});

test("equal totals use the same bucket when split into reordered events", async ({
    budgetedApiKey,
    mocks,
}) => {
    const auth = await authenticate(budgetedApiKey.key);
    await mocks.enable("tinybird");
    const resetBalances = () =>
        env.DB.batch([
            env.DB.prepare(
                "UPDATE user SET tier_balance = 1, pack_balance = 3 WHERE id = ?",
            ).bind(auth.user.id),
            env.DB.prepare(
                "UPDATE apikey SET pollen_balance = 100 WHERE id = ?",
            ).bind(auth.apiKey.id),
        ]);

    await resetBalances();
    const single = await authorize(
        budgetedApiKey.key,
        authorization("single-total", 3),
    );
    const singleResult = await service().settle(single, [
        event("single-event", 3, { requestId: "single-total" }),
    ]);
    expect(singleResult).toMatchObject({
        events: [{ payerBucket: "pack", billedPrice: 3 }],
    });
    const singleBalances = await balances(auth.user.id, auth.apiKey.id);

    await resetBalances();
    const split = await authorize(
        budgetedApiKey.key,
        authorization("split-total", 3),
    );
    const splitResult = await service().settle(split, [
        event("split-small", 1, { requestId: "split-total" }),
        event("split-large", 2, { requestId: "split-total" }),
    ]);
    expect(splitResult).toMatchObject({
        events: [
            { payerBucket: "pack", billedPrice: 1 },
            { payerBucket: "pack", billedPrice: 2 },
        ],
    });
    expect(await balances(auth.user.id, auth.apiKey.id)).toEqual(
        singleBalances,
    );
});
