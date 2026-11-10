import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withD1Calls } from "../src/d1-calls.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

function captureErrorEvents() {
    const events: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.searchParams.get("name") === "error_event") {
            events.push(JSON.parse(String(init?.body)));
        }
        return new Response("{}");
    });
    return events;
}

async function run<T>(fn: (db: D1Database) => Promise<T>) {
    const ctx = createExecutionContext();
    const result = withD1Calls(
        env,
        ctx,
        () => ({ route_path: "/image/:prompt", method: "GET" }),
        () => fn(env.DB),
    );
    await result.catch(() => {});
    await waitOnExecutionContext(ctx);
    return result;
}

describe("D1 call timing", () => {
    it("passes results through, including batches of wrapped statements", async () => {
        const events = captureErrorEvents();
        const [first, all, raw, batch] = await run(async (db) => {
            const stmt = db.prepare("SELECT ? AS value");
            return [
                await stmt.bind(1).first("value"),
                (await stmt.bind(2).all()).results,
                await stmt.bind(3).raw(),
                (await db.batch([stmt.bind(4), stmt.bind(5)])).map(
                    (r) => r.results,
                ),
            ];
        });
        expect(first).toBe(1);
        expect(all).toEqual([{ value: 2 }]);
        expect(raw).toEqual([[3]]);
        expect(batch).toEqual([[{ value: 4 }], [{ value: 5 }]]);
        expect(events).toEqual([]);
    });

    it("records a failed call with its SQL but no bound values", async () => {
        const events = captureErrorEvents();
        await expect(
            run((db) =>
                db
                    .prepare("SELECT * FROM missing_table WHERE prompt = ?")
                    .bind("a secret prompt")
                    .all(),
            ),
        ).rejects.toThrow("missing_table");

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            kind: "d1_call",
            severity: "error",
            route_path: "/image/:prompt",
            method: "GET",
            status: 0,
            error_code: "D1_FAILED",
            error_class: "D1Call",
            upstream_host: "d1",
            message: "SELECT * FROM missing_table WHERE prompt = ?",
        });
        expect(JSON.stringify(events[0])).not.toContain("secret");
        expect(JSON.stringify(events[0])).not.toContain("D1_ERROR");
    });
});
