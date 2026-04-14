import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import { test } from "./fixtures.ts";
import type { MockTinybirdState } from "./mocks/tinybird.ts";

type MockTinybirdEvent = MockTinybirdState["events"][number];

async function getTestUserId(): Promise<string> {
    const db = drizzle(env.DB);
    const users = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);
    const user = users[0];
    if (!user) {
        throw new Error("Test user not found");
    }
    return user.id;
}

function createUsageEvent(
    userId: string,
    options: {
        id: string;
        startTime: string;
        apiKeyName: string;
        model?: string;
        meterSource?: string;
        totalPrice?: number;
    },
): MockTinybirdEvent {
    const model = options.model ?? "openai-fast";
    const meterSource = options.meterSource ?? "tier";
    const totalPrice = options.totalPrice ?? 1;

    return {
        id: options.id,
        requestId: `request-${options.id}`,
        requestPath: "/api/generate/v1/chat/completions",
        startTime: options.startTime,
        endTime: options.startTime,
        responseTime: 123,
        responseStatus: 200,
        environment: "test",
        eventType: "generate.text",
        userId,
        userTier: "seed",
        userGithubId: "12345",
        userGithubUsername: "test-user",
        apiKeyId: `key-${options.apiKeyName}`,
        apiKeyName: options.apiKeyName,
        apiKeyType: "secret",
        apiKeyCreatedVia: "dashboard",
        apiKeyCreatedForApp: "",
        apiKeyCreatedForUserId: userId,
        selectedMeterId: meterSource,
        selectedMeterSlug: `user:${meterSource}`,
        balances: {},
        referrerUrl: "https://example.com",
        referrerDomain: "example.com",
        modelRequested: model,
        resolvedModelRequested: model,
        modelUsed: model,
        modelProviderUsed: "openai",
        isBilledUsage: true,
        tokenPricePromptText: 0,
        tokenPricePromptCached: 0,
        tokenPricePromptAudio: 0,
        tokenPricePromptImage: 0,
        tokenPriceCompletionText: 0,
        tokenPriceCompletionReasoning: 0,
        tokenPriceCompletionAudio: 0,
        tokenPriceCompletionImage: 0,
        tokenCountPromptText: 10,
        tokenCountPromptAudio: 0,
        tokenCountPromptCached: 0,
        tokenCountPromptImage: 0,
        tokenCountCompletionText: 20,
        tokenCountCompletionReasoning: 0,
        tokenCountCompletionAudio: 0,
        tokenCountCompletionImage: 0,
        totalCost: totalPrice,
        totalPrice,
        moderationPromptHateSeverity: "safe",
        moderationPromptSelfHarmSeverity: "safe",
        moderationPromptSexualSeverity: "safe",
        moderationPromptViolenceSeverity: "safe",
        moderationPromptJailbreakDetected: false,
        moderationCompletionHateSeverity: "safe",
        moderationCompletionSelfHarmSeverity: "safe",
        moderationCompletionSexualSeverity: "safe",
        moderationCompletionViolenceSeverity: "safe",
        moderationCompletionProtectedMaterialCodeDetected: false,
        moderationCompletionProtectedMaterialTextDetected: false,
        cacheHit: false,
        cacheType: "none",
        cacheSemanticSimilarity: null,
        cacheSemanticThreshold: null,
        cacheKey: "",
        errorResponseCode: "undefined",
        errorSource: "undefined",
        errorMessage: "",
        errorStack: "",
        errorDetails: "",
        ipSubnet: "127.0.0.0/24",
        ipHash: "hash",
    } as MockTinybirdEvent;
}

test("GET /api/account/usage/daily uses exact API key granularity and respects days", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const userId = await getTestUserId();

    mocks.tinybird.state.events.push(
        createUsageEvent(userId, {
            id: "event-a1",
            startTime: "2026-04-14T10:00:00.000Z",
            apiKeyName: "alpha",
            totalPrice: 2,
        }),
        createUsageEvent(userId, {
            id: "event-a2",
            startTime: "2026-04-14T11:00:00.000Z",
            apiKeyName: "alpha",
            totalPrice: 3,
        }),
        createUsageEvent(userId, {
            id: "event-b1",
            startTime: "2026-04-14T12:00:00.000Z",
            apiKeyName: "beta",
            totalPrice: 5,
        }),
        createUsageEvent(userId, {
            id: "event-old",
            startTime: "2025-12-01T12:00:00.000Z",
            apiKeyName: "alpha",
            totalPrice: 8,
        }),
    );

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?days=30&granularity=api_key",
        {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        usage: Array<{
            date: string;
            requests: number;
            cost_usd: number;
            api_key_names?: string[];
        }>;
    };

    expect(data.usage).toHaveLength(2);
    expect(data.usage).toEqual([
        expect.objectContaining({
            date: "2026-04-14",
            requests: 2,
            cost_usd: 5,
            api_key_names: ["alpha"],
        }),
        expect.objectContaining({
            date: "2026-04-14",
            requests: 1,
            cost_usd: 5,
            api_key_names: ["beta"],
        }),
    ]);
});

test("GET /api/account/usage CSV export is capped to the latest 50k rows", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const userId = await getTestUserId();

    const sameTimestamp = "2026-04-14T12:10:00.000Z";
    mocks.tinybird.state.events.push(
        createUsageEvent(userId, {
            id: "event-000000",
            startTime: sameTimestamp,
            apiKeyName: "truncated-oldest-row",
            totalPrice: 1,
        }),
    );

    for (let index = 1; index <= 50_000; index += 1) {
        mocks.tinybird.state.events.push(
            createUsageEvent(userId, {
                id: `event-${String(index).padStart(6, "0")}`,
                startTime: sameTimestamp,
                apiKeyName: "alpha",
                totalPrice: 1,
            }),
        );
    }

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/usage?format=csv&days=30&limit=50000",
        {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain(
        "latest-50000-rows-30d",
    );

    const csv = await response.text();
    const lines = csv.trim().split("\n");

    expect(lines).toHaveLength(50_001);
    expect(lines[0]).toContain("timestamp,type,model");
    expect(lines[1]).toContain("2026-04-14 12:10:00");
    expect(csv).not.toContain("truncated-oldest-row");
    expect(csv).toContain("alpha");
});
