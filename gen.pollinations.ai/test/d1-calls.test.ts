import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { withD1Calls } from "@shared/d1-calls.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only deployed environments record, in 10 s batches; the clock is ours, so
// no test waits for one.
const production = { ...env, ENVIRONMENT: "production" };
const clock = Date.UTC(2026, 10, 23, 13, 2, 6);
const second = (ms: number) =>
    new Date(ms).toISOString().slice(0, 19).replace("T", " ");
beforeEach(() => {
    vi.useFakeTimers({ now: clock });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

type Rows = Record<string, unknown>[];

// Each ingest is one NDJSON request; returns the rows sent per datasource.
function captureIngest(queryStatus = 200) {
    const sent = { calls: [] as Rows[], queries: [] as Rows[] };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const rows = String(init?.body)
            .split("\n")
            .map((line) => JSON.parse(line));
        const name = url.searchParams.get("name");
        if (name === "d1_call_event") sent.calls.push(rows);
        if (name !== "d1_query") return new Response("{}");
        sent.queries.push(rows);
        const status = sent.queries.length === 1 ? queryStatus : 200;
        return new Response("{}", { status });
    });
    return sent;
}

// Runs `fn` as one request, without waiting for the batch to be sent.
async function request<T>(
    fn: (db: D1Database) => Promise<T>,
    route_path = "/image/:prompt",
) {
    const ctx = createExecutionContext();
    const result = withD1Calls(
        "gen",
        production,
        ctx,
        () => ({ route_path, method: "GET" }),
        () => fn(env.DB),
    );
    await result.catch(() => {});
    return { ctx, result };
}

// The same, through the 10 s until its batch is sent.
async function run<T>(fn: (db: D1Database) => Promise<T>) {
    const { ctx, result } = await request(fn);
    await vi.advanceTimersByTimeAsync(10_000);
    await waitOnExecutionContext(ctx);
    return result;
}

describe("D1 call timing", () => {
    it("passes results through and sums a second's calls per query", async () => {
        const sent = captureIngest();
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

        expect(sent.queries).toEqual([
            [
                {
                    query_id: expect.stringMatching(/^[0-9a-f]{8}$/),
                    service: "gen",
                    sql: "SELECT ? AS value",
                },
            ],
        ]);
        expect(sent.calls).toEqual([
            [
                {
                    timestamp: second(clock),
                    service: "gen",
                    environment: "production",
                    route_path: "/image/:prompt",
                    method: "GET",
                    query_id: sent.queries[0][0].query_id,
                    error_code: "",
                    calls: 4,
                    // all() and batch() report D1's figures.
                    measured: 2,
                    total_ms: 0,
                    max_ms: 0,
                    sql_ms: expect.any(Number),
                    rows_read: expect.any(Number),
                    rows_written: 0,
                },
            ],
        ]);
    });

    it("records a failed call with its SQL but no bound values", async () => {
        const sent = captureIngest();
        await expect(
            run((db) =>
                db
                    .prepare("SELECT * FROM missing_table WHERE prompt = ?")
                    .bind("a secret prompt")
                    .all(),
            ),
        ).rejects.toThrow("missing_table");

        expect(sent.queries[0]).toEqual([
            expect.objectContaining({
                sql: "SELECT * FROM missing_table WHERE prompt = ?",
            }),
        ]);
        expect(sent.calls[0]).toEqual([
            expect.objectContaining({ error_code: "D1_FAILED", calls: 1 }),
        ]);
        expect(JSON.stringify(sent)).not.toContain("secret");
        expect(JSON.stringify(sent)).not.toContain("D1_ERROR");
    });

    it("counts placeholder lists of any length as one query", async () => {
        const sent = captureIngest();
        await run(async (db) => {
            await db.prepare("SELECT 1 WHERE 1 IN (?, ?)").bind(1, 2).all();
            await db
                .prepare("SELECT 1 WHERE 1 IN (?, ?, ?)")
                .bind(1, 2, 3)
                .all();
        });
        expect(sent.queries[0]).toEqual([
            expect.objectContaining({ sql: "SELECT 1 WHERE 1 IN (?, ...)" }),
        ]);
        expect(sent.calls[0]).toEqual([expect.objectContaining({ calls: 2 })]);
    });

    it("marks sums D1 gave no figures for, so they do not read as zero", async () => {
        const sent = captureIngest();
        await run((db) => db.prepare("SELECT 'unmeasured' AS value").raw());
        expect(sent.calls[0]).toEqual([
            expect.objectContaining({ calls: 1, measured: 0 }),
        ]);
    });

    it("sends one batch 10 s after its first call, with no later request", async () => {
        const sent = captureIngest();
        const query = (db: D1Database) =>
            db.prepare("SELECT 'batched' AS value").all();
        const first = await request(query);

        await vi.advanceTimersByTimeAsync(3_000);
        await request(query);
        // Post-response work rides along too.
        const late = createExecutionContext();
        withD1Calls(
            "gen",
            production,
            late,
            () => ({ route_path: "generation", method: "GET" }),
            () => late.waitUntil(query(env.DB)),
        );
        await vi.advanceTimersByTimeAsync(6_000);
        expect(sent.calls).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(1_000);
        await waitOnExecutionContext(first.ctx);
        expect(sent.calls).toHaveLength(1);
        expect(
            sent.calls[0].map((row) => [
                row.timestamp,
                row.route_path,
                row.calls,
            ]),
        ).toEqual([
            [second(clock), "/image/:prompt", 1],
            [second(clock + 3_000), "/image/:prompt", 1],
            [second(clock + 3_000), "generation", 1],
        ]);
    });

    it("records nothing outside the deployed environments", async () => {
        const sent = captureIngest();
        const ctx = createExecutionContext();
        await withD1Calls(
            "gen",
            env,
            ctx,
            () => ({ route_path: "/image/:prompt", method: "GET" }),
            () => env.DB.prepare("SELECT 'local' AS value").all(),
        );
        await vi.advanceTimersByTimeAsync(10_000);
        await waitOnExecutionContext(ctx);
        expect(sent.calls).toHaveLength(0);
    });

    it("sends a statement again when Tinybird did not take it", async () => {
        const sent = captureIngest(503);
        const query = (db: D1Database) =>
            db.prepare("SELECT 'retried' AS value").all();
        await run(query);
        await run(query);
        expect(sent.queries).toHaveLength(2);
        expect(sent.queries[1]).toEqual(sent.queries[0]);
        expect(sent.queries[0]).toEqual([
            expect.objectContaining({ sql: "SELECT 'retried' AS value" }),
        ]);
    });
});
