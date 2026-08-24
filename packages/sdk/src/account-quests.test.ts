import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pollinations } from "./client.js";
import { resetClient } from "./helpers.js";

function makeResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

function newClient() {
    return new Pollinations({
        apiKey: "test-key",
        baseUrl: "https://example.test",
    });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    resetClient();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("accountQuests", () => {
    it("requests GET /account/quests and returns the response as-is", async () => {
        const payload = {
            quests: [
                {
                    id: "use_text_model",
                    title: "Use a text model",
                    description: "Make one successful text request.",
                    category: "setup",
                    state: "completed",
                    status: "completed",
                    rewardAmount: 0.25,
                    balanceBucket: "tier",
                    url: null,
                    reward: {
                        id: "reward-1",
                        questId: "use_text_model",
                        title: "Use a text model",
                        pollenAmount: 0.25,
                        balanceBucket: "tier",
                        earnedAt: "2026-08-24T00:00:00.000Z",
                        claimedAt: null,
                    },
                },
                {
                    id: "app_users_10",
                    title: "Your app is gaining users",
                    description: "Ten external users connect.",
                    category: "grow",
                    state: "available",
                    status: "open",
                    rewardAmount: 15,
                    balanceBucket: "tier",
                    url: null,
                    reward: null,
                },
            ],
        };
        fetchMock.mockResolvedValue(makeResponse(payload));

        const client = newClient();
        const result = await client.accountQuests();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe("https://example.test/account/quests");
        expect(result).toEqual(payload);
        expect(result.quests[0].status).toBe("completed");
        expect(result.quests[1].reward).toBeNull();
    });

    it("propagates API errors as PollinationsError", async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ error: { message: "nope" } }), {
                status: 403,
                headers: { "content-type": "application/json" },
            }),
        );

        const client = newClient();
        await expect(client.accountQuests()).rejects.toMatchObject({
            name: "PollinationsError",
            status: 403,
        });
    });
});
