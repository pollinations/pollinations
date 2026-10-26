import { getLogger } from "@logtape/logtape";
import { hasAccountPermission } from "@shared/auth/account-permissions.ts";
import {
    BannedAccountError,
    extractApiKey,
    loadActiveApiKeyAuthResult,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { isUserBanned } from "@shared/auth/ban.ts";
import { payerBucketToMeter } from "@shared/billing/balance.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { bytesToHex } from "@shared/client-ip.ts";
import { apikey, user } from "@shared/db/better-auth.ts";
import { sandboxKeep, sandboxPort } from "@shared/db/sandbox.ts";
import { handleError } from "@shared/error.ts";
import { sendToTinybird } from "@shared/events.ts";
import { ensureConfigured } from "@shared/logger.ts";
import { requestId } from "@shared/middleware/request-id.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import {
    priceToEventParams,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { and, eq, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono, type MiddlewareHandler, type Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import {
    auth,
    authFromSnapshot,
    type GenerationAuthSnapshot,
} from "@/middleware/auth.ts";
import { logger } from "@/middleware/logger.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { requestIdentity } from "@/middleware/track.ts";
import { requireAccountFunds } from "@/utils/generation-access.ts";
import { permissionRequired } from "@/utils/refusals.ts";
import {
    AZURE_GIB_SECOND,
    AZURE_TEMPLATES,
    AZURE_VCPU_SECOND,
    azureConfigured,
    azureE2b,
    azureLeaseEnd,
    isAzurePath,
    isAzureSandbox,
    OWNER_KEY,
    proxyEnvd,
    sandboxHost,
} from "./azure-sandboxes.ts";
import { sandboxDocs } from "./e2b-docs.ts";

// E2B's control API, forwarded under Pollinations keys. The SDKs talk to the
// sandboxes themselves (commands, files, ports) directly at E2B with the
// per-sandbox tokens these responses carry. Sandboxes of the Azure templates
// run on Azure instead, which answers the same calls (azure-sandboxes.ts).
const E2B_API = "https://api.e2b.app";
// Gen serves E2B's API under this experimental path; the rest of each path is E2B's.
export const E2B_PATH = "/alpha/e2b";
const MAX_RUNNING_PER_USER = 8;
// E2B ends a sandbox's run 24 hours after it starts or resumes.
const MAX_RUN_MS = 24 * 60 * 60_000;
type Provider = "e2b" | "azure";
type Rates = { vcpuSecond: number; gibSecond: number };
// What each provider charges us per second, in pollen (1 pollen ≈ $1): E2B's
// list prices, and Azure's for a running box.
const RATES: Record<Provider, Rates> = {
    e2b: { vcpuSecond: 0.000014, gibSecond: 0.0000045 },
    azure: { vcpuSecond: AZURE_VCPU_SECOND, gibSecond: AZURE_GIB_SECOND },
};
// The share of its provider's rate a caller pays. E2B's is a launch promo: set
// it back to 1 when the promo week ends.
const PRICE_MULTIPLIER: Record<Provider, number> = { e2b: 0.25, azure: 0.25 };
const perSecond = (
    rates: Rates,
    size: { cpuCount: number; memoryMB: number },
) =>
    size.cpuCount * rates.vcpuSecond + (size.memoryMB / 1024) * rates.gibSecond;
// The rates callers pay, and each template's size with them.
const callerRates = (provider: Provider) => ({
    vcpuSecond: RATES[provider].vcpuSecond * PRICE_MULTIPLIER[provider],
    gibSecond: RATES[provider].gibSecond * PRICE_MULTIPLIER[provider],
});
const priced = (sizes: typeof TEMPLATE_SIZES, provider: Provider) =>
    Object.fromEntries(
        Object.entries(sizes).map(([id, size]) => [
            id,
            { ...size, ...callerRates(provider) },
        ]),
    );
// E2B's lease when connect omits `timeout`.
const DEFAULT_TIMEOUT_SECONDS = 300;
// Gen logs polli in inside these templates, one image with polli and the
// coding harnesses in two sizes, with a key of the sandbox's own. Exact names
// only: E2B resolves them to our team's templates. Their sizes, as built, let
// the dashboard price a create before E2B reports the size.
const TEMPLATE_SIZES: Record<string, { cpuCount: number; memoryMB: number }> = {
    pollinations: { cpuCount: 2, memoryMB: 2048 },
    "pollinations-large": { cpuCount: 4, memoryMB: 8192 },
};
const LOGGED_IN_TEMPLATES = [
    ...Object.keys(TEMPLATE_SIZES),
    ...Object.keys(AZURE_TEMPLATES),
];
// What `polli auth login` asks for, except `keys`: every process in the box can
// read the login, and `keys` would let it raise any key's budget. polli's
// harnesses then use the login itself instead of keys of their own.
const POLLI_PERMISSIONS = ["profile", "usage", "machines"];
// E2B takes a timeout as 32-bit seconds.
const MAX_TIMEOUT_SECONDS = 2 ** 31 - 1;
// A timeout longer than 10 minutes keeps the sandbox: E2B gets 10 minutes at a
// time, and gen's cron, every 5 minutes, tops it back up to 10 minutes until
// then, past E2B's 24-hour run too. It pays with the key that set the timeout,
// or as the owner when the dashboard set it.
const KEEP_LEASE_SECONDS = 600;
// A request to a shared port wakes its sandbox, or extends a lease that ends
// within a minute, with a connect for E2B's default lease.
const WAKE_MARGIN_MS = 60_000;
// The cron's interval (wrangler.toml), and so the shortest idle timeout.
const CRON_SECONDS = 300;
// A kept sandbox whose CPU averages this much over the cron's last interval
// is busy: a long job (a render, a build) makes no requests. One busy core of
// 16 is 6%.
const BUSY_CPU_PCT = 5;
// A shared port's secret travels in this header unless the share names one,
// such as Telegram's X-Telegram-Bot-Api-Secret-Token.
const PORT_SECRET_HEADER = "X-Pollinations-Secret";

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
    autoPause?: boolean;
    autoResume?: { enabled?: boolean };
    // Not E2B's: see idleTimeoutOf.
    idleTimeout?: number;
    iam?: unknown;
    volumeMounts?: unknown[];
};

type CreatedSandbox = {
    sandboxID: string;
    domain?: string | null;
    envdAccessToken?: string;
    trafficAccessToken?: string | null;
};

type E2bContext = Context<Env>;

function e2b(env: CloudflareBindings, path: string, init: RequestInit = {}) {
    if (isAzurePath(path)) return azureE2b(env, path, init);
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
    env: CloudflareBindings,
    id: string,
): Promise<SandboxDetail | null> {
    const response = await e2b(env, `/sandboxes/${encodeURIComponent(id)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await upstreamError(response);
    return response.json<SandboxDetail>();
}

// Every per-sandbox call reads the sandbox first: that proves ownership and
// gives the lease and size a charge needs.
async function ownedSandbox(c: E2bContext): Promise<SandboxDetail> {
    const id = c.req.param("id") ?? "";
    const sandbox = await getSandbox(c.env, id);
    if (
        !sandbox ||
        sandbox.metadata?.[OWNER_KEY] !== c.var.auth.requireUser().id
    ) {
        throw new HTTPException(404, { message: `Sandbox ${id} not found` });
    }
    return sandbox;
}

// As on an E2B team with a longer limit, a kept sandbox's `endAt` says when
// its timeout ends, not when the 10 minutes paid so far do.
async function showKeeps(env: CloudflareBindings, sandboxes: SandboxDetail[]) {
    const running = sandboxes.filter((sandbox) => sandbox.state === "running");
    const keeps = running.length
        ? await drizzle(env.DB)
              .select()
              .from(sandboxKeep)
              .where(
                  inArray(
                      sandboxKeep.sandboxId,
                      running.map((sandbox) => sandbox.sandboxID),
                  ),
              )
        : [];
    const until = new Map(keeps.map((keep) => [keep.sandboxId, keep.until]));
    return sandboxes.map((sandbox) => {
        const end = sandbox.state === "running" && until.get(sandbox.sandboxID);
        return end ? { ...sandbox, endAt: end.toISOString() } : sandbox;
    });
}

// E2B's concurrency limit is per team, so each user may hold only a few, on
// E2B and Azure together.
async function requireCapacity(c: E2bContext) {
    const path = `/v2/sandboxes?${new URLSearchParams({
        metadata: `${OWNER_KEY}=${c.var.auth.requireUser().id}`,
        state: "running",
        limit: String(MAX_RUNNING_PER_USER),
    })}`;
    let running = 0;
    for (const response of await Promise.all([
        e2b(c.env, path),
        azureE2b(c.env, path),
    ])) {
        if (!response.ok) throw await upstreamError(response);
        running += (await response.json<unknown[]>()).length;
    }
    if (running >= MAX_RUNNING_PER_USER) {
        throw new HTTPException(429, {
            message: `At most ${MAX_RUNNING_PER_USER} sandboxes can run at once. Kill or pause one first.`,
        });
    }
}

type Lease = { cost: number; price: number; provider: Provider };

// What `seconds` of this sandbox costs us at its provider's rates, and what
// the caller pays.
function lease(sandbox: SandboxDetail, seconds: number): Lease {
    const provider = isAzureSandbox(sandbox.sandboxID) ? "azure" : "e2b";
    const cost = seconds * perSecond(RATES[provider], sandbox);
    return {
        cost: roundPollenLedgerAmount(cost),
        price: roundPollenLedgerAmount(cost * PRICE_MULTIPLIER[provider]),
        provider,
    };
}

async function charge(
    c: E2bContext,
    { cost, price, provider }: Lease,
    startTime: Date,
) {
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
            // requireAccountFunds checked the key budget; nothing was reserved.
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
                modelProviderUsed: provider,
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
    const paidUntil =
        sandbox.state === "running"
            ? Math.max(Date.parse(sandbox.endAt), now)
            : now;
    // E2B silently shortens a lease past the end of the run, so pay only up
    // to it; Azure's runs on to gen's next cron.
    const until = now + timeout * 1000;
    const endAt = isAzureSandbox(sandbox.sandboxID)
        ? azureLeaseEnd(until)
        : Math.min(until, runEnd(sandbox, now));
    const bill = lease(sandbox, Math.max(0, endAt - paidUntil) / 1000);
    if (bill.price > 0) await requireAccountFunds(c, bill.price);
    const response = await e2b(c.env, c.req.path.slice(E2B_PATH.length), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeout }),
    });
    if (response.ok && bill.price > 0) await charge(c, bill, startTime);
    return new Response(response.body, response);
}

// When E2B ends the sandbox's run: 24 hours after it started, or from now for
// a resume, which starts a new run. Azure's runs never end.
function runEnd(sandbox: SandboxDetail, now: number) {
    if (isAzureSandbox(sandbox.sandboxID)) return Number.POSITIVE_INFINITY;
    const running = sandbox.state === "running";
    return (running ? Date.parse(sandbox.startedAt) : now) + MAX_RUN_MS;
}

// When a keep that `timeout` asks for ends, if it is longer than a lease.
function keepUntil(timeout: unknown): Date | null {
    return typeof timeout === "number" &&
        timeout > KEEP_LEASE_SECONDS &&
        timeout <= MAX_TIMEOUT_SECONDS
        ? new Date(Date.now() + timeout * 1000)
        : null;
}

// Opt-in, for a kept E2B sandbox: the cron pauses it after `idleTimeout`
// seconds without activity and leaves the keep, so the next request to a
// shared port or connect resumes it. Without it, a keep runs until its
// timeout. It comes with the timeout that sets a keep; left out, a call keeps
// the keep's setting, as E2B's SDKs know nothing of it (undefined), and 0
// turns it off (null).
function idleTimeoutOf(
    idleTimeout: unknown,
    until: Date | null,
    azure: boolean,
) {
    if (idleTimeout === undefined) return undefined;
    if (!until) {
        throw new HTTPException(400, {
            message: `idleTimeout needs a timeout longer than ${KEEP_LEASE_SECONDS} seconds`,
        });
    }
    if (idleTimeout === 0) return null;
    if (
        typeof idleTimeout !== "number" ||
        !Number.isInteger(idleTimeout) ||
        idleTimeout < CRON_SECONDS ||
        idleTimeout > MAX_TIMEOUT_SECONDS
    ) {
        throw new HTTPException(400, {
            message: `idleTimeout must be 0 or a whole number of seconds, at least ${CRON_SECONDS}`,
        });
    }
    if (azure) {
        throw new HTTPException(400, {
            message: "Azure sandboxes have no idleTimeout.",
        });
    }
    return idleTimeout;
}

// A kept sandbox's lease: 10 minutes, or what is left of a longer one, which
// E2B's timeout would otherwise cut short. Rounded down, so it never bills a
// fraction of a second already paid.
function keepLease(sandbox: SandboxDetail) {
    const left =
        sandbox.state === "running"
            ? (Date.parse(sandbox.endAt) - Date.now()) / 1000
            : 0;
    return Math.max(KEEP_LEASE_SECONDS, Math.floor(left));
}

async function setKeep(
    c: E2bContext,
    sandboxId: string,
    until: Date | null,
    idleTimeout?: number | null,
) {
    const db = drizzle(c.env.DB);
    if (!until) {
        await db
            .delete(sandboxKeep)
            .where(eq(sandboxKeep.sandboxId, sandboxId));
        return;
    }
    // Without a key (the dashboard's session), the owner pays the renewals.
    // An undefined idleTimeout leaves the column as it is.
    const keep = {
        apiKeyId: c.var.auth.apiKey?.id ?? null,
        until,
        idleTimeout,
        activeAt: new Date(),
    };
    await db
        .insert(sandboxKeep)
        .values({ sandboxId, ...keep })
        .onConflictDoUpdate({ target: sandboxKeep.sandboxId, set: keep });
}

// ponytail: a per-isolate throttle, so a busy sandbox writes its activity to
// D1 about once a minute per isolate, well inside the shortest idle timeout.
const noted = new Map<string, number>();

// Records activity on a kept sandbox, for its idle timeout.
async function noteActivity(env: CloudflareBindings, sandboxID: string) {
    const now = Date.now();
    if (now - (noted.get(sandboxID) ?? 0) < 60_000) return;
    noted.set(sandboxID, now);
    await drizzle(env.DB)
        .update(sandboxKeep)
        .set({ activeAt: new Date(now) })
        .where(eq(sandboxKeep.sandboxId, sandboxID));
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
        `https://${sandboxHost(sandbox.sandboxID, 49983, sandbox.domain)}/files?${query}`,
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
        throw permissionRequired(
            c,
            { permission: "machines" },
            "API key does not have 'account:machines' permission.",
        );
    }
    await next();
}

// E2B's API under a Pollinations key: a caller's own, or for the keeper the
// key that set a kept sandbox's timeout. The keeper's own renewals and pauses
// leave the keep as it is.
const sandboxApi = (keeper: boolean, ...authenticate: MiddlewareHandler[]) =>
    new Hono<Env>()
        .use("*", ...authenticate, requireSandboxAccess)
        // E2B's CLI still creates and connects through the deprecated v1 paths,
        // which take the same bodies as v2.
        .post("/sandboxes", sandboxDocs.createV1)
        .post("/v2/sandboxes", sandboxDocs.create)
        .on("POST", ["/sandboxes", "/v2/sandboxes"], async (c) => {
            const startTime = new Date();
            const { idleTimeout, ...body } = await readJson<NewSandbox>(c);
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
            const azure = Boolean(AZURE_TEMPLATES[body.templateID ?? ""]);
            const until = keepUntil(body.timeout);
            const idle = idleTimeoutOf(idleTimeout, until, azure);
            // An empty wallet cannot pay for any lease.
            await requireAccountFunds(c, 0);
            await requireCapacity(c);

            const upstream = azure ? azureE2b : e2b;
            const response = await upstream(
                c.env,
                c.req.path.slice(E2B_PATH.length),
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        ...body,
                        // A lease that runs out pauses the sandbox, as polli and
                        // the dashboard ask; E2B's SDKs omit this unless told
                        // `lifecycle.onTimeout`, and E2B then kills it.
                        autoPause: body.autoPause ?? true,
                        ...(until && { timeout: KEEP_LEASE_SECONDS }),
                        // Otherwise envd lets anyone who knows the sandbox ID run
                        // commands and read files in it.
                        secure: true,
                        metadata: {
                            ...body.metadata,
                            [OWNER_KEY]: c.var.auth.requireUser().id,
                        },
                    }),
                },
            );
            if (!response.ok) return new Response(response.body, response);
            const created = await response.json<CreatedSandbox>();

            // The template sets the size, so the price is known only now.
            let bill: Lease;
            try {
                const sandbox = await getSandbox(c.env, created.sandboxID);
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
                await requireAccountFunds(c, bill.price);
                if (until) await setKeep(c, created.sandboxID, until, idle);
            } catch (error) {
                // Never leave an unpaid sandbox running.
                await e2b(c.env, `/sandboxes/${created.sandboxID}`, {
                    method: "DELETE",
                });
                throw error;
            }
            await charge(c, bill, startTime);
            if (LOGGED_IN_TEMPLATES.includes(body.templateID ?? "")) {
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
        .get("/v2/sandboxes", sandboxDocs.list, async (c) => {
            // Listing is scoped to the caller's sandboxes, whatever they filter.
            const url = new URL(c.req.url);
            const metadata = new URLSearchParams(
                url.searchParams.get("metadata") ?? "",
            );
            metadata.set(OWNER_KEY, c.var.auth.requireUser().id);
            url.searchParams.set("metadata", metadata.toString());
            // Azure's sandboxes come with the first page.
            const [response, azure] = await Promise.all([
                forward(c, url.search),
                url.searchParams.has("nextToken")
                    ? null
                    : azureE2b(c.env, `/v2/sandboxes${url.search}`),
            ]);
            if (!response.ok) return response;
            if (azure && !azure.ok) throw await upstreamError(azure);
            const sandboxes = [
                ...(await response.json<SandboxDetail[]>()),
                ...(azure ? await azure.json<SandboxDetail[]>() : []),
            ];
            const headers = new Headers(response.headers);
            headers.delete("content-length");
            return new Response(
                JSON.stringify(await showKeeps(c.env, sandboxes)),
                { status: response.status, headers },
            );
        })
        .get("/sandboxes/:id", sandboxDocs.get, async (c) => {
            const [sandbox] = await showKeeps(c.env, [await ownedSandbox(c)]);
            return c.json(sandbox);
        })
        .delete("/sandboxes/:id", sandboxDocs.delete, ownerOnly)
        .get("/sandboxes/:id/metrics", sandboxDocs.metrics, ownerOnly)
        // `e2b sandbox logs` reads this deprecated v1 path.
        .get("/sandboxes/:id/logs", sandboxDocs.logs, ownerOnly)
        // A pause ends a keep, as E2B's timeout would; a timeout or connect
        // longer than 10 minutes starts it again.
        .post("/sandboxes/:id/pause", sandboxDocs.pause, async (c) => {
            const response = await ownerOnly(c);
            if (response.ok && !keeper) {
                await setKeep(c, c.req.param("id"), null, null);
            }
            return response;
        })
        .put("/sandboxes/:id/network", sandboxDocs.network, ownerOnly)
        // Like E2B's, a new timeout replaces the old one, kept or not.
        .post("/sandboxes/:id/timeout", sandboxDocs.timeout, async (c) => {
            const sandbox = await ownedSandbox(c);
            const { timeout, idleTimeout } = await readJson<{
                timeout: number;
                idleTimeout: number;
            }>(c);
            const until = keepUntil(timeout);
            const idle = idleTimeoutOf(
                idleTimeout,
                until,
                isAzureSandbox(sandbox.sandboxID),
            );
            const response = await extendLease(
                c,
                sandbox,
                until ? keepLease(sandbox) : timeout,
            );
            if (response.ok && !keeper) {
                await setKeep(c, sandbox.sandboxID, until, idle);
            }
            return response;
        })
        .post("/sandboxes/:id/connect", sandboxDocs.connectV1)
        .post("/v2/sandboxes/:id/connect", sandboxDocs.connect)
        .on(
            "POST",
            ["/sandboxes/:id/connect", "/v2/sandboxes/:id/connect"],
            async (c) => {
                const sandbox = await ownedSandbox(c);
                if (sandbox.state === "paused") await requireCapacity(c);
                const { timeout, idleTimeout } = await readJson<{
                    timeout: number;
                    idleTimeout: number;
                }>(c);
                const until = keepUntil(timeout);
                const idle = idleTimeoutOf(
                    idleTimeout,
                    until,
                    isAzureSandbox(sandbox.sandboxID),
                );
                const response = await extendLease(
                    c,
                    sandbox,
                    until
                        ? keepLease(sandbox)
                        : (timeout ?? DEFAULT_TIMEOUT_SECONDS),
                );
                // Connect never shortens a lease, so it never ends a keep. Any
                // other connect by the owner (polli ssh renews this way) is
                // activity; the cron's and a wake's are not.
                if (response.ok && until) {
                    await setKeep(c, sandbox.sandboxID, until, idle);
                } else if (response.ok && !keeper) {
                    await noteActivity(c.env, sandbox.sandboxID);
                }
                return response;
            },
        )
        // Not E2B's: serves a port at https://<port>-<id>.pollinations.app,
        // where a request that carries the share's secret wakes the sandbox.
        // Like a keep, the key that shares it pays the wakes, or the owner
        // when the dashboard shared it.
        .put("/sandboxes/:id/ports/:port", sandboxDocs.sharePort, async (c) => {
            const suffix = c.env.SITES_HOST_SUFFIX;
            if (!suffix) {
                throw new HTTPException(503, {
                    message: "Sandbox ports are not configured",
                });
            }
            const { sandboxID } = await ownedSandbox(c);
            if (isAzureSandbox(sandboxID)) {
                throw new HTTPException(400, {
                    message: "Only E2B sandboxes can share a port.",
                });
            }
            const port = sharedPort(c.req.param("port"));
            const { secret, header = PORT_SECRET_HEADER } = await readJson<{
                secret: string;
                header: string;
            }>(c);
            if (
                typeof secret !== "string" ||
                !/^[\x21-\x7e]{16,256}$/.test(secret) ||
                typeof header !== "string" ||
                !/^x-[a-z0-9-]{1,100}$/i.test(header)
            ) {
                throw new HTTPException(400, {
                    message: `A shared port needs a secret of 16 to 256 visible ASCII characters, and optionally the X- header that carries it (${PORT_SECRET_HEADER} if not given).`,
                });
            }
            const share = {
                apiKeyId: c.var.auth.apiKey?.id ?? null,
                header: header.toLowerCase(),
                secretHash: await sha256(secret),
            };
            wokenPorts.delete(`${port}-${sandboxID}`);
            await drizzle(c.env.DB)
                .insert(sandboxPort)
                .values({ sandboxId: sandboxID, port, ...share })
                .onConflictDoUpdate({
                    target: [sandboxPort.sandboxId, sandboxPort.port],
                    set: share,
                });
            return c.json({ url: `https://${port}-${sandboxID}${suffix}` });
        })
        .delete(
            "/sandboxes/:id/ports/:port",
            sandboxDocs.unsharePort,
            async (c) => {
                const { sandboxID } = await ownedSandbox(c);
                const port = sharedPort(c.req.param("port"));
                await unsharePort(c.env, sandboxID, port);
                return c.body(null, 204);
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

export const e2bRoutes = new Hono<Env>()
    // Not E2B's: the fixed rates callers pay, public so the docs, the
    // dashboard and Polli can show prices before anyone signs in.
    .get("/pricing", sandboxDocs.pricing, (c) =>
        c.json({
            maxRunning: MAX_RUNNING_PER_USER,
            // Other E2B templates' rates.
            ...callerRates("e2b"),
            // Azure's only once they can start.
            templates: {
                ...priced(TEMPLATE_SIZES, "e2b"),
                ...(azureConfigured(c.env) && priced(AZURE_TEMPLATES, "azure")),
            },
        }),
    )
    .all("/sandbox/*", (c) => proxyEnvd(c, `${E2B_PATH}/sandbox`))
    .route("/", sandboxApi(false, edgeRateLimit, auth()));

// Read again for every renewal, so deleting the key, letting it expire,
// removing its machines permission or banning the account ends them. A keep
// set from the dashboard has no key: its owner pays, until banned.
async function loadPayer(
    env: CloudflareBindings,
    apiKeyId: string | null,
    ownerId = "",
): Promise<GenerationAuthSnapshot | null> {
    if (!apiKeyId) {
        const owner = await drizzle(env.DB)
            .select()
            .from(user)
            .where(eq(user.id, ownerId))
            .get();
        if (!owner || isUserBanned(owner)) return null;
        return { user: { id: owner.id, tier: owner.tier } };
    }
    const result = await loadActiveApiKeyAuthResult({
        apiKeyId,
        rawApiKey: "",
        env,
    }).catch((error) => {
        // Any other error, such as a database timeout, is tried again later
        // rather than ending a keep or a port share.
        if (
            error instanceof BannedAccountError ||
            error instanceof StagingAccessDeniedError
        ) {
            return null;
        }
        throw error;
    });
    if (!result?.user) return null;
    const { rawKey: _rawKey, ...apiKey } = result.apiKey;
    return { user: { id: result.user.id, tier: result.user.tier }, apiKey };
}

// This API as `payer`, for the cron and port wakes: every call is checked and
// charged like the payer's own.
function payerApi(
    env: CloudflareBindings,
    ctx: ExecutionContext,
    payer: GenerationAuthSnapshot,
) {
    const api = new Hono<Env>()
        .use("*", requestId())
        .use("*", logger)
        .route(E2B_PATH, sandboxApi(true, authFromSnapshot(payer)));
    return (sandboxID: string, action: string, body = {}) =>
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
}

function sharedPort(value: string) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new HTTPException(400, { message: `Invalid port ${value}` });
    }
    return port;
}

const sha256 = async (text: string) =>
    bytesToHex(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    );

type SharedPort = typeof sandboxPort.$inferSelect;

type WokenPort = { origin: string; token?: string; until: number };

// ponytail: a per-isolate cache of paid leases, so requests inside one make no
// enter or E2B call; the share itself is read from D1 on every request. A
// wake costs nothing more while the lease runs, but simultaneous first
// requests to a paused sandbox each prepay a lease (a webhook sender with one
// connection sends none). Move it to a Durable Object per sandbox if that
// matters.
const wokenPorts = new Map<string, WokenPort>();

async function unsharePort(
    env: CloudflareBindings,
    sandboxID: string,
    port: number,
) {
    wokenPorts.delete(`${port}-${sandboxID}`);
    await drizzle(env.DB)
        .delete(sandboxPort)
        .where(
            and(
                eq(sandboxPort.sandboxId, sandboxID),
                eq(sandboxPort.port, port),
            ),
        );
}

const portRefusal = (status: number, message: string) =>
    new Response(`${message}\n`, {
        status,
        headers: { "content-type": "text/plain; charset=utf-8" },
    });

const notShared = () => portRefusal(404, "No sandbox port is shared here.");

// The sandbox and port a host like 8080-<sandbox id>.pollinations.app names.
// Site names start with a letter, so no site can take such a host.
export function sandboxPortHost(env: Env["Bindings"], hostname: string) {
    const suffix = env.SITES_HOST_SUFFIX;
    if (!suffix || !hostname.endsWith(suffix)) return null;
    const match = hostname
        .slice(0, -suffix.length)
        .match(/^(\d{1,5})-([a-z0-9]+)$/);
    const port = Number(match?.[1]);
    return match && port >= 1 && port <= 65535
        ? { port, sandboxID: match[2] }
        : null;
}

// Wakes a shared port's sandbox with a connect as the port's payer, so the
// lease is paid in advance and capped like the payer's own connect.
async function wakePort(
    env: CloudflareBindings,
    ctx: ExecutionContext,
    { sandboxId: sandboxID, port, apiKeyId }: SharedPort,
): Promise<WokenPort | Response> {
    // A port of a sandbox that is gone, or whose payer is, stops being shared.
    const sandbox = await getSandbox(env, sandboxID);
    const payer = sandbox
        ? await loadPayer(env, apiKeyId, sandbox.metadata?.[OWNER_KEY])
        : null;
    if (!sandbox || !payer) {
        await unsharePort(env, sandboxID, port);
        return notShared();
    }
    const response = await payerApi(env, ctx, payer)(sandboxID, "connect", {
        timeout: DEFAULT_TIMEOUT_SECONDS,
    });
    if (!response.ok) {
        const { message } = await response
            .json<{ message: string }>()
            .catch(() => ({ message: `E2B returned ${response.status}` }));
        return portRefusal(
            response.status,
            `This sandbox is asleep and could not be woken: ${message}`,
        );
    }
    const connected = await response.json<CreatedSandbox>();
    const now = Date.now();
    const woken = {
        origin: `https://${port}-${sandboxID}.${connected.domain || "e2b.app"}`,
        token: connected.trafficAccessToken ?? undefined,
        // Connect never shortens a running sandbox's lease.
        until: Math.max(
            now + DEFAULT_TIMEOUT_SECONDS * 1000,
            sandbox.state === "running" ? Date.parse(sandbox.endAt) : 0,
        ),
    };
    wokenPorts.set(`${port}-${sandboxID}`, woken);
    return woken;
}

/**
 * Serves a shared sandbox port at its own host, to requests that carry the
 * share's secret: a request to a paused sandbox resumes it first, and one to a
 * sandbox whose lease ends within a minute extends it, both paid by the port's
 * payer. Each request is activity for an idle timeout. Everything else,
 * WebSocket upgrades and streamed bodies included, passes through to E2B
 * unchanged.
 */
export const servePort = (
    request: Request,
    env: CloudflareBindings,
    ctx: ExecutionContext,
    target: { port: number; sandboxID: string },
) =>
    // It runs outside Hono, so nothing else turns an error into a response.
    forwardPort(request, env, ctx, target).catch(async (error) => {
        await ensureConfigured({
            level: env.LOG_LEVEL || "debug",
            format: env.LOG_FORMAT || "text",
        });
        getLogger(["gen", "sandbox-port"]).error(
            "Serving port {port} of sandbox {sandboxID} failed: {error}",
            { ...target, error: String(error) },
        );
        return portRefusal(502, "This sandbox could not be reached.");
    });

async function forwardPort(
    request: Request,
    env: CloudflareBindings,
    ctx: ExecutionContext,
    { port, sandboxID }: { port: number; sandboxID: string },
) {
    const shared = await drizzle(env.DB)
        .select()
        .from(sandboxPort)
        .where(
            and(
                eq(sandboxPort.sandboxId, sandboxID),
                eq(sandboxPort.port, port),
            ),
        )
        .get();
    if (!shared) return notShared();
    const secret = await sha256(request.headers.get(shared.header) ?? "");
    if (secret !== shared.secretHash) {
        return portRefusal(
            403,
            `This port needs the secret it was shared with in ${shared.header}.`,
        );
    }
    const key = `${port}-${sandboxID}`;
    const wake = () => wakePort(env, ctx, shared);
    const cached = wokenPorts.get(key);
    let woken =
        cached && cached.until - Date.now() >= WAKE_MARGIN_MS
            ? cached
            : await wake();
    if (woken instanceof Response) return woken;
    await noteActivity(env, sandboxID);
    // A small body (a webhook's) is kept for sending again, should the
    // sandbox have stopped inside the cached lease.
    const length = request.headers.get("content-length");
    const small = length !== null && Number(length) <= 1_000_000;
    const replay =
        request.body === null
            ? request
            : woken === cached && small
              ? request.clone()
              : null;
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.delete("host");
    const send = ({ origin, token }: WokenPort, body = request.body) => {
        if (token) headers.set("e2b-traffic-access-token", token);
        return fetch(`${origin}${url.pathname}${url.search}`, {
            method: request.method,
            headers,
            body,
            redirect: "manual",
        });
    };
    const response = await send(woken);
    // E2B answers 502 "The sandbox was not found" for a sandbox that stopped
    // inside the cached lease: paused idle or by its owner, or killed. A
    // request that can be sent again wakes it and tries again; any other, the
    // next one.
    if (
        woken !== cached ||
        response.status !== 502 ||
        !(await response.clone().text()).includes("sandbox was not found")
    ) {
        return response;
    }
    wokenPorts.delete(key);
    if (!replay) return response;
    woken = await wake();
    return woken instanceof Response ? woken : send(woken, replay.body);
}

// Notes a CPU busy over the cron's last interval as activity, so the idle
// timeout counts from the end of a job. Returns whether E2B had metrics.
async function noteBusyCpu(env: CloudflareBindings, sandboxID: string) {
    const start = Math.floor(Date.now() / 1000) - CRON_SECONDS;
    const samples = await e2b(
        env,
        `/sandboxes/${sandboxID}/metrics?start=${start}`,
    )
        .then((response) =>
            response.ok ? response.json<{ cpuUsedPct: number }[]>() : [],
        )
        .catch(() => []);
    if (!samples.length) return false;
    const cpu =
        samples.reduce((sum, sample) => sum + sample.cpuUsedPct, 0) /
        samples.length;
    if (cpu >= BUSY_CPU_PCT) await noteActivity(env, sandboxID);
    return true;
}

// When a kept sandbox was last active: its last resume (a wake starts a new
// run), a request to a shared port, a connect by its owner, a busy CPU, or a
// gen request with its own key (an agent at work in it). Read now, not with
// the cron's other rows, as a request may have come in since.
async function lastActive(env: CloudflareBindings, sandbox: SandboxDetail) {
    const db = drizzle(env.DB);
    const [keep, ownKey] = await Promise.all([
        db
            .select({ activeAt: sandboxKeep.activeAt })
            .from(sandboxKeep)
            .where(eq(sandboxKeep.sandboxId, sandbox.sandboxID))
            .get(),
        db
            .select({ lastRequest: apikey.lastRequest })
            .from(apikey)
            .where(
                and(
                    eq(apikey.referenceId, sandbox.metadata?.[OWNER_KEY] ?? ""),
                    eq(apikey.name, `polli-sandbox-${sandbox.sandboxID}`),
                ),
            )
            .get(),
    ]);
    return Math.max(
        Date.parse(sandbox.startedAt),
        keep?.activeAt?.getTime() ?? 0,
        ownKey?.lastRequest?.getTime() ?? 0,
    );
}

/**
 * Keeps each kept sandbox running until its timeout, through this API as the
 * key that set it: every renewal is checked and charged like the owner's own.
 * A running sandbox is topped back up to 10 minutes of lease; before E2B would
 * end its 24-hour run, a pause and resume starts a new run instead, giving up
 * the rest of the lease like any pause. A paused one (a missed renewal, a
 * failed resume, E2B's own pause) is resumed, as the owner's own pause has
 * ended its keep. With an idle timeout, a sandbox without activity for that
 * long is paused instead, and stays paused until a wake. The keep ends when
 * the sandbox is gone, or the key is or can no longer pay.
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
    const db = drizzle(env.DB);
    const now = Date.now();
    await db.delete(sandboxKeep).where(lte(sandboxKeep.until, new Date(now)));
    const end = async (sandboxID: string, why: string) => {
        log.info("Ending the keep of sandbox {sandboxID}: {why}", {
            sandboxID,
            why,
        });
        await db
            .delete(sandboxKeep)
            .where(eq(sandboxKeep.sandboxId, sandboxID));
    };
    const keep = async ({
        sandboxId: sandboxID,
        apiKeyId,
        until,
        idleTimeout,
    }: typeof sandboxKeep.$inferSelect) => {
        const sandbox = await getSandbox(env, sandboxID);
        if (!sandbox) return end(sandboxID, "it is gone");
        const paused = sandbox.state === "paused";
        const measured =
            !paused &&
            idleTimeout !== null &&
            (await noteBusyCpu(env, sandboxID));
        const quiet =
            idleTimeout !== null &&
            (await lastActive(env, sandbox)) <= now - idleTimeout * 1000;
        // Paused while quiet, it waits for a request to a shared port or a
        // connect to wake it. Paused otherwise (a failed restart, a missed
        // renewal), it is resumed.
        if (paused && quiet) return;
        // Without metrics, a job may still run: check again next time.
        const idle = !paused && quiet && measured;
        const renewTo = Math.min(
            now + KEEP_LEASE_SECONDS * 1000,
            until.getTime(),
        );
        if (!idle && !paused && renewTo <= Date.parse(sandbox.endAt)) return;
        const payer = await loadPayer(
            env,
            apiKeyId,
            sandbox.metadata?.[OWNER_KEY],
        );
        if (!payer) return end(sandboxID, "its payer is gone");
        const api = payerApi(env, ctx, payer);
        const post = (action: string, body = {}) =>
            api(sandboxID, action, body);
        const timeout = Math.ceil((renewTo - now) / 1000);
        const restart = !paused && runEnd(sandbox, now) < now + timeout * 1000;
        if (idle) log.info("Pausing idle sandbox {sandboxID}", { sandboxID });
        const responses = idle
            ? [await post("pause")]
            : [
                  ...(restart ? [await post("pause")] : []),
                  await post(paused || restart ? "connect" : "timeout", {
                      timeout,
                  }),
              ];
        const failed = responses.find((response) => !response.ok);
        if (!failed) return;
        const why = `${failed.status} ${(await failed.text()).slice(0, 300)}`;
        // A key that cannot pay, or may no longer run sandboxes, ends the
        // keep. Anything else is tried again next time.
        if (failed.status === 402 || failed.status === 403) {
            return end(sandboxID, why);
        }
        log.info("Not renewing sandbox {sandboxID}: {why}", { sandboxID, why });
    };
    const kept = await db.select().from(sandboxKeep);
    await Promise.all(
        kept.map((row) =>
            keep(row).catch((error) =>
                log.error("Keeping sandbox {sandboxID} failed: {error}", {
                    sandboxID: row.sandboxId,
                    error:
                        error instanceof Error ? error.message : String(error),
                }),
            ),
        ),
    );
}
