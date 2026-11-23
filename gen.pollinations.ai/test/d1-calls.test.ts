import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { withD1Calls } from "@shared/d1-calls.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The isolate sends at most every 10 s, so each test starts a minute after
// the previous one's send.
let clock = Date.now();
beforeEach(() => {
    clock += 60_000;
    vi.useFakeTimers({ toFake: ["Date"], now: clock });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

type Rows = Record<string, unknown>[];

// Each ingest is one NDJSON request; returns the rows sent per datasource.
function captureIngest() {
    const sent = { calls: [] as Rows[], queries: [] as Rows[] };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const rows = String(init?.body)
            .split("\n")
            .map((line) => JSON.parse(line));
        const name = url.searchParams.get("name");
        if (name === "d1_call_event") sent.calls.push(rows);
        if (name === "d1_query") sent.queries.push(rows);
        return new Response("{}");
    });
    return sent;
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
                    timestamp: new Date(clock)
                        .toISOString()
                        .slice(0, 19)
                        .replace("T", " "),
                    service: "gen",
                    environment: env.ENVIRONMENT,
                    route_path: "/image/:prompt",
                    method: "GET",
                    query_id: sent.queries[0][0].query_id,
                    error_code: "",
                    calls: 4,
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

    it("sends requests within 10 s of each other in one later request", async () => {
        const sent = captureIngest();
        const query = (db: D1Database) =>
            db.prepare("SELECT 'batched' AS value").all();
        await run(query);
        expect(sent.calls).toHaveLength(1);

        vi.setSystemTime(clock + 3_000);
        await run(query);
        // Post-response work waits for the next send too.
        const late = createExecutionContext();
        withD1Calls(
            "gen",
            env,
            late,
            () => ({ route_path: "generation", method: "GET" }),
            () => late.waitUntil(query(env.DB)),
        );
        await waitOnExecutionContext(late);
        expect(sent.calls).toHaveLength(1);

        vi.setSystemTime(clock + 13_000);
        await run(query);
        expect(sent.calls).toHaveLength(2);
        expect(sent.calls[1].map((row) => [row.route_path, row.calls])).toEqual(
            [
                ["/image/:prompt", 1],
                ["generation", 1],
                ["/image/:prompt", 1],
            ],
        );
    });
});
