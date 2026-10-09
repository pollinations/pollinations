import { getLogger } from "@logtape/logtape";
import { hasAccountPermission } from "@shared/auth/account-permissions.ts";
import {
    extractApiKey,
    loadActiveApiKeyAuthResult,
} from "@shared/auth/api-key.ts";
import { payerBucketToMeter } from "@shared/billing/balance.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { handleError } from "@shared/error.ts";
import { sendToTinybird } from "@shared/events.ts";
import { ensureConfigured } from "@shared/logger.ts";
import { requestId } from "@shared/middleware/request-id.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import {
    priceToEventParams,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono, type MiddlewareHandler, type Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import {
    auth,
    authFromSnapshot,
    type GenerationAuthSnapshot,
    keyPermissionsLink,
} from "@/middleware/auth.ts";
import { logger } from "@/middleware/logger.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { requestIdentity } from "@/middleware/track.ts";
import { requireFunds } from "@/utils/generation-access.ts";

// E2B's control API, forwarded under Pollinations keys. The SDKs talk to the
// sandboxes themselves (commands, files, ports) directly at E2B with the
// per-sandbox tokens these responses carry.
const E2B_API = "https://api.e2b.app";
// Gen serves E2B's API under this experimental path; the rest of each path is E2B's.
export const E2B_PATH = "/alpha/e2b";
// One E2B team runs every user's sandboxes; this metadata key names the owner.
const OWNER_KEY = "pollinations_user";
const MAX_RUNNING_PER_USER = 3;
// E2B ends a sandbox's run 24 hours after it starts or resumes.
const MAX_RUN_MS = 24 * 60 * 60_000;
// E2B list prices per second, in pollen (1 pollen ≈ $1).
const VCPU_SECOND = 0.000014;
const GIB_SECOND = 0.0000045;
// Launch promo: callers pay 25% of E2B's list price. Set back to 1 when the
// promo week ends.
const PRICE_MULTIPLIER = 0.25;
// E2B's lease when connect omits `timeout`.
const DEFAULT_TIMEOUT_SECONDS = 300;
// Gen logs polli in inside this template, which has polli and the coding
// harnesses, with a key of the sandbox's own.
const LOGGED_IN_TEMPLATE = "pollinations";
// What `polli auth login` asks for.
const POLLI_PERMISSIONS = ["profile", "usage", "keys", "machines"];
// E2B takes a timeout as 32-bit seconds.
const MAX_TIMEOUT_SECONDS = 2 ** 31 - 1;
// Created with a timeout past the 24-hour run, a sandbox is kept, as on an E2B
// team with a longer limit: gen's cron renews it until UNTIL_KEY with the key
// that created it, named in PAYER_KEY. One E2B team serves staging and
// production, so ENV_KEY names the one that keeps it; only kept sandboxes
// have it.
const UNTIL_KEY = "pollinations_until";
const PAYER_KEY = "pollinations_key";
const ENV_KEY = "pollinations_env";
// The cron runs every 10 minutes and renews a kept sandbox for up to an hour
// once less than 15 minutes of its lease are left.
const KEEP_LEASE_SECONDS = 3600;
const KEEP_RENEW_WITHIN_MS = 15 * 60_000;

type SandboxDetail = {
    sandboxID: string;
    startedAt: string;
    endAt: string;
    cpuCount: number;
    memoryMB: number;
    state: "running" | "paused";
    metadata?: Record<string, string>;
};

type NewSandbox = {
    templateID?: string;
    timeout?: number;
    metadata?: Record<string, string>;
    autoResume?: { enabled?: boolean };
    iam?: unknown;
    volumeMounts?: unknown[];
};

type CreatedSandbox = {
    sandboxID: string;
    domain?: string | null;
    envdAccessToken?: string;
};

type E2bContext = Context<Env>;

function e2b(env: CloudflareBindings, path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("x-api-key", env.E2B_API_KEY ?? "");
    return fetch(`${E2B_API}${path}`, { ...init, headers });
}

// Relays the caller's request with the team key in place of theirs.
async function forward(c: E2bContext, search = new URL(c.req.url).search) {
    const body = c.req.method === "GET" ? "" : await c.req.text();
    const response = await e2b(
        c.env,
        c.req.path.slice(E2B_PATH.length) + search,
        {
            method: c.req.method,
            ...(body && {
                headers: { "content-type": "application/json" },
                body,
            }),
        },
    );
    return new Response(response.body, response);
}

