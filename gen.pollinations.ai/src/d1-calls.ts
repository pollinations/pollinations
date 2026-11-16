import { AsyncLocalStorage } from "node:async_hooks";
import { getLogger } from "@logtape/logtape";
import {
    getTinybirdDatasourceIngestUrl,
    sendErrorEventToTinybird,
    type TinybirdErrorEvent,
} from "@shared/events.ts";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

// Records slow or failed D1 calls in error_event (kind "d1_call") so a D1
// stall can be traced to the statement that started it: the culprit starts
// before the stall, the queued victims after. Only the SQL text (placeholders,
// never bound values), timings and the route pattern are sent: no URLs,
// prompts or error messages.

const SLOW_MS = 1000;

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

type Scope = {
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

/** Runs `run` in a scope whose slow or failed D1 calls are recorded. */
export function withD1Calls<T>(
    env: D1Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
    caller: () => D1Caller,
    run: () => T,
): T {
    // Envs built without a D1 binding (tests) have nothing to time.
    if (env.DB) timeDatabase(env.DB);
    const waitUntil = (promise: Promise<unknown>) => ctx.waitUntil(promise);
    return scope.run({ env, waitUntil, caller }, run);
}

/** Names later D1 calls after the matched route pattern, never the URL:
 * image prompts sit in the path. */
export const nameD1Caller = createMiddleware<{
    Variables: { requestId?: string };
}>(async (c, next) => {
    const current = scope.getStore();
    if (current) {
        current.caller = () => ({
            route_path: routePath(c),
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
        return timeCall(entries.map((e) => e.sql).join(";\n"), () =>
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
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= SLOW_MS) {
            report({ sql, startedAt, elapsedMs, meta: d1Meta(result) });
        }
        return result;
    } catch (error) {
        report({ sql, startedAt, elapsedMs: Date.now() - startedAt, error });
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

function report(call: {
    sql: string;
    startedAt: number;
    elapsedMs: number;
    meta?: D1CallMeta;
    error?: unknown;
}): void {
    const current = scope.getStore();
    if (!current) return;
    try {
        const { env } = current;
        const startedAt = new Date(call.startedAt).toISOString();
        const event: TinybirdErrorEvent = {
            ...current.caller(),
            timestamp: startedAt,
            kind: "d1_call",
            severity: call.error === undefined ? "warning" : "error",
            environment: env.ENVIRONMENT,
            status: 0,
            duration_ms: call.elapsedMs,
            error_code:
                call.error === undefined ? "D1_SLOW" : errorCode(call.error),
            error_class: "D1Call",
            message: call.sql.slice(0, 2000),
            upstream_host: "d1",
            upstream_body: JSON.stringify({
                started_at: startedAt,
                ...call.meta,
            }),
        };
        current.waitUntil(
            sendErrorEventToTinybird(
                event,
                getTinybirdDatasourceIngestUrl(
                    env.TINYBIRD_INGEST_URL,
                    "error_event",
                ),
                env.TINYBIRD_INGEST_TOKEN,
                getLogger(["gen", "d1"]),
            ),
        );
    } catch {
        // Telemetry must never change the call's outcome.
    }
}
