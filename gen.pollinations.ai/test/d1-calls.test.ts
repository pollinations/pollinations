import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { withD1Calls } from "@shared/d1-calls.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detachedContext } from "../src/utils/execute-generation.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

// Each D1 call ingest is one NDJSON request; returns them as row arrays.
function captureD1Batches(delayMs = 0) {
    const batches: Record<string, unknown>[][] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.searchParams.get("name") === "d1_call_event") {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            batches.push(
                String(init?.body)
                    .split("\n")
                    .map((line) => JSON.parse(line)),
            );
        }
        return new Response("{}");
    });
    return batches;
}

async function run<T>(fn: (db: D1Database) => Promise<T>) {
    const ctx = createExecutionContext();
    const result = withD1Calls(
        "gen",
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
    it("passes results through and sends every call in one request", async () => {
        const batches = captureD1Batches();
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
        expect(batches).toHaveLength(1);
        expect(batches[0].map((row) => [row.sql, row.statements])).toEqual([
            ["SELECT ? AS value", 1],
            ["SELECT ? AS value", 1],
            ["SELECT ? AS value", 1],
            ["SELECT ? AS value;\nSELECT ? AS value", 2],
        ]);
        expect(batches[0][1]).toMatchObject({
            service: "gen",
            route_path: "/image/:prompt",
            method: "GET",
            error_code: "",
            rows_read: expect.any(Number),
            sql_duration_ms: expect.any(Number),
        });
    });

    it("records a failed call with its SQL but no bound values", async () => {
        const batches = captureD1Batches();
        await expect(
            run((db) =>
                db
                    .prepare("SELECT * FROM missing_table WHERE prompt = ?")
                    .bind("a secret prompt")
                    .all(),
            ),
        ).rejects.toThrow("missing_table");

        expect(batches).toEqual([
            [
                expect.objectContaining({
                    service: "gen",
                    route_path: "/image/:prompt",
                    error_code: "D1_FAILED",
                    sql: "SELECT * FROM missing_table WHERE prompt = ?",
                }),
            ],
        ]);
        expect(JSON.stringify(batches)).not.toContain("secret");
        expect(JSON.stringify(batches)).not.toContain("D1_ERROR");
    });

    it("settles a coordinator job only after telemetry from billing that fails after the response", async () => {
        const batches = captureD1Batches(50);
        const { ctx, settled } = detachedContext();
        withD1Calls(
            "gen",
            env,
            ctx,
            () => ({ route_path: "generation", method: "GET" }),
            () => {
                // Post-response billing: its failing query registers the
                // telemetry send while settlement is already waiting.
                ctx.waitUntil(
                    env.DB.prepare("UPDATE missing_table SET balance = ?")
                        .bind(1)
                        .run()
                        .catch(() => {}),
                );
            },
        );
        await settled();
        expect(batches).toHaveLength(1);
        expect(batches[0][0]).toMatchObject({
            route_path: "generation",
            error_code: "D1_FAILED",
        });
    });
});