// Reads the body as text, which Hono caches for forward() to send on.
async function readJson<T>(c: E2bContext): Promise<Partial<T>> {
    const text = await c.req.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        throw new HTTPException(400, { message: "Invalid JSON body" });
    }
}

// A failed call of our own is never the caller's fault: their key was fine.
async function upstreamError(response: Response) {
    const detail = (await response.text()).slice(0, 300);
    return new HTTPException(502, {
        message: `E2B returned ${response.status}: ${detail}`,
    });
}

async function getSandbox(
    c: E2bContext,
    id: string,
): Promise<SandboxDetail | null> {
    const response = await e2b(c.env, `/sandboxes/${encodeURIComponent(id)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await upstreamError(response);
    return response.json<SandboxDetail>();
}

// Every per-sandbox call reads the sandbox first: that proves ownership and
// gives the lease and size a charge needs.
async function ownedSandbox(c: E2bContext): Promise<SandboxDetail> {
    const id = c.req.param("id") ?? "";
    const sandbox = await getSandbox(c, id);
    if (
        !sandbox ||
        sandbox.metadata?.[OWNER_KEY] !== c.var.auth.requireUser().id
    ) {
        throw new HTTPException(404, { message: `Sandbox ${id} not found` });
    }
    return sandbox;
}

// E2B's concurrency limit is per team, so each user may hold only a few.
async function requireCapacity(c: E2bContext) {
    const query = new URLSearchParams({
        metadata: `${OWNER_KEY}=${c.var.auth.requireUser().id}`,
        state: "running",
        limit: String(MAX_RUNNING_PER_USER),
    });
    const response = await e2b(c.env, `/v2/sandboxes?${query}`);
    if (!response.ok) throw await upstreamError(response);
    if ((await response.json<unknown[]>()).length >= MAX_RUNNING_PER_USER) {
        throw new HTTPException(429, {
            message: `At most ${MAX_RUNNING_PER_USER} sandboxes can run at once. Kill or pause one first.`,
        });
    }
}

type Lease = { cost: number; price: number };

// E2B's list cost for `seconds` of this sandbox, and what the caller pays.
function lease(sandbox: SandboxDetail, seconds: number): Lease {
    const cost =
        seconds *
        (sandbox.cpuCount * VCPU_SECOND +
            (sandbox.memoryMB / 1024) * GIB_SECOND);
    return {
        cost: roundPollenLedgerAmount(cost),
        price: roundPollenLedgerAmount(cost * PRICE_MULTIPLIER),
    };
}

async function charge(c: E2bContext, { cost, price }: Lease, startTime: Date) {
    let deduction: Awaited<ReturnType<typeof handleBalanceDeduction>> | null =
        null;
    try {
        deduction = await handleBalanceDeduction({
            db: drizzle(c.env.DB) as unknown as Parameters<
                typeof handleBalanceDeduction
            >[0]["db"],
            isBilledUsage: true,
            totalPrice: price,
            userId: c.var.auth.requireUser().id,
            apiKeyId: c.var.auth.apiKey?.id,
            apiKeyPollenBalance: c.var.auth.apiKey?.pollenBalance,
            // requireFunds checked the key budget; nothing was reserved.
            apiKeyReservedAmount: 0,
            byopClientKeyId: c.var.auth.apiKey?.byopClientKeyId,
            modelPaidOnly: false,
            questPollenOnly: c.var.auth.apiKey?.questPollenOnly,
        });
    } catch (error) {
        c.var.log.error("Sandbox lease charge failed: {error}", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    const endTime = new Date();
    c.executionCtx.waitUntil(
        sendToTinybird(
            {
                id: crypto.randomUUID(),
                requestId: c.get("requestId"),
                requestPath: c.req.path,
                startTime,
                endTime,
                responseTime: endTime.getTime() - startTime.getTime(),
                responseStatus: 200,
                environment: c.env.ENVIRONMENT,
                eventType: "sandbox.lease",
                ...requestIdentity(c.var.auth),
                ...(deduction?.payerBucket
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
                totalCost: cost,
                totalPrice: deduction?.billedPrice ?? 0,
                devPrice: price,
                markupRate: deduction?.markup?.markupRate ?? 0,
            },
            c.env.TINYBIRD_INGEST_URL,
            c.env.TINYBIRD_INGEST_TOKEN,
            c.var.log,
        ),
    );
}

// Timeout and connect end the lease at now + timeout (connect never shortens
// a running sandbox's lease). The caller pays in advance for the seconds past
// the running sandbox's current lease. Pausing or shortening a lease gives up
// the rest of it: nothing is refunded.
async function extendLease(
    c: E2bContext,
    sandbox: SandboxDetail,
    timeout: unknown,
) {
    const startTime = new Date();
    if (typeof timeout !== "number" || !(timeout >= 0)) {
        throw new HTTPException(400, {
            message: "timeout must be a number of seconds",
        });
    }
    const now = startTime.getTime();
    const running = sandbox.state === "running";
    const paidUntil = running ? Math.max(Date.parse(sandbox.endAt), now) : now;
    // E2B silently shortens a lease past the end of the run, so pay only up
    // to it. Resuming a paused sandbox starts a new run.
    const runEnd = (running ? Date.parse(sandbox.startedAt) : now) + MAX_RUN_MS;
    const endAt = Math.min(now + timeout * 1000, runEnd);
    const bill = lease(sandbox, Math.max(0, endAt - paidUntil) / 1000);
    if (bill.price > 0) await requireFunds(c, bill.price, "sandbox lease");
    const response = await e2b(c.env, c.req.path.slice(E2B_PATH.length), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeout }),
    });
    if (response.ok && bill.price > 0) await charge(c, bill, startTime);
    return new Response(response.body, response);
}

// Writes polli's login into a new sandbox: a key of its own, created with the
// caller's key through enter's key API, as `polli harness ... on` creates one.
// envd, the agent in every sandbox, writes the file as `user`.
async function logIn(c: E2bContext, sandbox: CreatedSandbox) {
    const created = await c.env.ENTER.fetch(
        `${PUBLIC_URLS.enter.production}/api/account/keys`,
        {
            method: "POST",
            headers: {
                "authorization": `Bearer ${extractApiKey(c.req.raw)}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: `polli-sandbox-${sandbox.sandboxID}`,
                type: "secret",
                accountPermissions: POLLI_PERMISSIONS,
            }),
        },
    );
    if (!created.ok) {
        throw new Error(
            `Key creation returned ${created.status}: ${(await created.text()).slice(0, 300)}`,
        );
    }
    const { key } = await created.json<{ key: string }>();
    // polli keeps a staging login apart from a production one.
    const file =
        c.env.ENVIRONMENT === "production"
            ? "credentials.json"
            : "credentials.staging.json";
    const form = new FormData();
    form.append(
        "file",
        new Blob([JSON.stringify({ apiKey: key, keyType: "sk" })]),
        file,
    );
    const query = new URLSearchParams({
        path: `/home/user/.pollinations/${file}`,
        username: "user",
    });
    const response = await fetch(
        `https://49983-${sandbox.sandboxID}.${sandbox.domain || "e2b.app"}/files?${query}`,
        {
            method: "POST",
            headers: { "x-access-token": sandbox.envdAccessToken ?? "" },
            body: form,
        },
    );
    if (!response.ok) throw await upstreamError(response);
}

