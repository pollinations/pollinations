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

    // only fields the mock reads — cast to satisfy type
    return {
        id: options.id,
        startTime: options.startTime,
        endTime: options.startTime,
        responseTime: 123,
        eventType: "generate.text",
        userId,
        apiKeyName: options.apiKeyName,
        apiKeyType: "secret",
        selectedMeterSlug: `user:${meterSource}`,
        modelUsed: model,
        resolvedModelRequested: model,
        tokenCountPromptText: 10,
        tokenCountPromptCached: 0,
        tokenCountPromptAudio: 0,
        tokenCountPromptImage: 0,
        tokenCountCompletionText: 20,
        tokenCountCompletionReasoning: 0,
        tokenCountCompletionAudio: 0,
        tokenCountCompletionImage: 0,
        totalPrice,
    } as unknown as MockTinybirdEvent;
}

test("GET /api/account/usage/daily filters by api_key_name and respects days", async ({
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

    const unfiltered = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?days=30",
        {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(unfiltered.status).toBe(200);
    const unfilteredData = (await unfiltered.json()) as {
        usage: Array<{
            date: string;
            requests: number;
            cost_usd: number;
        }>;
    };
    expect(unfilteredData.usage).toEqual([
        expect.objectContaining({
            date: "2026-04-14",
            requests: 3,
            cost_usd: 10,
        }),
    ]);

    const filtered = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?days=30&api_key_name=alpha",
        {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(filtered.status).toBe(200);
    const filteredData = (await filtered.json()) as {
        usage: Array<{
            date: string;
            requests: number;
            cost_usd: number;
        }>;
    };
    expect(filteredData.usage).toEqual([
        expect.objectContaining({
            date: "2026-04-14",
            requests: 2,
            cost_usd: 5,
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
