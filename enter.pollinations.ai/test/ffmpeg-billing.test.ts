import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import {
    apikey as apiKeyTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { calculateFfmpegCharge } from "@shared/ffmpeg.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { FfmpegBilling } from "../src/services/ffmpeg-billing.ts";
import { test } from "./fixtures.ts";

function billingService() {
    const ctx = createExecutionContext();
    return { ctx, service: new FfmpegBilling(ctx, env) };
}

test("FFmpeg authorization does not preflight and settlement may go negative", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");
    const exhausted = await createTestApiKey({
        pollenBudget: 0,
        user: { tierBalance: 0, packBalance: 0 },
    });
    const { ctx, service } = billingService();

    await expect(service.authorize("invalid-key")).resolves.toMatchObject({
        ok: false,
        status: 401,
    });
    await expect(service.authorize(exhausted.key)).resolves.toEqual({
        ok: true,
    });

    const result = await service.settle(exhausted.key, {
        requestId: crypto.randomUUID(),
        startedAt: Date.now() - 1_000,
        runtimeMs: 1_000,
        responseStatus: 200,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    await waitOnExecutionContext(ctx);

    const db = drizzle(env.DB);
    const [user, key] = await Promise.all([
        db
            .select({ balance: userTable.tierBalance })
            .from(userTable)
            .where(eq(userTable.id, exhausted.userId))
            .then((rows) => rows[0]),
        db
            .select({ balance: apiKeyTable.pollenBalance })
            .from(apiKeyTable)
            .where(eq(apiKeyTable.id, exhausted.id))
            .then((rows) => rows[0]),
    ]);
    expect(user?.balance).toBe(-result.charge);
    expect(key?.balance).toBe(-result.charge);
});

test("FFmpeg billing settles measured Container runtime", async ({ mocks }) => {
    await mocks.enable("tinybird");
    const budgetedApiKey = await createTestApiKey({
        pollenBudget: 100,
        user: { tierBalance: 10, packBalance: 0 },
    });
    const db = drizzle(env.DB);

    const { ctx, service } = billingService();
    await expect(service.authorize(budgetedApiKey.key)).resolves.toEqual({
        ok: true,
    });

    const requestId = crypto.randomUUID();
    const result = await service.settle(budgetedApiKey.key, {
        requestId,
        startedAt: Date.now() - 1_000,
        runtimeMs: 1_000,
        responseStatus: 200,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    const charge = result.charge;
    const rawCost = calculateFfmpegCharge(1_000);

    await waitOnExecutionContext(ctx);
    const [user, key] = await Promise.all([
        db
            .select({ balance: userTable.tierBalance })
            .from(userTable)
            .where(eq(userTable.id, budgetedApiKey.userId))
            .then((rows) => rows[0]),
        db
            .select({ balance: apiKeyTable.pollenBalance })
            .from(apiKeyTable)
            .where(eq(apiKeyTable.id, budgetedApiKey.id))
            .then((rows) => rows[0]),
    ]);
    expect(user?.balance).toBe(10 - charge);
    expect(key?.balance).toBe(100 - charge);

    expect(mocks.tinybird.state.events).toContainEqual(
        expect.objectContaining({
            requestId,
            eventType: "tool.media",
            responseStatus: 200,
            modelUsed: "ffmpeg",
            modelProviderUsed: "cloudflare",
            isBilledUsage: true,
            totalCost: rawCost,
            totalPrice: charge,
            adjustmentCosts: {
                "cloudflare.container.basic_runtime.v1": rawCost,
            },
            adjustmentUnits: {
                "cloudflare.container.basic_runtime.v1": 1,
            },
        }),
    );
});

test("FFmpeg billing charges executed failures and records their error", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");
    const budgetedApiKey = await createTestApiKey({
        pollenBudget: 100,
        user: { tierBalance: 10, packBalance: 0 },
    });
    const { ctx, service } = billingService();
    const requestId = crypto.randomUUID();

    const result = await service.settle(budgetedApiKey.key, {
        requestId,
        startedAt: Date.now() - 500,
        runtimeMs: 500,
        responseStatus: 422,
        errorMessage: "bad filter",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.charge).toBeCloseTo(calculateFfmpegCharge(500), 12);
    await waitOnExecutionContext(ctx);
    expect(mocks.tinybird.state.events).toContainEqual(
        expect.objectContaining({
            requestId,
            responseStatus: 422,
            errorResponseCode: "422",
            errorSource: "ffmpeg",
            errorMessage: "bad filter",
            isBilledUsage: true,
        }),
    );
});
