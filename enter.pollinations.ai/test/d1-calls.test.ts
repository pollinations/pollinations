import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";
import { test } from "./fixtures.ts";

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

test("records an Enter request's D1 calls named by route", async ({
    accountToken,
}) => {
    const rows: Record<string, unknown>[] = [];
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const name = url.searchParams.get("name");
        if (name === "d1_query") return new Response("{}");
        if (name !== "d1_call_event") return realFetch(input, init);
        for (const line of String(init?.body).split("\n")) {
            rows.push(JSON.parse(line));
        }
        return new Response("{}");
    });
    // Only deployed environments record, in 10 s batches: skip the wait.
    vi.useFakeTimers({ toFake: ["setTimeout"] });

    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request("http://localhost:3000/api/account/profile", {
            headers: { Authorization: `Bearer ${accountToken}` },
        }),
        { ...env, ENVIRONMENT: "production" },
        ctx,
    );
    expect(response.status).toBe(200);
    expect(rows).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(10_000);
    await waitOnExecutionContext(ctx);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
        expect(row).toMatchObject({
            service: "enter",
            environment: "production",
            route_path: "/api/account/profile",
            method: "GET",
            error_code: "",
            query_id: expect.any(String),
            calls: expect.any(Number),
        });
    }
    // Placeholders only: the caller's key never reaches telemetry.
    expect(JSON.stringify(rows)).not.toContain(accountToken);
});
