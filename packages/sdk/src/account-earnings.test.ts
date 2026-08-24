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

const earningsRow = {
    date: "2026-08-23",
    entity_id: "pk_test",
    entity_name: "storyforge",
    source: "byop_markup",
    requests: 4,
    paid_requests: 1,
    tier_requests: 3,
    baseline_price: 2,
    pollen_earned: 0.5,
    paid_earned: 0.125,
    tier_earned: 0.375,
    cost_usd: 0.02,
    reward_rate: 0.25,
};

describe("accountEarnings", () => {
    it("requests GET /account/earnings and returns the response as-is", async () => {
        const payload = { daily: [earningsRow], perEntity: [earningsRow] };
        fetchMock.mockResolvedValue(makeResponse(payload));

        const client = newClient();
        const result = await client.accountEarnings({ days: 30 });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(
            "https://example.test/account/earnings?days=30",
        );
        expect(result).toEqual(payload);
        expect(result.perEntity[0].entity_name).toBe("storyforge");
    });

    it("passes time-window query options through", async () => {
        fetchMock.mockResolvedValue(
            makeResponse({ daily: [], perEntity: [] }),
        );

        const client = newClient();
        await client.accountEarnings({
            days: 7,
            granularity: "week",
            period: "2026-W34",
        });

        const [url] = fetchMock.mock.calls[0];
        const params = new URL(String(url)).searchParams;
        expect(params.get("days")).toBe("7");
        expect(params.get("granularity")).toBe("week");
        expect(params.get("period")).toBe("2026-W34");
    });
});
