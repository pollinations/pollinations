import {
    createExecutionContext,
    createScheduledController,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { signSessionToken } from "@shared/auth/session-token.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";

const E2B = "https://api.e2b.app";
// The fake's 2 vCPU, 512 MiB sandbox for 300 s, at E2B's list rates.
const COST_300S = 300 * (2 * 0.000014 + 0.5 * 0.0000045);
// During the launch promo, callers pay 25% of the list price.
const LEASE_300S = COST_300S * 0.25;

type Sandbox = {
    sandboxID: string;
    startedAt: string;
    endAt: string;
    cpuCount: number;
    memoryMB: number;
    state: "running" | "paused";
    metadata: Record<string, string>;
    secure?: boolean;
    autoPause?: boolean;
};

type WrittenFile = {
    sandboxID: string;
    path: string | null;
    username: string | null;
    accessToken: string | null;
    content: string;
};

const inSeconds = (seconds: number) =>
    new Date(Date.now() + seconds * 1000).toISOString();

// E2B ends a run 24 hours after it started.
const RUN_MS = 86_400_000;

// A tiny in-memory E2B control API that also records Tinybird events and
// files written into sandboxes. Everything else goes to the real fetch, which
// the test environment needs.
function stubE2b() {
    const sandboxes: Sandbox[] = [];
    const events: Record<string, unknown>[] = [];
    const files: WrittenFile[] = [];
    let created = 0;
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin === new URL(env.TINYBIRD_INGEST_URL).origin) {
            events.push(JSON.parse(await request.text()));
            return new Response(null, { status: 202 });
        }
        const envd = url.hostname.match(/^49983-(\w+)\.e2b\.app$/);
        if (envd && url.pathname === "/files") {
            const file = (await request.formData()).get("file") as File;
            files.push({
                sandboxID: envd[1],
                path: url.searchParams.get("path"),
                username: url.searchParams.get("username"),
                accessToken: request.headers.get("x-access-token"),
                content: await file.text(),
            });
            return Response.json([{ type: "file" }]);
        }
        if (url.origin !== E2B) return realFetch(input, init);
        // The team key replaces the caller's key.
        expect(request.headers.get("x-api-key")).toBe(
            "not-a-secret-workers-test-only",
        );
        expect(request.headers.get("authorization")).toBeNull();
        const body = (await request.json().catch(() => ({}))) as {
            templateID?: string;
            timeout?: number;
            metadata?: Record<string, string>;
            secure?: boolean;
            autoPause?: boolean;
        };

        if (
            /^(\/v2)?\/sandboxes$/.test(url.pathname) &&
            request.method === "POST"
        ) {
            if (body.templateID === "missing") {
                return Response.json(
                    { code: 400, message: "Template not found" },
                    { status: 400 },
                );
            }
            // One clock reading, so the lease is exactly `timeout` long.
            const now = Date.now();
            const sandbox: Sandbox = {
                sandboxID: `sbx${++created}`,
                startedAt: new Date(now).toISOString(),
                endAt: new Date(
                    now + (body.timeout ?? 300) * 1000,
                ).toISOString(),
                cpuCount: 2,
                memoryMB: 512,
                state: "running",
                metadata: body.metadata ?? {},
                secure: body.secure,
                autoPause: body.autoPause,
            };
            sandboxes.push(sandbox);
            return Response.json(
                { sandboxID: sandbox.sandboxID, envdAccessToken: "envd" },
                { status: 201 },
            );
        }
        if (url.pathname === "/v2/sandboxes" && request.method === "GET") {
            const filter = new URLSearchParams(
                url.searchParams.get("metadata") ?? "",
            );
            const state = url.searchParams.get("state");
            return Response.json(
                sandboxes.filter(
                    (s) =>
                        [...filter].every(([k, v]) => s.metadata[k] === v) &&
                        (!state || s.state === state),
                ),
            );
        }

        const [, id, action = ""] =
            url.pathname.match(/^(?:\/v2)?\/sandboxes\/([^/]+)(\/.+)?$/) ?? [];
        const sandbox = sandboxes.find((s) => s.sandboxID === id);
        if (!sandbox) {
            return Response.json(
                { code: 404, message: "not found" },
                { status: 404 },
            );
        }
        const call = `${request.method} ${action}`;
        if (call === "GET ") return Response.json(sandbox);
        if (call === "DELETE ") {
            sandboxes.splice(sandboxes.indexOf(sandbox), 1);
            return new Response(null, { status: 204 });
        }
        if (call === "POST /timeout") {
            // Like E2B, end the lease with the run at the latest, and refuse
            // to renew a paused sandbox or a run past its end (keep_alive.go).
            if (sandbox.state !== "running") {
                return Response.json(
                    { code: 404, message: "Sandbox not found" },
                    { status: 404 },
                );
            }
            const runEnd = Date.parse(sandbox.startedAt) + RUN_MS;
            if (Date.now() > runEnd) {
                return Response.json(
                    { code: 400, message: "Max instance length exceeded" },
                    { status: 400 },
                );
            }
            sandbox.endAt = new Date(
                Math.min(Date.now() + (body.timeout ?? 0) * 1000, runEnd),
            ).toISOString();
            return new Response(null, { status: 204 });
        }
        if (call === "GET /logs") {
            const start = url.searchParams.get("start");
            return Response.json({ logs: [{ line: `since ${start}` }] });
        }
        if (call === "POST /pause") {
            // Like E2B, a paused sandbox reports its pause time as endAt.
            sandbox.state = "paused";
            sandbox.endAt = inSeconds(0);
            return new Response(null, { status: 204 });
        }
        if (call === "POST /connect") {
            const endAt = inSeconds(body.timeout ?? 300);
            const resumed = sandbox.state === "paused";
            // Like E2B, resuming starts a new run (create_instance.go).
            if (resumed) sandbox.startedAt = inSeconds(0);
            sandbox.state = "running";
            sandbox.endAt =
                resumed || endAt > sandbox.endAt ? endAt : sandbox.endAt;
            return Response.json(sandbox, { status: resumed ? 201 : 200 });
        }
        return new Response("unexpected", { status: 500 });
    });
    return {
        sandboxes,
        files,
        leases: () => events.filter((e) => e.eventType === "sandbox.lease"),
    };
}

