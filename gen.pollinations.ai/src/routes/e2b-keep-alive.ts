// Keep-alive ticker: maintains the lease of every sandbox flagged in the
// sandbox_keep_alive D1 table (see POST /sandboxes/:id/keep-alive in e2b.ts).
// Runs from the worker's scheduled handler; bills the account balance per
// second like the request path does.
//
// Billing safety model (quest-scale, best-effort - no SLA):
// - charged_until is a monotonic watermark of lease time keep-alive already
//   paid for; combined with E2B's endAt it never double-charges lease time,
//   whoever paid for it.
// - Every write is fenced by the enable epoch's generation UUID and the
//   holding tick's claim token, and every settlement first re-verifies the
//   (generation, claim_token) claim: a stale or disabled subscription at
//   worst grants unpaid lease time, it never collects for an interval an
//   intervening operation paid for.
// - Ambiguous outcomes (worker crash, timed-out deduction) resolve in the
//   user's favor: never retried, possibly under-collected once, and the
//   claim stays held until it expires so no other tick touches the row
//   while the ambiguous operation may still be running.

import { payerBucketToMeter } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { getFundedUserBalance } from "@shared/billing/internal-automation.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import {
    sandboxKeepAlive,
    sandboxKeepAliveMeta,
} from "@shared/db/sandbox-keep-alive.ts";
import { sendToTinybird } from "@shared/events.ts";
import {
    priceToEventParams,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const E2B_API = "https://api.e2b.app";
const OWNER_KEY = "pollinations_user";
const MAX_RUNNING_PER_USER = 3;
// Same list rates and launch promo as the request path in e2b.ts.
const VCPU_SECOND = 0.000014;
const GIB_SECOND = 0.0000045;
const PRICE_MULTIPLIER = 0.25;

// Each tick keeps the lease at now + 6h. E2B's timeout is absolute
// (endAt = now + timeout), so this never approaches the 24h hard pause.
export const KEEP_ALIVE_LEASE_SECONDS = 6 * 60 * 60;
// A crashed ticker's claim is taken over after this long.
const CLAIM_EXPIRY_MS = 10 * 60 * 1000;
// One invocation never works longer than this; the persisted cursor lets
// the next tick continue past unfinished rows.
const INVOCATION_BUDGET_MS = 25_000;
const MAX_ROWS_PER_TICK = 200;
// No new row starts below the first, no new E2B mutation below the second.
const ROW_MIN_REMAINING_MS = 5_000;
const MUTATION_MIN_REMAINING_MS = 3_000;
// Per-stage caps: D1/KV are same-region and fast, E2B is the slow one.
const LOCAL_STAGE_MS = 2_000;
const E2B_STAGE_MS = 10_000;
const CURSOR_KEY = "cursor";

// The bindings the ticker needs; the worker's full env satisfies this.
export type KeepAliveEnv = {
    DB: D1Database;
    E2B_API_KEY?: string;
    TINYBIRD_INGEST_URL: string;
    TINYBIRD_INGEST_TOKEN: string;
    ENVIRONMENT: string;
};

export type KeepAliveLog = {
    info: (message: string, fields?: Record<string, unknown>) => void;
    error: (message: string, fields?: Record<string, unknown>) => void;
};

// Minimal console logger for the scheduled handler, which has no request
// context logger.
export const consoleLog: KeepAliveLog = {
    info: (message, fields) => console.log(message, fields ?? {}),
    error: (message, fields) => console.error(message, fields ?? {}),
};

// Test seam: the deduction step is the one stage whose failure mode must be
// exercised deterministically.
export type KeepAliveDeps = {
    deduct?: typeof handleBalanceDeduction;
};

type SandboxDetail = {
    sandboxID: string;
    endAt: string;
    cpuCount: number;
    memoryMB: number;
    state: "running" | "paused";
};

type Flag = typeof sandboxKeepAlive.$inferSelect;

class StageTimeout extends Error {}

// Every awaited stage gets what remains of the invocation budget, capped per
// stage kind, and refuses to start once the budget is gone: a stalled stage
// can never hold the tick hostage or launch work past the deadline.
async function stage<T>(
    work: () => Promise<T>,
    budgetMs: number,
    capMs: number,
    what: string,
): Promise<T> {
    const ms = Math.min(budgetMs, capMs);
    if (ms <= 0) throw new StageTimeout(what);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            work(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new StageTimeout(what)), ms);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function e2b(
    env: KeepAliveEnv,
    path: string,
    budgetMs: number,
    init: RequestInit = {},
): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("x-api-key", env.E2B_API_KEY ?? "");
    return stage(
        () =>
            fetch(`${E2B_API}${path}`, {
                ...init,
                headers,
                signal: AbortSignal.timeout(
                    Math.max(1, Math.min(budgetMs, E2B_STAGE_MS)),
                ),
            }),
        budgetMs,
        E2B_STAGE_MS,
        `e2b ${path}`,
    );
}

