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
import { McpBilling } from "../src/services/mcp-billing.ts";
import { test } from "./fixtures.ts";

function billingService() {
    const ctx = createExecutionContext();
    return { ctx, service: new McpBilling(ctx, env) };
}

function ffmpegCharge(
    durationMs: number,
    overrides: Partial<Parameters<McpBilling["charge"]>[1]> = {},
): Parameters<McpBilling["charge"]>[1] {
    const amount = calculateFfmpegCharge(durationMs);
    return {
        requestId: crypto.randomUUID(),
        mcpId: "ffmpeg",
        toolName: "runFfmpeg",
        provider: "cloudflare",
        eventType: "tool.media",
        startedAt: Date.now() - durationMs,
        durationMs,
        responseStatus: 200,
        amount,
        adjustment: {
            id: "cloudflare.container.basic_runtime.v1",
            units: durationMs / 1000,
        },
        ...overrides,
    };
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

    const result = await service.charge(exhausted.key, ffmpegCharge(1_000));
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
    const result = await service.charge(
        budgetedApiKey.key,
        ffmpegCharge(1_000, { requestId }),
    );
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

    const result = await service.charge(
        budgetedApiKey.key,
        ffmpegCharge(500, {
            requestId,
            responseStatus: 422,
            errorMessage: "bad filter",
        }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.charge).toBeCloseTo(calculateFfmpegCharge(500), 12);
    await waitOnExecutionContext(ctx);
    expect(mocks.tinybird.state.events).toContainEqual(
        expect.objectContaining({
            requestId,
            responseStatus: 422,
            errorResponseCode: "422",
            errorSource: "ffmpeg.runFfmpeg",
            errorMessage: "bad filter",
            isBilledUsage: true,
        }),
    );
});