// E2B's SDKs send the key in X-API-KEY.
const call = (key: string, path: string, init?: RequestInit) =>
    SELF.fetch(`https://gen.pollinations.ai/alpha/e2b${path}`, {
        ...init,
        headers: { "x-api-key": key, "content-type": "application/json" },
    });

const post = (key: string, path: string, body?: unknown) =>
    call(key, path, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
    });

const createSandbox = (key: string, body: Record<string, unknown> = {}) =>
    post(key, "/v2/sandboxes", { templateID: "base", ...body });

const sandboxKey = (tierBalance = 10, pollenBudget?: number) =>
    createTestApiKey({
        accountPermissions: ["machines"],
        pollenBudget,
        user: { tierBalance },
    });

const questPollen = async (userId: string) =>
    (await getUserBalance(drizzle(env.DB), userId)).tierBalance;

afterEach(() => {
    vi.unstubAllGlobals();
});

test("create pays the lease up front and hides the sandbox from other users", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const other = await sandboxKey();

    // The owner tag cannot be spoofed.
    const created = await createSandbox(owner.key, {
        metadata: { app: "demo", pollinations_user: other.userId },
    });
    expect(created.status).toBe(201);
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    expect(e2b.sandboxes[0].metadata).toEqual({
        app: "demo",
        pollinations_user: owner.userId,
    });
    // envd in the sandbox needs its access token.
    expect(e2b.sandboxes[0].secure).toBe(true);
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - LEASE_300S, 8);
    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(1));
    expect(e2b.leases()[0]).toMatchObject({
        userId: owner.userId,
        modelProviderUsed: "e2b",
        isBilledUsage: true,
    });
    expect(e2b.leases()[0].totalPrice).toBeCloseTo(LEASE_300S, 8);
    expect(e2b.leases()[0].totalCost).toBeCloseTo(COST_300S, 8);

    // Nor can the list filter or a sandbox ID reach another user's sandbox.
    const spoofed = new URLSearchParams({
        metadata: `pollinations_user=${owner.userId}`,
    });
    const listed = await call(other.key, `/v2/sandboxes?${spoofed}`);
    expect(await listed.json()).toEqual([]);
    const read = await call(other.key, `/sandboxes/${sandboxID}`);
    expect(read.status).toBe(404);
    expect(await read.json()).toEqual({
        code: 404,
        message: `Sandbox ${sandboxID} not found`,
    });
    const kill = await call(other.key, `/sandboxes/${sandboxID}`, {
        method: "DELETE",
    });
    expect(kill.status).toBe(404);
    const logs = `/sandboxes/${sandboxID}/logs?start=5`;
    expect((await call(other.key, logs)).status).toBe(404);
    expect(await (await call(owner.key, logs)).json()).toEqual({
        logs: [{ line: "since 5" }],
    });

    const own = await call(owner.key, "/v2/sandboxes");
    expect(await own.json()).toMatchObject([{ sandboxID }]);
    const killed = await call(owner.key, `/sandboxes/${sandboxID}`, {
        method: "DELETE",
    });
    expect(killed.status).toBe(204);
    expect(e2b.sandboxes).toEqual([]);
});

