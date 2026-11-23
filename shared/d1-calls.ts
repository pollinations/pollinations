import { AsyncLocalStorage } from "node:async_hooks";
import { getLogger } from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { getTinybirdDatasourceIngestUrl } from "./events.ts";

// Records every D1 call in d1_call_event so a D1 stall can be traced to what
// was running in the seconds before it: the culprit starts before the stall,
// the queued victims after. Only the SQL text (placeholders, never bound
// values), timings and the route pattern are sent: no URLs, prompts or error
// messages. A scope's calls go to Tinybird in one request when it ends.

// A long scope (the leaderboard cron) sends in chunks so a killed run still
// leaves most of its calls behind.
const MAX_BUFFERED = 200;

type D1Env = {
    DB: D1Database;
    ENVIRONMENT?: string;
    TINYBIRD_INGEST_URL: string;
    TINYBIRD_INGEST_TOKEN: string;
};

export type D1Caller = {
    route_path: string;
    method: string;
    request_id?: string;
    edge_colo?: string;
};

type D1CallRow = D1Caller & {
    timestamp: string;
    service: string;
    environment?: string;
    duration_ms: number;
    sql_duration_ms?: number;
    rows_read?: number;
    rows_written?: number;
    statements: number;
    error_code: string;
    sql: string;
};

type Scope = {
    service: string;
    env: D1Env;
    waitUntil: (promise: Promise<unknown>) => void;
    caller: () => D1Caller;
    rows: D1CallRow[];
    open: boolean;
    sending: boolean;
};

const scope = new AsyncLocalStorage<Scope>();
const timedDatabases = new WeakSet<D1Database>();
const statements = new WeakMap<
    D1PreparedStatement,
    { stmt: D1PreparedStatement; sql: string }
>();

/** Runs `run` in a scope whose D1 calls are recorded as `service`. */
export function withD1Calls<T>(
    service: string,
    env: D1Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
    caller: () => D1Caller,
    run: () => T,
): T {
    // Envs built without a D1 binding (tests) have nothing to time.
    if (env.DB) timeDatabase(env.DB);
    const current: Scope = {
        service,
        env,
        waitUntil: (promise) => ctx.waitUntil(promise),
        caller,
        rows: [],
        open: true,
        sending: false,
    };
    const close = () => {
        current.open = false;
        send(current);
    };
    let result: T;
    try {
        result = scope.run(current, run);
    } catch (error) {
        close();
        throw error;
    }
    if (result instanceof Promise) result.then(close, close);
    else close();
    return result;
}

/** Names later D1 calls after the matched route pattern, never the URL:
 * image prompts sit in the path. */
export const nameD1Caller = createMiddleware<{
    Variables: { requestId?: string };
}>(async (c, next) => {
    const current = scope.getStore();
    if (current) {
        current.caller = () => ({
            // The request's endpoint, also for calls its middleware makes.
            route_path: routePath(c, -1),
            method: c.req.method,
            request_id: c.var.requestId,
            edge_colo: (c.req.raw as Request & { cf?: { colo?: string } }).cf
                ?.colo,
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
        return timeCall(
            entries.map((e) => e.sql).join(";\n"),
            () =>
                batch.call(
                    db,
                    entries.map((e) => e.stmt),
                ),
            entries.length,
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

async function timeCall<T>(
    sql: string,
    call: () => Promise<T>,
    count = 1,
): Promise<T> {
    const startedAt = Date.now();
    try {
        const result = await call();
        record({ sql, count, startedAt, meta: d1Meta(result) });
        return result;
    } catch (error) {
        record({ sql, count, startedAt, error });
        throw error;
    }
}

type D1CallMeta = {
    sql_duration_ms?: number;
    rows_read?: number;
    rows_written?: number;
};

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

function record(call: {
    sql: string;
    count: number;
    startedAt: number;
    meta?: D1CallMeta;
    error?: unknown;
}): void {
    const current = scope.getStore();
    if (!current) return;
    try {
        current.rows.push({
            ...current.caller(),
            timestamp: new Date(call.startedAt).toISOString(),
            service: current.service,
            environment: current.env.ENVIRONMENT,
            duration_ms: Date.now() - call.startedAt,
            ...call.meta,
            statements: call.count,
            error_code: call.error === undefined ? "" : errorCode(call.error),
            sql: call.sql.slice(0, 2000),
        });
        send(current);
    } catch {
        // Telemetry must never change the call's outcome.
    }
}

// Sends once the scope has ended (calls made after that, such as
// post-response billing, follow in their own small batch) or when the buffer
// is full. Calls ending in the same tick share one request.
function send(current: Scope): void {
    if (current.sending || current.rows.length === 0) return;
    if (current.open && current.rows.length < MAX_BUFFERED) return;
    current.sending = true;
    current.waitUntil(
        Promise.resolve().then(async () => {
            current.sending = false;
            const rows = current.rows.splice(0);
            const { env } = current;
            try {
                const response = await fetch(
                    getTinybirdDatasourceIngestUrl(
                        env.TINYBIRD_INGEST_URL,
                        "d1_call_event",
                    ),
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
                        "d1_call_event ingest failed: status={status}",
                        { status: response.status },
                    );
                }
            } catch (error) {
                getLogger([current.service, "d1"]).error(
                    "d1_call_event ingest failed: {error}",
                    { error },
                );
            }
        }),
    );
}
