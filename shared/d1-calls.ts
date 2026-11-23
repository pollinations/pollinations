import { AsyncLocalStorage } from "node:async_hooks";
import { getLogger } from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { getTinybirdDatasourceIngestUrl } from "./events.ts";

// Records every D1 call in d1_call_event so a D1 stall can be traced to what
// was running in the seconds before it: the culprit starts before the stall,
// the queued victims after. Calls are summed per second, route and query, and
// each isolate sends its sums in one request FLUSH_MS after the first of
// them, so the telemetry adds a few Tinybird requests per second, not one
// per request.
// Only the SQL text (placeholders, never bound values), timings and the route
// pattern are sent: no URLs, prompts or error messages.

const FLUSH_MS = 10_000;
// A long scope (the leaderboard cron) sends early instead of growing.
const MAX_BUFFERED = 500;

type D1Env = {
    DB: D1Database;
    ENVIRONMENT?: string;
    // "on" in the deployed production and staging Workers only. Local runs
    // and tests record nothing: tests assert on every outgoing request.
    D1_CALL_TELEMETRY?: string;
    TINYBIRD_INGEST_URL: string;
    TINYBIRD_INGEST_TOKEN: string;
};

export type D1Caller = { route_path: string; method: string };

type D1CallMeta = {
    sql_duration_ms?: number;
    rows_read?: number;
    rows_written?: number;
};

/** One second of one query on one route, as sent to d1_call_event. */
type D1Calls = D1Caller & {
    timestamp: string;
    service: string;
    environment?: string;
    query_id: string;
    error_code: string;
    calls: number;
    // The calls that came with D1's own figures (all() and run() do, first()
    // and raw() do not): none means the three sums below were not measured.
    measured: number;
    total_ms: number;
    max_ms: number;
    sql_ms: number;
    rows_read: number;
    rows_written: number;
};

type Scope = {
    service: string;
    env: D1Env;
    waitUntil: (promise: Promise<unknown>) => void;
    caller: () => D1Caller;
};

const scope = new AsyncLocalStorage<Scope>();
const timedDatabases = new WeakSet<D1Database>();
const statements = new WeakMap<
    D1PreparedStatement,
    { stmt: D1PreparedStatement; sql: string }
>();

// Shared by every request the isolate serves.
const buffered = new Map<string, D1Calls>();
const queryIds = new Map<string, string>();
const sentQueryIds = new Set<string>();
let newQueries: { query_id: string; service: string; sql: string }[] = [];
// While a flush is on its way. A time, not a flag, so a timer that died with
// its request cannot stop later ones.
let flushBy = 0;

/** Runs `run` in a scope whose D1 calls are recorded as `service`. */
export function withD1Calls<T>(
    service: string,
    env: D1Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
    caller: () => D1Caller,
    run: () => T,
): T {
    if (env.D1_CALL_TELEMETRY !== "on") return run();
    timeDatabase(env.DB);
    const current: Scope = {
        service,
        env,
        waitUntil: (promise) => ctx.waitUntil(promise),
        caller,
    };
    return scope.run(current, run);
}

/** Names later D1 calls after the matched route pattern, never the URL:
 * image prompts sit in the path. */
export const nameD1Caller = createMiddleware(async (c, next) => {
    const current = scope.getStore();
    if (current) {
        current.caller = () => ({
            // The request's endpoint, also for calls its middleware makes.
            route_path: routePath(c, -1),
            method: c.req.method,
        });
    }
    await next();
});

// Patched in place, once per binding, so `env.DB` keeps its identity (the
// model registry cache compares it) and every holder of the binding is
// timed. Calls outside a scope are timed but not recorded.
function timeDatabase(db: D1Database): void {
    if (timedDatabases.has(db)) return;
    timedDatabases.add(db);
    const { prepare, batch } = db;
    db.prepare = (sql: string) => timedStatement(prepare.call(db, sql), sql);
    // Test stand-ins may implement prepare() only.
    if (!batch) return;
    db.batch = ((list: D1PreparedStatement[]) => {
        const entries = list.map(
            (s) => statements.get(s) ?? { stmt: s, sql: "" },
        );
        // One query per distinct statement, however long the batch.
        return timeCall(
            [...new Set(entries.map((e) => e.sql))].join(";\n"),
            () =>
                batch.call(
                    db,
                    entries.map((e) => e.stmt),
                ),
        );
    }) as D1Database["batch"];
}

function timedStatement(
    stmt: D1PreparedStatement,
    sql: string,
): D1PreparedStatement {
    const timed = {
        bind: (...values: unknown[]) =>
            timedStatement(stmt.bind(...values), sql),
        first: (column?: string) =>
            timeCall(sql, () =>
                column === undefined ? stmt.first() : stmt.first(column),
            ),
        all: () => timeCall(sql, () => stmt.all()),
        run: () => timeCall(sql, () => stmt.run()),
        raw: (...args: [{ columnNames?: boolean }?]) =>
            timeCall(sql, () => stmt.raw(...(args as []))),
    } as unknown as D1PreparedStatement;
    statements.set(timed, { stmt, sql });
    return timed;
}