test("a running sandbox pays only past its lease; pausing gives up the rest", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const created = await createSandbox(owner.key);
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    const connect = (seconds: number) =>
        post(owner.key, `/v2/sandboxes/${sandboxID}/connect`, {
            timeout: seconds,
        });

    // Connecting within the 300 s paid at create costs nothing.
    expect((await connect(200)).status).toBe(200);
    // 600 s from now extends the paid 300 s by about 300 s.
    const extended = await post(owner.key, `/sandboxes/${sandboxID}/timeout`, {
        timeout: 600,
    });
    expect(extended.status).toBe(204);
    // A paused sandbox has given up its lease, so resuming pays it all.
    const paused = await post(owner.key, `/sandboxes/${sandboxID}/pause`);
    expect(paused.status).toBe(204);
    expect((await connect(300)).status).toBe(201);

    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(3));
    for (const lease of e2b.leases()) {
        expect(lease.totalPrice).toBeCloseTo(LEASE_300S, 5);
    }
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 3 * LEASE_300S, 5);
});

test("the E2B CLI's deprecated v1 create and connect are paid the same way", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();

    const created = await post(owner.key, "/sandboxes", { templateID: "base" });
    expect(created.status).toBe(201);
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    expect(e2b.sandboxes[0].metadata).toEqual({
        pollinations_user: owner.userId,
    });
    const connected = await post(owner.key, `/sandboxes/${sandboxID}/connect`, {
        timeout: 600,
    });
    expect(connected.status).toBe(200);

    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(2));
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 2 * LEASE_300S, 5);
});

test("E2B errors reach the caller and cost nothing", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();

    const refused = await createSandbox(owner.key, { templateID: "missing" });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({
        code: 400,
        message: "Template not found",
    });

    const created = await createSandbox(owner.key);
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    await post(owner.key, `/sandboxes/${sandboxID}/pause`);
    const extended = await post(owner.key, `/sandboxes/${sandboxID}/timeout`, {
        timeout: 600,
    });
    expect(extended.status).toBe(404);

    // Only the lease E2B actually granted is paid for.
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - LEASE_300S, 8);
    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(1));
});

test("a lease runs to the end of E2B's 24-hour run at the latest; resuming starts a new run", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const created = await createSandbox(owner.key);
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    // The run ends 600 s from now: an hour's lease gets 300 s past the paid 300.
    e2b.sandboxes[0].startedAt = new Date(
        Date.now() - RUN_MS + 600_000,
    ).toISOString();

    const extended = await post(owner.key, `/sandboxes/${sandboxID}/timeout`, {
        timeout: 3600,
    });
    expect(extended.status).toBe(204);

    // E2B pauses the sandbox when the run ends; resuming pays a whole lease.
    await post(owner.key, `/sandboxes/${sandboxID}/pause`);
    e2b.sandboxes[0].startedAt = new Date(Date.now() - RUN_MS).toISOString();
    const resumed = await post(owner.key, `/sandboxes/${sandboxID}/connect`, {
        timeout: 300,
    });
    expect(resumed.status).toBe(201);

    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(3));
    expect(e2b.leases()[1].totalPrice).toBeCloseTo(LEASE_300S, 5);
    expect(e2b.leases()[2].totalPrice).toBeCloseTo(LEASE_300S, 5);
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 3 * LEASE_300S, 5);
});