async function ownerOnly(c: E2bContext) {
    await ownedSandbox(c);
    return forward(c);
}

async function requireSandboxAccess(c: E2bContext, next: Next) {
    if (!c.env.E2B_API_KEY) {
        throw new HTTPException(503, {
            message: "Sandboxes are not configured",
        });
    }
    c.var.auth.requireUser();
    const apiKey = c.var.auth.apiKey;
    if (!hasAccountPermission(apiKey, "machines")) {
        throw new HTTPException(403, {
            message: `API key does not have 'account:machines' permission. Manage key permissions at ${keyPermissionsLink(apiKey?.id ?? "", c.env.ENVIRONMENT)}`,
        });
    }
    await next();
}

// E2B's API under a Pollinations key: a caller's own, or for the keeper the
// key that created a kept sandbox.
const sandboxApi = (...authenticate: MiddlewareHandler[]) =>
    new Hono<Env>()
        .use("*", ...authenticate, requireSandboxAccess)
        // E2B's CLI still creates and connects through the deprecated v1 paths,
        // which take the same bodies as v2.
        .on("POST", ["/sandboxes", "/v2/sandboxes"], async (c) => {
            const startTime = new Date();
            const body = await readJson<NewSandbox>(c);
            if (body.autoResume?.enabled) {
                throw new HTTPException(400, {
                    message:
                        "autoResume is not supported. Resume a paused sandbox with connect.",
                });
            }
            if (body.iam || body.volumeMounts?.length) {
                throw new HTTPException(400, {
                    message: "iam and volumeMounts are not supported.",
                });
            }
            const timeout = body.timeout ?? 0;
            const keep =
                timeout * 1000 > MAX_RUN_MS && timeout <= MAX_TIMEOUT_SECONDS;
            const payer = c.var.auth.apiKey?.id;
            if (keep && !payer) {
                throw new HTTPException(400, {
                    message:
                        "A sandbox with a timeout over 24 hours is renewed with the API key that creates it. Create it with a key.",
                });
            }
            // An empty wallet cannot pay for any lease.
            await requireFunds(c, 0, "sandbox lease");
            await requireCapacity(c);

            const response = await e2b(
                c.env,
                c.req.path.slice(E2B_PATH.length),
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        ...body,
                        ...(keep && { timeout: KEEP_LEASE_SECONDS }),
                        // Otherwise envd lets anyone who knows the sandbox ID run
                        // commands and read files in it.
                        secure: true,
                        metadata: {
                            ...body.metadata,
                            [OWNER_KEY]: c.var.auth.requireUser().id,
                            ...(keep && {
                                [UNTIL_KEY]: new Date(
                                    startTime.getTime() + timeout * 1000,
                                ).toISOString(),
                                [PAYER_KEY]: payer,
                                [ENV_KEY]: c.env.ENVIRONMENT,
                            }),
                        },
                    }),
                },
            );
            if (!response.ok) return new Response(response.body, response);
            const created = await response.json<CreatedSandbox>();

            // The template sets the size, so the price is known only now.
            let bill: Lease;
            try {
                const sandbox = await getSandbox(c, created.sandboxID);
                if (!sandbox) {
                    throw new HTTPException(502, {
                        message: `Sandbox ${created.sandboxID} vanished after create`,
                    });
                }
                bill = lease(
                    sandbox,
                    (Date.parse(sandbox.endAt) -
                        Date.parse(sandbox.startedAt)) /
                        1000,
                );
                await requireFunds(c, bill.price, "sandbox lease");
            } catch (error) {
                // Never leave an unpaid sandbox running.
                await e2b(c.env, `/sandboxes/${created.sandboxID}`, {
                    method: "DELETE",
                });
                throw error;
            }
            await charge(c, bill, startTime);
            if (body.templateID === LOGGED_IN_TEMPLATE) {
                try {
                    await logIn(c, created);
                } catch (error) {
                    // The sandbox still works; `polli auth login` in it logs in.
                    c.var.log.error("Sandbox login failed: {error}", {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            }
            return c.json(created, 201);
        })
        .get("/v2/sandboxes", (c) => {
            // Listing is scoped to the caller's sandboxes, whatever they filter.
            const url = new URL(c.req.url);
            const metadata = new URLSearchParams(
                url.searchParams.get("metadata") ?? "",
            );
            metadata.set(OWNER_KEY, c.var.auth.requireUser().id);
            url.searchParams.set("metadata", metadata.toString());
            return forward(c, url.search);
        })
        .get("/sandboxes/:id", async (c) => c.json(await ownedSandbox(c)))
        .delete("/sandboxes/:id", ownerOnly)
        .get("/sandboxes/:id/metrics", ownerOnly)
        // `e2b sandbox logs` reads this deprecated v1 path.
        .get("/sandboxes/:id/logs", ownerOnly)
        .post("/sandboxes/:id/pause", ownerOnly)
        .put("/sandboxes/:id/network", ownerOnly)
        .post("/sandboxes/:id/timeout", async (c) => {
            const sandbox = await ownedSandbox(c);
            const { timeout } = await readJson<{ timeout: number }>(c);
            return extendLease(c, sandbox, timeout);
        })
        .on(
            "POST",
            ["/sandboxes/:id/connect", "/v2/sandboxes/:id/connect"],
            async (c) => {
                const sandbox = await ownedSandbox(c);
                if (sandbox.state === "paused") await requireCapacity(c);
                const { timeout } = await readJson<{ timeout: number }>(c);
                return extendLease(
                    c,
                    sandbox,
                    timeout ?? DEFAULT_TIMEOUT_SECONDS,
                );
            },
        )
        // Everything else (templates, snapshots, forks, volumes, secrets,
        // webhooks, ...) stays closed until someone reviews how it is billed.
        .all("*", () => {
            throw new HTTPException(403, {
                message:
                    "This E2B endpoint is not available through Pollinations.",
            });
        })
        // E2B's SDKs read `message` from the top level of an error body.
        .onError(async (error, c) => {
            const response = await handleError(error, c);
            const { error: details } = await response.json<{
                error: { message: string };
            }>();
            return c.json(
                { code: response.status, message: details.message },
                response.status as ContentfulStatusCode,
            );
        });

export const e2bRoutes = sandboxApi(edgeRateLimit, auth());

// Running kept sandboxes of this environment.
async function keptSandboxes(env: CloudflareBindings) {
    const query = new URLSearchParams({
        metadata: new URLSearchParams({
            [ENV_KEY]: env.ENVIRONMENT,
        }).toString(),
        state: "running",
        limit: "100",
    });
    const sandboxes: SandboxDetail[] = [];
    for (;;) {
        const response = await e2b(env, `/v2/sandboxes?${query}`);
        if (!response.ok) throw await upstreamError(response);
        sandboxes.push(...(await response.json<SandboxDetail[]>()));
        const next = response.headers.get("x-next-token");
        if (!next) return sandboxes;
        query.set("nextToken", next);
    }
}

// Read again for every renewal, so deleting the key, letting it expire,
// removing its machines permission or banning the account ends them.
async function loadPayer(
    env: CloudflareBindings,
    apiKeyId = "",
): Promise<GenerationAuthSnapshot | null> {
    const result = await loadActiveApiKeyAuthResult({
        apiKeyId,
        rawApiKey: "",
        env,
    }).catch(() => null);
    if (!result?.user) return null;
    const { rawKey: _rawKey, ...apiKey } = result.apiKey;
    return { user: { id: result.user.id, tier: result.user.tier }, apiKey };
}

/**
 * Renews each kept sandbox whose lease is about to end, for up to an hour and
 * never past its timeout, through this API as the key that created it: the
 * renewal is checked and charged like the owner's own. An unpaid lease ends
 * as the sandbox's `onTimeout` says; a paused sandbox that connect resumes is
 * kept again. Before E2B would end its 24-hour run, a pause and resume starts
 * a new one instead, giving up the rest of the lease like any pause.
 */
export async function keepSandboxes(
    env: CloudflareBindings,
    ctx: ExecutionContext,
) {
    if (!env.E2B_API_KEY) return;
    await ensureConfigured({
        level: env.LOG_LEVEL || "debug",
        format: env.LOG_FORMAT || "text",
    });
    const log = getLogger(["gen", "sandbox-keeper"]);
    const now = Date.now();
    const due = (await keptSandboxes(env)).flatMap((sandbox) => {
        const endAt = Date.parse(sandbox.endAt);
        const renewTo = Math.min(
            now + KEEP_LEASE_SECONDS * 1000,
            Date.parse(sandbox.metadata?.[UNTIL_KEY] ?? ""),
        );
        return endAt - now < KEEP_RENEW_WITHIN_MS && renewTo > endAt
            ? [{ ...sandbox, timeout: Math.ceil((renewTo - now) / 1000) }]
            : [];
    });
    await Promise.all(
        due.map(async ({ sandboxID, startedAt, metadata, timeout }) => {
            const payer = await loadPayer(env, metadata?.[PAYER_KEY]);
            if (!payer) {
                log.info("Not renewing sandbox {sandboxID}: its key is gone", {
                    sandboxID,
                });
                return;
            }
            const api = new Hono<Env>()
                .use("*", requestId())
                .use("*", logger)
                .route(E2B_PATH, sandboxApi(authFromSnapshot(payer)));
            const post = (action: string, body = {}) =>
                api.fetch(
                    new Request(
                        `${PUBLIC_URLS.gen.production}${E2B_PATH}/sandboxes/${sandboxID}/${action}`,
                        {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify(body),
                        },
                    ),
                    env,
                    ctx,
                );
            const restart =
                Date.parse(startedAt) + MAX_RUN_MS < now + timeout * 1000;
            const responses = [
                ...(restart ? [await post("pause")] : []),
                await post(restart ? "connect" : "timeout", { timeout }),
            ];
            const failed = responses.find((response) => !response.ok);
            if (failed) {
                log.info("Not renewing sandbox {sandboxID}: {status} {body}", {
                    sandboxID,
                    status: failed.status,
                    body: (await failed.text()).slice(0, 300),
                });
            }
        }),
    );
}
