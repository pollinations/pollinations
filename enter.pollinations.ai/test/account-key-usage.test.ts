import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import { test } from "./fixtures.ts";
import type { MockTinybirdState } from "./mocks/tinybird.ts";

type MockTinybirdEvent = MockTinybirdState["events"][number];

async function getTestUserId(): Promise<string> {
    const db = drizzle(env.DB);
    const [u] = await db.select({ id: userTable.id }).from(userTable).limit(1);
    if (!u) throw new Error("Test user not found");
    return u.id;
}

function makeEvent(
    userId: string,
    opts: { id: string; apiKeyId: string; totalPrice?: number },
): MockTinybirdEvent {
    const totalPrice = opts.totalPrice ?? 1;
    return {
        id: opts.id,
        requestId: `req-${opts.id}`,
        requestPath: "/api/generate/v1/chat/completions",
        startTime: "2026-04-19T12:00:00.000Z",
        endTime: "2026-04-19T12:00:00.000Z",
        responseTime: 100,
        responseStatus: 200,
        environment: "test",
        eventType: "generate.text",
        userId,
        userTier: "seed",
        userGithubId: "12345",
        userGithubUsername: "test-user",
        apiKeyId: opts.apiKeyId,
        apiKeyName: opts.apiKeyId,
        apiKeyType: "secret",
        apiKeyCreatedVia: "dashboard",
        apiKeyCreatedForApp: "",
        apiKeyCreatedForUserId: userId,
        selectedMeterId: "tier",
        selectedMeterSlug: "user:tier",
        balances: {},
        referrerUrl: "https://example.com",
        referrerDomain: "example.com",
        modelRequested: "openai-fast",
        resolvedModelRequested: "openai-fast",
        modelUsed: "openai-fast",
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

describe("GET /api/account/key/usage", () => {
    test("returns only the calling key's events (no scope needed)", async ({
        auth,
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");

        const created = await auth.apiKey.create({
            name: "my-key",
            fetchOptions: {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        });
        if (!created.data) throw new Error("Failed to create key");
        const myKeyId = created.data.id;
        const userId = await getTestUserId();

        mocks.tinybird.state.events.push(
            makeEvent(userId, { id: "mine-1", apiKeyId: myKeyId }),
            makeEvent(userId, { id: "mine-2", apiKeyId: myKeyId }),
            makeEvent(userId, { id: "other-1", apiKeyId: "some-other-key" }),
        );

        const res = await SELF.fetch(
            "http://localhost:3000/api/account/key/usage",
            { headers: { Authorization: `Bearer ${created.data.key}` } },
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            usage: Array<{ type: string }>;
            count: number;
        };
        expect(data.count).toBe(2);
    });

    test("returns 401 without an API key", async ({ sessionToken }) => {
        const res = await SELF.fetch(
            "http://localhost:3000/api/account/key/usage",
            {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );
        expect(res.status).toBe(401);
    });
});