test("refuses keys without the scope, unpaid leases and closed endpoints", async () => {
    const e2b = stubE2b();

    const plain = await createTestApiKey({ user: { tierBalance: 10 } });
    const denied = await call(plain.key, "/v2/sandboxes");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
        code: 403,
        message: expect.stringContaining("account:machines"),
    });

    // An empty wallet creates nothing. A key budget below the lease gets the
    // new sandbox killed before anything is charged.
    const broke = await sandboxKey(0);
    expect((await createSandbox(broke.key)).status).toBe(402);
    const capped = await sandboxKey(10, 0.001);
    const refused = await createSandbox(capped.key);
    expect(refused.status).toBe(402);
    expect(await refused.json()).toMatchObject({
        code: 402,
        message: expect.stringContaining("budget"),
    });
    expect(e2b.sandboxes).toEqual([]);

    const owner = await sandboxKey();
    const autoResume = await createSandbox(owner.key, {
        autoResume: { enabled: true },
    });
    expect(autoResume.status).toBe(400);
    expect((await post(owner.key, "/sandboxes/sbx1/fork")).status).toBe(403);

    // A user may run three sandboxes at once.
    for (let i = 0; i < 3; i++) {
        expect((await createSandbox(owner.key)).status).toBe(201);
    }
    expect((await createSandbox(owner.key)).status).toBe(429);
    expect(e2b.sandboxes).toHaveLength(3);
    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(3));
});

test("a timeout past E2B's 24-hour run creates a kept sandbox with an hour paid", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const week = 7 * 86_400;

    const created = await createSandbox(owner.key, {
        timeout: week,
        metadata: {
            pollinations_key: "someone-else",
            pollinations_env: "production",
        },
    });
    expect(created.status).toBe(201);
    const [sandbox] = e2b.sandboxes;
    expect(sandbox.metadata).toMatchObject({
        pollinations_user: owner.userId,
        pollinations_key: owner.id,
        pollinations_env: "test",
    });
    expect(
        Date.parse(sandbox.metadata.pollinations_until) - Date.now(),
    ).toBeCloseTo(week * 1000, -4);
    // E2B gets an hour at a time, paid in advance.
    expect(Date.parse(sandbox.endAt) - Date.parse(sandbox.startedAt)).toBe(
        3_600_000,
    );
    expect(await questPollen(owner.userId)).toBeCloseTo(
        10 - 12 * LEASE_300S,
        8,
    );

    // A session token leaves no key to renew it with.
    const token = await signSessionToken({
        secret: env.BETTER_AUTH_SECRET,
        userId: owner.userId,
    });
    const refused = await createSandbox(token, { timeout: week });
    expect(refused.status).toBe(400);
    expect(e2b.sandboxes).toHaveLength(1);
});

