import { SELF } from "cloudflare:test";
import { afterEach, expect, vi } from "vitest";
import { test } from "./fixtures.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

test("records an Enter request's D1 calls in one batch named by route", async ({
    accountToken,
}) => {
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
    expect(batches[0].length).toBeGreaterThan(0);
    for (const row of batches[0]) {
        expect(row).toMatchObject({
            service: "enter",
            route_path: "/api/account/profile",
            method: "GET",
            error_code: "",
            sql: expect.any(String),
        });
    }
    // Placeholders only: the caller's key never reaches telemetry.
    expect(JSON.stringify(batches)).not.toContain(accountToken);
});
