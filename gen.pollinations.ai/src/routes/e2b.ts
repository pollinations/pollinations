import { getUserBalance, payerBucketToMeter } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { handleError } from "@shared/error.ts";
import { sendToTinybird } from "@shared/events.ts";
import { PaymentRequiredError } from "@shared/http/payment-required-error.ts";
import {
    priceToEventParams,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono, type Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import { auth, keyPermissionsLink } from "@/middleware/auth.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { requestIdentity } from "@/middleware/track.ts";

// E2B's control API, forwarded under Pollinations keys. The SDKs talk to the
// sandboxes themselves (commands, files, ports) directly at E2B with the
// per-sandbox tokens these responses carry.
const E2B_API = "https://api.e2b.app";
// One E2B team runs every user's sandboxes; this metadata key names the owner.
const OWNER_KEY = "pollinations_user";
const MAX_RUNNING_PER_USER = 3;
// E2B list prices per second, in pollen (1 pollen ≈ $1).
const VCPU_SECOND = 0.000014;
const GIB_SECOND = 0.0000045;
// E2B's lease when connect omits `timeout`.
const DEFAULT_TIMEOUT_SECONDS = 300;

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
    metadata?: Record<string, string>;
    autoResume?: { enabled?: boolean };
    iam?: unknown;
    volumeMounts?: unknown[];
};

type E2bContext = Context<Env>;

function e2b(c: E2bContext, path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("x-api-key", c.env.E2B_API_KEY ?? "");
    return fetch(`${E2B_API}${path}`, { ...init, headers });
}

// Relays the caller's request with the team key in place of theirs.
async function forward(c: E2bContext, search = new URL(c.req.url).search) {
    const body = c.req.method === "GET" ? "" : await c.req.text();
    const response = await e2b(c, c.req.path.slice("/e2b".length) + search, {
        method: c.req.method,
        ...(body && { headers: { "content-type": "application/json" }, body }),
    });
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
    const response = await e2b(c, `/sandboxes/${encodeURIComponent(id)}`);
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
    const response = await e2b(c, `/v2/sandboxes?${query}`);
    if (!response.ok) throw await upstreamError(response);
    if ((await response.json<unknown[]>()).length >= MAX_RUNNING_PER_USER) {
        throw new HTTPException(429, {
            message: `At most ${MAX_RUNNING_PER_USER} sandboxes can run at once. Kill or pause one first.`,
        });
    }
}

// E2B forgets a lease when its sandbox pauses (it then reports the pause time
// as endAt), so gen keeps the time each sandbox is paid until. Keys expire
// once that time has passed. A lost write or a stale read only charges again;
// it never hands out unpaid time.
const paidUntilKey = (sandboxID: string) => `e2b-paid-until:${sandboxID}`;

async function readPaidUntil(
    c: E2bContext,
    sandbox: SandboxDetail,
    now: number,
): Promise<number> {
    const stored = await c.env.KV.get(paidUntilKey(sandbox.sandboxID)).catch(
        () => null,
    );
    // A running sandbox's lease was paid too, which covers a stale read.
    const leaseEnd =
        sandbox.state === "running" ? Date.parse(sandbox.endAt) : 0;
    return Math.max(Number(stored) || 0, leaseEnd, now);
}

async function savePaidUntil(
    c: E2bContext,
    sandboxID: string,
    paidUntil: number,
) {
    // KV expirations must be at least 60 s ahead.
    const expiration = Math.ceil(
        Math.max(paidUntil, Date.now() + 60_000) / 1000,
    );
    await c.env.KV.put(paidUntilKey(sandboxID), String(paidUntil), {
        expiration,
    }).catch(() => {});
}

function leasePrice(sandbox: SandboxDetail, seconds: number): number {
    return roundPollenLedgerAmount(
        seconds *
            (sandbox.cpuCount * VCPU_SECOND +
                (sandbox.memoryMB / 1024) * GIB_SECOND),
    );
}

async function requireFunds(c: E2bContext, price: number) {
    const apiKey = c.var.auth.apiKey;
    if (
        apiKey &&
        typeof apiKey.pollenBalance === "number" &&
        apiKey.pollenBalance < price
    ) {
        throw new PaymentRequiredError(
            "KEY_BUDGET_EXHAUSTED",
            `API key budget too low for this sandbox lease (${price} pollen). Increase the key budget at ${keyPermissionsLink(apiKey.id, c.env.ENVIRONMENT)}; topping up the wallet does not increase this limit.`,
        );
    }
    const balance = await getUserBalance(
        drizzle(c.env.DB),
        c.var.auth.requireUser().id,
    );
    if (!canCoverEstimatedCharge(balance, price)) {
        throw new PaymentRequiredError(
            "INSUFFICIENT_BALANCE",
            `Insufficient balance for this sandbox lease (${price} pollen). Top up at https://enter.pollinations.ai/top-up.`,
        );
    }
}

async function charge(c: E2bContext, price: number, startTime: Date) {
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
                totalCost: price,
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
// what the sandbox is already paid until, so shortening, pausing and resuming
// within paid time cost nothing. Nothing is refunded.
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
    const paidUntil = await readPaidUntil(c, sandbox, now);
    const endAt = now + timeout * 1000;
    const price = leasePrice(sandbox, Math.max(0, endAt - paidUntil) / 1000);
    if (price > 0) await requireFunds(c, price);
    const response = await forward(c);
    if (response.ok && price > 0) {
        await charge(c, price, startTime);
        await savePaidUntil(c, sandbox.sandboxID, endAt);
    }
    return response;
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
    if (!apiKey?.permissions?.account?.includes("machines")) {
        throw new HTTPException(403, {
            message: `API key does not have 'account:machines' permission. Manage key permissions at ${keyPermissionsLink(apiKey?.id ?? "", c.env.ENVIRONMENT)}`,
        });
    }
    await next();
}

export const e2bRoutes = new Hono<Env>()
    .use("*", edgeRateLimit, auth(), requireSandboxAccess)
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
        // An empty wallet cannot pay for any lease.
        await requireFunds(c, 0);
        await requireCapacity(c);

        const response = await e2b(c, c.req.path.slice("/e2b".length), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                ...body,
                metadata: {
                    ...body.metadata,
                    [OWNER_KEY]: c.var.auth.requireUser().id,
                },
            }),
        });
        if (!response.ok) return new Response(response.body, response);
        const created = await response.json<{ sandboxID: string }>();

        // The template sets the size, so the price is known only now.
        let price: number;
        let paidUntil: number;
        try {
            const sandbox = await getSandbox(c, created.sandboxID);
            if (!sandbox) {
                throw new HTTPException(502, {
                    message: `Sandbox ${created.sandboxID} vanished after create`,
                });
            }
            paidUntil = Date.parse(sandbox.endAt);
            price = leasePrice(
                sandbox,
                (paidUntil - Date.parse(sandbox.startedAt)) / 1000,
            );
            await requireFunds(c, price);
        } catch (error) {
            // Never leave an unpaid sandbox running.
            await e2b(c, `/sandboxes/${created.sandboxID}`, {
                method: "DELETE",
            });
            throw error;
        }
        await charge(c, price, startTime);
        await savePaidUntil(c, created.sandboxID, paidUntil);
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
            return extendLease(c, sandbox, timeout ?? DEFAULT_TIMEOUT_SECONDS);
        },
    )
    // Everything else (templates, snapshots, forks, volumes, secrets,
    // webhooks, ...) stays closed until someone reviews how it is billed.
    .all("*", () => {
        throw new HTTPException(403, {
            message: "This E2B endpoint is not available through Pollinations.",
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