test("the cron renews each kept sandbox about to end until its timeout, paid by the key that created it", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const kept = {
        pollinations_until: inSeconds(30 * 86_400),
        pollinations_user: owner.userId,
        pollinations_key: owner.id,
        pollinations_env: "test",
    };
    // The others belong to someone else, as a user runs at most three.
    const other = await sandboxKey();
    const keptByOther = {
        ...kept,
        pollinations_user: other.userId,
        pollinations_key: other.id,
    };
    const sandbox = (sandboxID: string, fields: Partial<Sandbox> = {}) => ({
        sandboxID,
        startedAt: inSeconds(0),
        endAt: inSeconds(300),
        cpuCount: 2,
        memoryMB: 512,
        state: "running" as const,
        metadata: kept,
        ...fields,
    });
    const until = inSeconds(1200);
    const ended = inSeconds(300);
    e2b.sandboxes.push(
        sandbox("due"),
        // Its run ends within the next lease, so it restarts.
        sandbox("old", { startedAt: inSeconds(600 - RUN_MS / 1000) }),
        sandbox("ending", {
            metadata: { ...keptByOther, pollinations_until: until },
        }),
        sandbox("paused", { state: "paused" }),
        sandbox("later", { endAt: inSeconds(1800), metadata: keptByOther }),
        sandbox("ended", {
            endAt: ended,
            metadata: { ...keptByOther, pollinations_until: ended },
        }),
        sandbox("unkept", { metadata: { pollinations_user: other.userId } }),
        sandbox("production", {
            metadata: { ...keptByOther, pollinations_env: "production" },
        }),
        sandbox("keyless", {
            metadata: { ...keptByOther, pollinations_key: "gone" },
        }),
    );
    const untouched = structuredClone(e2b.sandboxes.slice(3));

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);

    const [due, old, ending] = e2b.sandboxes;
    expect(Date.parse(due.endAt) - Date.now()).toBeGreaterThan(3590_000);
    expect(old.state).toBe("running");
    expect(Date.now() - Date.parse(old.startedAt)).toBeLessThan(10_000);
    expect(Date.parse(old.endAt) - Date.now()).toBeGreaterThan(3590_000);
    // Renewed only up to its timeout.
    expect(Math.abs(Date.parse(ending.endAt) - Date.parse(until))).toBeLessThan(
        2000,
    );
    expect(e2b.sandboxes.slice(3)).toEqual(untouched);

    // The renewal pays for 3300 s past the paid 300, the restart for an hour,
    // and the ending sandbox for the 900 s left to its timeout.
    expect(e2b.leases()).toHaveLength(3);
    const paid = Object.fromEntries(
        e2b.leases().map((lease) => [lease.requestPath, lease]),
    );
    const renewal = paid["/alpha/e2b/sandboxes/due/timeout"];
    expect(renewal).toMatchObject({ userId: owner.userId, apiKeyId: owner.id });
    expect(renewal.totalPrice).toBeCloseTo(11 * LEASE_300S, 4);
    expect(paid["/alpha/e2b/sandboxes/old/connect"].totalPrice).toBeCloseTo(
        12 * LEASE_300S,
        4,
    );
    const last = paid["/alpha/e2b/sandboxes/ending/timeout"];
    expect(last).toMatchObject({ userId: other.userId, apiKeyId: other.id });
    expect(last.totalPrice).toBeCloseTo(3 * LEASE_300S, 4);
    expect(await questPollen(owner.userId)).toBeCloseTo(
        10 - 23 * LEASE_300S,
        4,
    );
});

test("the account owner's session token runs sandboxes without a key scope", async () => {
    stubE2b();
    const { userId } = await createTestApiKey({ user: { tierBalance: 10 } });
    const token = await signSessionToken({
        secret: env.BETTER_AUTH_SECRET,
        userId,
    });

    expect((await call(token, "/v2/sandboxes")).status).toBe(200);
    expect((await createSandbox(token)).status).toBe(201);
});

test("the pollinations template comes logged in with a key from enter's key API", async () => {
    const e2b = stubE2b();
    const owner = await createTestApiKey({
        accountPermissions: ["machines", "keys"],
        user: { tierBalance: 10 },
    });

    // Other templates get no login.
    await createSandbox(owner.key);
    expect(e2b.files).toEqual([]);

    const created = await createSandbox(owner.key, {
        templateID: "pollinations",
    });
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    expect(e2b.files).toMatchObject([
        {
            sandboxID,
            path: "/home/user/.pollinations/credentials.staging.json",
            username: "user",
            accessToken: "envd",
        },
    ]);
    // The test stub of enter answers with the request it got as the key.
    const { apiKey } = JSON.parse(e2b.files[0].content);
    expect(JSON.parse(apiKey)).toEqual({
        authorization: `Bearer ${owner.key}`,
        body: {
            name: `polli-sandbox-${sandboxID}`,
            type: "secret",
            accountPermissions: ["profile", "usage", "keys", "machines"],
        },
    });
});
