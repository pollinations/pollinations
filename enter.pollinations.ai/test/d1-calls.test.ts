import { SELF } from "cloudflare:test";
import { afterEach, expect, vi } from "vitest";
import { test } from "./fixtures.ts";

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

test("records an Enter request's D1 calls named by route", async ({
    accountToken,
}) => {
    // The isolate sends at most every 10 s: be past the fixtures' send.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 60_000 });
    const batches: Record<string, unknown>[][] = [];
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.searchParams.get("name") !== "d1_call_event") {
            return realFetch(input, init);
        }
        batches.push(
            String(init?.body)
                .split("\n")
                .map((line) => JSON.parse(line)),
        );
        return new Response("{}");
    });

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/profile",
        { headers: { Authorization: `Bearer ${accountToken}` } },
    );
    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    // The isolate's one request also carries what the fixtures left behind.
    const profile = batches[0].filter(
        (row) => row.route_path === "/api/account/profile",
    );
    expect(profile.length).toBeGreaterThan(0);
    for (const row of profile) {
        expect(row).toMatchObject({
            service: "enter",
            method: "GET",
            error_code: "",
            query_id: expect.any(String),
            calls: expect.any(Number),
        });
    }
    // Placeholders only: the caller's key never reaches telemetry.
    expect(JSON.stringify(batches)).not.toContain(accountToken);
});