async function getSandbox(
    env: KeepAliveEnv,
    id: string,
    budgetMs: number,
): Promise<SandboxDetail | null> {
    const response = await e2b(
        env,
        `/sandboxes/${encodeURIComponent(id)}`,
        budgetMs,
    );
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(
            `E2B returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
        );
    }
    return response.json<SandboxDetail>();
}

// E2B's list cost for `seconds` of this sandbox, and what the caller pays.
function lease(sandbox: SandboxDetail, seconds: number) {
    const cost =
        seconds *
        (sandbox.cpuCount * VCPU_SECOND +
            (sandbox.memoryMB / 1024) * GIB_SECOND);
    return {
        cost: roundPollenLedgerAmount(cost),
        price: roundPollenLedgerAmount(cost * PRICE_MULTIPLIER),
    };
}

type Settlement = "settled" | "ambiguous";

// Settlement, in plan order: deduct -> token-fenced watermark -> telemetry
// last. The watermark is durable before telemetry runs, so a telemetry
// failure can never make the operation chargeable again. A deduction whose
// outcome is unknown is "ambiguous": the caller must leave the claim held
// (no release, no retry) and let it expire.
async function settle(
    env: KeepAliveEnv,
    log: KeepAliveLog,
    deps: KeepAliveDeps,
    flag: Flag,
    token: string,
    bill: { cost: number; price: number },
    targetSeconds: number,
    deadline: number,
): Promise<Settlement> {
    const db = drizzle(env.DB);
    const startTime = new Date();
    const deduct = deps.deduct ?? handleBalanceDeduction;
    let deduction: Awaited<ReturnType<typeof handleBalanceDeduction>>;
    try {
        deduction = await stage(
            () =>
                deduct({
                    db: db as unknown as Parameters<
                        typeof handleBalanceDeduction
                    >[0]["db"],
                    isBilledUsage: true,
                    totalPrice: bill.price,
                    userId: flag.userId,
                    modelPaidOnly: false,
                }),
            deadline - Date.now(),
            LOCAL_STAGE_MS * 5,
            "deduction",
        );
    } catch (error) {
        log.error(
            "Keep-alive deduction unresolved; claim stays held: {error}",
            {
                error: error instanceof Error ? error.message : String(error),
                sandboxId: flag.sandboxId,
            },
        );
        return "ambiguous";
    }
    // Monotonic watermark CAS, fenced by the enable epoch and our claim: a
    // stale holder that lost takeover cannot move the new owner's watermark.
    await stage(
        () =>
            db
                .update(sandboxKeepAlive)
                .set({ chargedUntil: targetSeconds })
                .where(
                    and(
                        eq(sandboxKeepAlive.sandboxId, flag.sandboxId),
                        eq(sandboxKeepAlive.generation, flag.generation),
                        eq(sandboxKeepAlive.claimToken, token),
                        lt(sandboxKeepAlive.chargedUntil, targetSeconds),
                    ),
                ),
        deadline - Date.now(),
        LOCAL_STAGE_MS,
        "watermark",
    ).catch((error) =>
        log.error("Keep-alive watermark update failed: {error}", {
            error: error instanceof Error ? error.message : String(error),
            sandboxId: flag.sandboxId,
        }),
    );
    const endTime = new Date();
    try {
        await stage(
            () =>
                sendToTinybird(
                    {
                        id: crypto.randomUUID(),
                        requestId: crypto.randomUUID(),
                        requestPath: "cron/sandbox-keep-alive",
                        startTime,
                        endTime,
                        responseTime: endTime.getTime() - startTime.getTime(),
                        responseStatus: 200,
                        environment: env.ENVIRONMENT,
                        eventType: "sandbox.lease",
                        userId: flag.userId,
                        ...(deduction.payerBucket
                            ? payerBucketToMeter(deduction.payerBucket)
                            : {}),
                        modelRequested: "sandbox",
                        resolvedModelRequested: "sandbox",
                        modelUsed: "sandbox",
                        modelProviderUsed: "e2b",
                        fallbackUsed: false,
                        isFinal: true,
                        isBilledUsage: true,
                        ...priceToEventParams(),
                        ...usageToEventParams(),
                        totalCost: bill.cost,
                        totalPrice: deduction.billedPrice,
                        devPrice: bill.price,
                        markupRate: deduction.markup?.markupRate ?? 0,
                    },
                    env.TINYBIRD_INGEST_URL,
                    env.TINYBIRD_INGEST_TOKEN,
                    consoleLog as never,
                ),
            deadline - Date.now(),
            LOCAL_STAGE_MS * 5,
            "telemetry",
        );
    } catch (error) {
        log.error("Keep-alive telemetry failed: {error}", {
            error: error instanceof Error ? error.message : String(error),
            sandboxId: flag.sandboxId,
        });
    }
    return "settled";
}

// The claim is ours only while the row still carries our epoch and token.
async function stillOwned(
    db: ReturnType<typeof drizzle>,
    flag: Flag,
    token: string,
    budgetMs: number,
): Promise<boolean> {
    const rows = await stage(
        () =>
            db
                .select({
                    generation: sandboxKeepAlive.generation,
                    claimToken: sandboxKeepAlive.claimToken,
                })
                .from(sandboxKeepAlive)
                .where(eq(sandboxKeepAlive.sandboxId, flag.sandboxId))
                .limit(1),
        budgetMs,
        LOCAL_STAGE_MS,
        "ownership check",
    );
    return (
        rows[0]?.generation === flag.generation && rows[0]?.claimToken === token
    );
}

// Catches the paid watermark up after a skip (no charge), fenced by epoch
// and claim.
async function catchUpWatermark(
    db: ReturnType<typeof drizzle>,
    flag: Flag,
    token: string,
    uptoSeconds: number,
    budgetMs: number,
): Promise<void> {
    await stage(
        () =>
            db
                .update(sandboxKeepAlive)
                .set({ chargedUntil: uptoSeconds })
                .where(
                    and(
                        eq(sandboxKeepAlive.sandboxId, flag.sandboxId),
                        eq(sandboxKeepAlive.generation, flag.generation),
                        eq(sandboxKeepAlive.claimToken, token),
                        lt(sandboxKeepAlive.chargedUntil, uptoSeconds),
                    ),
                ),
        budgetMs,
        LOCAL_STAGE_MS,
        "watermark catch-up",
    );
}

// Fenced delete: ends the subscription only if the epoch is still ours.
async function deleteFlag(
    db: ReturnType<typeof drizzle>,
    flag: Flag,
    budgetMs: number,
    what: string,
): Promise<void> {
    await stage(
        () =>
            db
                .delete(sandboxKeepAlive)
                .where(
                    and(
                        eq(sandboxKeepAlive.sandboxId, flag.sandboxId),
                        eq(sandboxKeepAlive.generation, flag.generation),
                    ),
                ),
        budgetMs,
        LOCAL_STAGE_MS,
        what,
    );
}

async function processFlag(
    env: KeepAliveEnv,
    log: KeepAliveLog,
    deps: KeepAliveDeps,
    flag: Flag,
    deadline: number,
): Promise<void> {
    const db = drizzle(env.DB);
    const remaining = () => deadline - Date.now();
    // Claim with expiry and a unique token; only one ticker owns the row.
    const token = crypto.randomUUID();
    const claimed = await stage(
        () =>
            db
                .update(sandboxKeepAlive)
                .set({ claimedAt: new Date(), claimToken: token })
                .where(
                    and(
                        eq(sandboxKeepAlive.sandboxId, flag.sandboxId),
                        eq(sandboxKeepAlive.generation, flag.generation),
                        or(
                            isNull(sandboxKeepAlive.claimedAt),
                            lt(
                                sandboxKeepAlive.claimedAt,
                                new Date(Date.now() - CLAIM_EXPIRY_MS),
                            ),
                        ),
                    ),
                )
                .returning({ sandboxId: sandboxKeepAlive.sandboxId }),
        remaining(),
        LOCAL_STAGE_MS,
        "claim",
    );
    if (claimed.length === 0) return;

    // Token-fenced release. Never called after an ambiguous settlement: that
    // claim expires on its own, keeping the row untouched while the
    // unresolved operation may still be running.
    const release = () =>
        stage(
            () =>
                db
                    .update(sandboxKeepAlive)
                    .set({ claimedAt: null, claimToken: null })
                    .where(
                        and(
                            eq(sandboxKeepAlive.sandboxId, flag.sandboxId),
                            eq(sandboxKeepAlive.generation, flag.generation),
                            eq(sandboxKeepAlive.claimToken, token),
                        ),
                    ),
            remaining(),
            LOCAL_STAGE_MS,
            "claim release",
        ).catch((error) =>
            log.error("Keep-alive claim release failed: {error}", {
                error: error instanceof Error ? error.message : String(error),
                sandboxId: flag.sandboxId,
            }),
        );

    const sandbox = await getSandbox(env, flag.sandboxId, remaining());
    if (!sandbox) {
        await deleteFlag(db, flag, remaining(), "delete gone");
        return;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const target = nowSeconds + KEEP_ALIVE_LEASE_SECONDS;

    if (sandbox.state === "paused") {
        // Capacity first: at the limit, keep the flag and retry next tick.
        const query = new URLSearchParams({
            metadata: `${OWNER_KEY}=${flag.userId}`,
            state: "running",
            limit: String(MAX_RUNNING_PER_USER),
        });
        const runningResponse = await e2b(
            env,
            `/v2/sandboxes?${query}`,
            remaining(),
        );
        if (!runningResponse.ok) {
            throw new Error(
                `E2B returned ${runningResponse.status} listing sandboxes`,
            );
        }
        if (
            (await runningResponse.json<unknown[]>()).length >=
            MAX_RUNNING_PER_USER
        ) {
            log.info("Keep-alive paused sandbox waits for capacity", {
                sandboxId: flag.sandboxId,
            });
            await release();
            return;
        }
        // A paused sandbox gave up its lease: resuming pays it in full.
        const bill = lease(sandbox, KEEP_ALIVE_LEASE_SECONDS);
        const balance = await stage(
            () => getFundedUserBalance(db, env.DB, flag.userId),
            remaining(),
            LOCAL_STAGE_MS,
            "funds check",
        );
        if (!canCoverEstimatedCharge(balance, bill.price)) {
            log.info("Keep-alive disabled: owner cannot pay", {
                sandboxId: flag.sandboxId,
            });
            await deleteFlag(db, flag, remaining(), "delete broke");
            return;
        }
        // Fresh state right before the mutation: a manual connect or delete
        // landing while this tick was busy must not be followed by our own.
        const fresh = await getSandbox(env, flag.sandboxId, remaining());
        if (!fresh) {
            await deleteFlag(db, flag, remaining(), "delete gone");
            return;
        }
        if (fresh.state !== "paused") {
            // Resumed by someone else; the running path handles it next tick.
            await release();
            return;
        }
        // Ownership re-check immediately before the external mutation: a
        // disabled or re-enabled flag stops here, before money moves.
        if (!(await stillOwned(db, flag, token, remaining()))) return;
        if (remaining() < MUTATION_MIN_REMAINING_MS) return;
        const response = await e2b(
            env,
            `/sandboxes/${encodeURIComponent(flag.sandboxId)}/connect`,
            remaining(),
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ timeout: KEEP_ALIVE_LEASE_SECONDS }),
            },
        );
        if (!response.ok) {
            log.info("Keep-alive connect refused by E2B: {status}", {
                status: response.status,
                sandboxId: flag.sandboxId,
            });
            await release();
            return;
        }
        // Settlement fence: lost ownership between mutation and deduction
        // suppresses the charge (conservative under-collect).
        if (!(await stillOwned(db, flag, token, remaining()))) return;
        const outcome = await settle(
            env,
            log,
            deps,
            flag,
            token,
            bill,
            Math.floor(Date.now() / 1000) + KEEP_ALIVE_LEASE_SECONDS,
            deadline,
        );
        if (outcome === "settled") await release();
        return;
    }

    // Running: extend to target, but never shorten an already-paid deadline.
    const endAtSeconds = Math.floor(Date.parse(sandbox.endAt) / 1000);
    const billFrom = Math.max(endAtSeconds, flag.chargedUntil, nowSeconds);
    let seconds = target - billFrom;
    if (seconds <= 0) {
        // No mutation and no charge; just catch the watermark up.
        await catchUpWatermark(
            db,
            flag,
            token,
            Math.min(target, endAtSeconds),
            remaining(),
        );
        await release();
        return;
    }
    const balance = await stage(
        () => getFundedUserBalance(db, env.DB, flag.userId),
        remaining(),
        LOCAL_STAGE_MS,
        "funds check",
    );
    if (!canCoverEstimatedCharge(balance, lease(sandbox, seconds).price)) {
        log.info("Keep-alive disabled: owner cannot pay", {
            sandboxId: flag.sandboxId,
        });
        await deleteFlag(db, flag, remaining(), "delete broke");
        return;
    }
    // Fresh state right before the mutation: if a manual extension covered
    // the target while this tick was busy, skip - never shorten or re-charge
    // someone else's paid lease.
    const fresh = await getSandbox(env, flag.sandboxId, remaining());
    if (!fresh) {
        await deleteFlag(db, flag, remaining(), "delete gone");
        return;
    }
    if (fresh.state !== "running") {
        // Rare mid-tick pause: leave it to the next tick's paused path.
        await release();
        return;
    }
    const freshEndAtSeconds = Math.floor(Date.parse(fresh.endAt) / 1000);
    seconds =
        target - Math.max(freshEndAtSeconds, flag.chargedUntil, nowSeconds);
    if (seconds <= 0) {
        await catchUpWatermark(
            db,
            flag,
            token,
            Math.min(target, freshEndAtSeconds),
            remaining(),
        );
        await release();
        return;
    }
    if (!(await stillOwned(db, flag, token, remaining()))) return;
    if (remaining() < MUTATION_MIN_REMAINING_MS) return;
    const bill = lease(fresh, seconds);
    const response = await e2b(
        env,
        `/sandboxes/${encodeURIComponent(flag.sandboxId)}/timeout`,
        remaining(),
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ timeout: KEEP_ALIVE_LEASE_SECONDS }),
        },
    );
    if (!response.ok) {
        log.info("Keep-alive timeout refused by E2B: {status}", {
            status: response.status,
            sandboxId: flag.sandboxId,
        });
        await release();
        return;
    }
    if (!(await stillOwned(db, flag, token, remaining()))) return;
    const outcome = await settle(
        env,
        log,
        deps,
        flag,
        token,
        bill,
        target,
        deadline,
    );
    if (outcome === "settled") await release();
}

// The sweep cursor lives in D1, not KV: it advances per row, and KV
// throttles same-key writes to one per second.
async function getCursor(
    db: ReturnType<typeof drizzle>,
    budgetMs: number,
): Promise<string> {
    const rows = await stage(
        () =>
            db
                .select({ value: sandboxKeepAliveMeta.value })
                .from(sandboxKeepAliveMeta)
                .where(eq(sandboxKeepAliveMeta.key, CURSOR_KEY))
                .limit(1),
        budgetMs,
        LOCAL_STAGE_MS,
        "cursor read",
    );
    return rows[0]?.value ?? "";
}

async function putCursor(
    db: ReturnType<typeof drizzle>,
    value: string,
    budgetMs: number,
): Promise<void> {
    await stage(
        () =>
            db
                .insert(sandboxKeepAliveMeta)
                .values({ key: CURSOR_KEY, value })
                .onConflictDoUpdate({
                    target: sandboxKeepAliveMeta.key,
                    set: { value },
                }),
        budgetMs,
        LOCAL_STAGE_MS,
        "cursor write",
    );
}

// One cron tick: a bounded, resumable sweep over the keep-alive flags. The
// cursor is persisted BEFORE each row's work, so a stalled row never blocks
// the rows after it; the next full sweep revisits it, and the watermark
// makes re-processing safe.
export async function runSandboxKeepAlive(
    env: KeepAliveEnv,
    log: KeepAliveLog,
    deps: KeepAliveDeps = {},
): Promise<void> {
    if (!env.E2B_API_KEY) {
        log.error("Keep-alive tick skipped: E2B_API_KEY is not configured");
        return;
    }
    const deadline = Date.now() + INVOCATION_BUDGET_MS;
    const db = drizzle(env.DB);
    let cursor = await getCursor(db, deadline - Date.now());
    const flags = await stage(
        () =>
            db
                .select()
                .from(sandboxKeepAlive)
                .where(gt(sandboxKeepAlive.sandboxId, cursor))
                .orderBy(sandboxKeepAlive.sandboxId)
                .limit(MAX_ROWS_PER_TICK),
        deadline - Date.now(),
        LOCAL_STAGE_MS,
        "flag select",
    );
    let processed = 0;
    for (const flag of flags) {
        if (Date.now() > deadline - ROW_MIN_REMAINING_MS) break;
        cursor = flag.sandboxId;
        await putCursor(db, cursor, deadline - Date.now());
        processed++;
        try {
            await processFlag(env, log, deps, flag, deadline);
        } catch (error) {
            // One failing subscription never blocks the rest.
            log.error("Keep-alive row failed: {error}", {
                error: error instanceof Error ? error.message : String(error),
                sandboxId: flag.sandboxId,
            });
        }
    }
    // The sweep wrapped: start from the beginning next tick.
    if (flags.length < MAX_ROWS_PER_TICK && processed >= flags.length) {
        await putCursor(db, "", deadline - Date.now());
    }
}