async function timeCall<T>(sql: string, call: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
        const result = await call();
        record(sql, startedAt, d1Meta(result));
        return result;
    } catch (error) {
        record(sql, startedAt, undefined, error);
        throw error;
    }
}

// all() and run() return D1's own execution time and row counts; first() and
// raw() return rows only.
function d1Meta(result: unknown): D1CallMeta | undefined {
    const metas = (Array.isArray(result) ? result : [result])
        .map((r) => (r as { meta?: D1Meta } | null)?.meta)
        .filter((m): m is D1Meta => typeof m?.duration === "number");
    if (metas.length === 0) return undefined;
    const sum = (pick: (m: D1Meta) => number | undefined) =>
        metas.reduce((total, m) => total + (pick(m) ?? 0), 0);
    return {
        sql_duration_ms: sum((m) => m.duration),
        rows_read: sum((m) => m.rows_read),
        rows_written: sum((m) => m.rows_written),
    };
}

function errorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/CPU time limit|reset/i.test(message)) return "D1_RESET";
    if (/overloaded|queued/i.test(message)) return "D1_OVERLOADED";
    return "D1_FAILED";
}

// A short stable id for the statement, so its text is sent once per isolate
// (to d1_query) instead of with every call. Placeholder lists of any length
// count as one query.
function queryId(service: string, sql: string): string {
    let id = queryIds.get(sql);
    if (id) return id;
    const shape = sql.replace(/\?(?:\s*,\s*\?)+/g, "?, ...").slice(0, 2000);
    let hash = 0x811c9dc5;
    for (let i = 0; i < shape.length; i++) {
        hash = Math.imul(hash ^ shape.charCodeAt(i), 0x01000193);
    }
    id = (hash >>> 0).toString(16).padStart(8, "0");
    queryIds.set(sql, id);
    if (!sentQueryIds.has(id)) {
        sentQueryIds.add(id);
        newQueries.push({ query_id: id, service, sql: shape });
    }
    return id;
}

function record(
    sql: string,
    startedAt: number,
    meta?: D1CallMeta,
    error?: unknown,
): void {
    const current = scope.getStore();
    if (!current) return;
    try {
        const caller = current.caller();
        const query_id = queryId(current.service, sql);
        const error_code = error === undefined ? "" : errorCode(error);
        // The second the call started in, as Tinybird reads a DateTime.
        const timestamp = new Date(startedAt)
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");
        const key = [
            timestamp,
            current.service,
            caller.route_path,
            caller.method,
            query_id,
            error_code,
        ].join("|");
        let sum = buffered.get(key);
        if (!sum) {
            sum = {
                timestamp,
                service: current.service,
                environment: current.env.ENVIRONMENT,
                ...caller,
                query_id,
                error_code,
                calls: 0,
                measured: 0,
                total_ms: 0,
                max_ms: 0,
                sql_ms: 0,
                rows_read: 0,
                rows_written: 0,
            };
            buffered.set(key, sum);
        }
        const duration = Date.now() - startedAt;
        sum.calls += 1;
        if (meta) sum.measured += 1;
        sum.total_ms += duration;
        sum.max_ms = Math.max(sum.max_ms, duration);
        sum.sql_ms += meta?.sql_duration_ms ?? 0;
        sum.rows_read += meta?.rows_read ?? 0;
        sum.rows_written += meta?.rows_written ?? 0;
        if (buffered.size >= MAX_BUFFERED) flush(current);
        else if (Date.now() >= flushBy) {
            // The first sum since the last flush: send them all in FLUSH_MS,
            // whether or not another request comes.
            flushBy = Date.now() + FLUSH_MS;
            current.waitUntil(
                new Promise((resolve) => setTimeout(resolve, FLUSH_MS)).then(
                    () => flush(current),
                ),
            );
        }
    } catch {
        // Telemetry must never change the call's outcome.
    }
}

function flush(current: Scope): void {
    flushBy = 0;
    const calls = [...buffered.values()];
    const queries = newQueries;
    buffered.clear();
    newQueries = [];
    if (calls.length > 0)
        current.waitUntil(ingest(current, "d1_call_event", calls));
    if (queries.length > 0)
        current.waitUntil(
            // A statement Tinybird did not take goes again with the next flush.
            ingest(current, "d1_query", queries).then((sent) => {
                if (!sent) newQueries.push(...queries);
            }),
        );
}

async function ingest(
    current: Scope,
    datasource: string,
    rows: object[],
): Promise<boolean> {
    const { env } = current;
    try {
        const response = await fetch(
            getTinybirdDatasourceIngestUrl(env.TINYBIRD_INGEST_URL, datasource),
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_INGEST_TOKEN}`,
                    "Content-Type": "application/x-ndjson",
                },
                body: rows.map((row) => JSON.stringify(row)).join("\n"),
            },
        );
        if (!response.ok) {
            getLogger([current.service, "d1"]).error(
                "{datasource} ingest failed: status={status}",
                { datasource, status: response.status },
            );
        }
        return response.ok;
    } catch (error) {
        getLogger([current.service, "d1"]).error(
            "{datasource} ingest failed: {error}",
            { datasource, error },
        );
        return false;
    }
}
