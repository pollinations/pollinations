import { env, SELF } from "cloudflare:test";
import { signSessionToken } from "@shared/auth/session-token.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    sandboxKeepAlive,
    sandboxKeepAliveMeta,
} from "@shared/db/sandbox-keep-alive.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, vi } from "vitest";
import {
    KEEP_ALIVE_LEASE_SECONDS,
    runSandboxKeepAlive,
} from "../src/routes/e2b-keep-alive.ts";

const E2B = "https://api.e2b.app";
// The fake's 2 vCPU, 512 MiB sandbox for 300 s, at E2B's list rates.
const COST_300S = 300 * (2 * 0.000014 + 0.5 * 0.0000045);
// During the launch promo, callers pay 25% of the list price.
const LEASE_300S = COST_300S * 0.25;
// The 6h lease keep-alive enables with and maintains.
const LEASE_6H = COST_300S * (KEEP_ALIVE_LEASE_SECONDS / 300) * 0.25;
const CURSOR_KEY = "cursor";
const silentLog = { info: () => {}, error: () => {} };

type Sandbox = {
    sandboxID: string;
    startedAt: string;
    endAt: string;
    cpuCount: number;
    memoryMB: number;
    state: "running" | "paused";
    metadata: Record<string, string>;
    secure?: boolean;
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

// A tiny in-memory E2B control API that also records Tinybird events and
// files written into sandboxes. Everything else goes to the real fetch, which
// the test environment needs.
function stubE2b({ failTelemetry = false } = {}) {
    const sandboxes: Sandbox[] = [];
    const events: Record<string, unknown>[] = [];
    const files: WrittenFile[] = [];
    const timeouts: number[] = [];
    let created = 0;
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin === new URL(env.TINYBIRD_INGEST_URL).origin) {
            if (failTelemetry) return new Response("boom", { status: 500 });
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
            timeouts.push(body.timeout ?? 0);
            // Like E2B, refuse a lease longer than the plan allows.
            if ((body.timeout ?? 0) > 86_400) {
                return Response.json(
                    { code: 400, message: "Timeout too long" },
                    { status: 400 },
                );
            }
            sandbox.endAt = inSeconds(body.timeout ?? 0);
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
        timeouts,
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
    const extended = await post(owner.key, `/sandboxes/${sandboxID}/timeout`, {
        timeout: 100_000,
    });
    expect(extended.status).toBe(400);

    // Only the lease E2B actually granted is paid for.
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - LEASE_300S, 8);
    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(1));
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

describe("sandbox keep-alive", () => {
    const db = () => drizzle(env.DB);
    const flags = () => db().select().from(sandboxKeepAlive);
    const keepAlive = (key: string, id: string, enabled: boolean) =>
        post(key, `/sandboxes/${id}/keep-alive`, { enabled });
    let ownerId = "";

    afterEach(async () => {
        await db().delete(sandboxKeepAlive);
        await db().delete(sandboxKeepAliveMeta);
    });

    test("enable pays a 6h lease and registers the flag; disable removes it", async () => {
        const e2b = stubE2b();
        const owner = await sandboxKey();
        const other = await sandboxKey();
        ownerId = owner.userId;
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();

        // Only the owner can flag it.
        expect((await keepAlive(other.key, sandboxID, true)).status).toBe(404);
        expect(
            (await post(owner.key, `/sandboxes/${sandboxID}/keep-alive`, {}))
                .status,
        ).toBe(400);

        const before = Date.now();
        const enabled = await keepAlive(owner.key, sandboxID, true);
        expect(enabled.status).toBe(200);
        const body = await enabled.json<{
            sandboxId: string;
            keepAlive: boolean;
            endAt: string;
        }>();
        expect(body).toMatchObject({ sandboxId: sandboxID, keepAlive: true });
        const endMs = Date.parse(body.endAt);
        expect(endMs).toBeGreaterThan(
            before + KEEP_ALIVE_LEASE_SECONDS * 1000 - 5000,
        );
        expect(endMs).toBeLessThanOrEqual(
            Date.now() + KEEP_ALIVE_LEASE_SECONDS * 1000 + 5000,
        );
        // The sandbox itself was extended too.
        expect(Date.parse(e2b.sandboxes[0].endAt) - Date.now()).toBeGreaterThan(
            KEEP_ALIVE_LEASE_SECONDS * 1000 - 10_000,
        );
        // Charged: the unpaid gap only - the create lease overlaps, so the
        // owner has paid for exactly 6h in total.
        expect(await questPollen(ownerId)).toBeCloseTo(10 - LEASE_6H, 4);

        const [flag] = await flags();
        expect(flag).toMatchObject({ sandboxId: sandboxID, userId: ownerId });
        expect(flag.chargedUntil).toBe(Math.floor(endMs / 1000));
        expect(flag.claimToken).toBeNull();

        // Re-enable rotates the epoch.
        const again = await keepAlive(owner.key, sandboxID, true);
        expect(again.status).toBe(200);
        const [reflagged] = await flags();
        expect(reflagged.generation).not.toBe(flag.generation);

        const disabled = await keepAlive(owner.key, sandboxID, false);
        expect(disabled.status).toBe(200);
        expect(await flags()).toEqual([]);
    });

    test("the ticker extends a running lease and charges only the gap", async () => {
        const e2b = stubE2b();
        const owner = await sandboxKey();
        ownerId = owner.userId;
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();
        await keepAlive(owner.key, sandboxID, true);
        const afterEnable = await questPollen(ownerId);

        // A fresh flag is paid up: the tick refreshes nothing, charges nothing.
        await runSandboxKeepAlive(env, silentLog);
        expect(await questPollen(ownerId)).toBeCloseTo(afterEnable, 8);

        // Simulate 5h elapsed: 1h of lease remains, paid and unpaid alike.
        const oneHourLeft = Math.floor(Date.now() / 1000) + 3600;
        e2b.sandboxes[0].endAt = new Date(oneHourLeft * 1000).toISOString();
        await db()
            .update(sandboxKeepAlive)
            .set({ chargedUntil: oneHourLeft })
            .where(eq(sandboxKeepAlive.sandboxId, sandboxID));

        await runSandboxKeepAlive(env, silentLog);
        // Extended back to ~6h, charged for exactly the 5h gap.
        expect(Date.parse(e2b.sandboxes[0].endAt) - Date.now()).toBeGreaterThan(
            KEEP_ALIVE_LEASE_SECONDS * 1000 - 10_000,
        );
        expect(await questPollen(ownerId)).toBeCloseTo(
            afterEnable - (LEASE_6H * 5) / 6,
            5,
        );
        const [flag] = await flags();
        expect(flag.chargedUntil).toBeGreaterThan(
            Math.floor(Date.now() / 1000) + KEEP_ALIVE_LEASE_SECONDS - 60,
        );
        expect(flag.claimToken).toBeNull();
    });

    test("a paused sandbox is resumed and pays the full lease; at capacity the flag waits", async () => {
        const e2b = stubE2b();
        const owner = await sandboxKey(10);
        ownerId = owner.userId;
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();
        await keepAlive(owner.key, sandboxID, true);
        await post(owner.key, `/sandboxes/${sandboxID}/pause`);
        const afterPause = await questPollen(ownerId);

        await runSandboxKeepAlive(env, silentLog);
        expect(e2b.sandboxes[0].state).toBe("running");
        expect(await questPollen(ownerId)).toBeCloseTo(
            afterPause - LEASE_6H,
            5,
        );

        // At the 3-sandbox limit a paused flag waits instead of connecting.
        await createSandbox(owner.key);
        await createSandbox(owner.key);
        await post(owner.key, `/sandboxes/${sandboxID}/pause`);
        // A third running sandbox appears while the flag is paused.
        await createSandbox(owner.key);
        const beforeWait = await questPollen(ownerId);
        await runSandboxKeepAlive(env, silentLog);
        expect(e2b.sandboxes[0].state).toBe("paused");
        expect(await flags()).toHaveLength(1);
        expect(await questPollen(ownerId)).toBeCloseTo(beforeWait, 8);
    });

    test("gone sandboxes and broke owners lose their flag without a charge", async () => {
        const e2b = stubE2b();
        const owner = await sandboxKey();
        ownerId = owner.userId;
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();
        await keepAlive(owner.key, sandboxID, true);

        await call(owner.key, `/sandboxes/${sandboxID}`, {
            method: "DELETE",
        });
        await runSandboxKeepAlive(env, silentLog);
        expect(await flags()).toEqual([]);

        // Broke: enough for the enable lease, not for a paused resume.
        const tight = await sandboxKey(LEASE_300S + LEASE_6H + 0.01);
        const created = await createSandbox(tight.key);
        const { sandboxID: tightId } = await created.json<{
            sandboxID: string;
        }>();
        await keepAlive(tight.key, tightId, true);
        await post(tight.key, `/sandboxes/${tightId}/pause`);
        const brokeBefore = await questPollen(tight.userId);
        await runSandboxKeepAlive(env, silentLog);
        expect(await flags()).toEqual([]);
        expect(e2b.sandboxes.find((s) => s.sandboxID === tightId)?.state).toBe(
            "paused",
        );
        expect(await questPollen(tight.userId)).toBeCloseTo(brokeBefore, 8);
    });

    test("a claimed or disabled row is never charged; stale epochs cannot write", async () => {
        const e2b = stubE2b();
        const owner = await sandboxKey();
        ownerId = owner.userId;
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();
        await keepAlive(owner.key, sandboxID, true);
        const oneHourLeft = Math.floor(Date.now() / 1000) + 3600;
        e2b.sandboxes[0].endAt = new Date(oneHourLeft * 1000).toISOString();
        await db()
            .update(sandboxKeepAlive)
            .set({ chargedUntil: oneHourLeft })
            .where(eq(sandboxKeepAlive.sandboxId, sandboxID));
        const settled = await questPollen(ownerId);

        // A fresh claim held by someone else: the tick skips the row.
        await db()
            .update(sandboxKeepAlive)
            .set({ claimedAt: new Date(), claimToken: "other-ticker" })
            .where(eq(sandboxKeepAlive.sandboxId, sandboxID));
        await runSandboxKeepAlive(env, silentLog);
        expect(await questPollen(ownerId)).toBeCloseTo(settled, 8);
        const [held] = await flags();
        expect(held.claimToken).toBe("other-ticker");

        // Disable between read and claim: the tick's claim matches nothing.
        await db()
            .update(sandboxKeepAlive)
            .set({ claimedAt: null, claimToken: null })
            .where(eq(sandboxKeepAlive.sandboxId, sandboxID));
        await keepAlive(owner.key, sandboxID, false);
        await runSandboxKeepAlive(env, silentLog);
        expect(await questPollen(ownerId)).toBeCloseTo(settled, 8);
    });

    test("telemetry failure after settlement never re-charges", async () => {
        const e2b = stubE2b({ failTelemetry: true });
        const owner = await sandboxKey();
        ownerId = owner.userId;
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();
        await keepAlive(owner.key, sandboxID, true);
        const oneHourLeft = Math.floor(Date.now() / 1000) + 3600;
        e2b.sandboxes[0].endAt = new Date(oneHourLeft * 1000).toISOString();
        await db()
            .update(sandboxKeepAlive)
            .set({ chargedUntil: oneHourLeft })
            .where(eq(sandboxKeepAlive.sandboxId, sandboxID));

        await runSandboxKeepAlive(env, silentLog);
        // Charged once despite the failed event; the watermark moved.
        expect(await questPollen(ownerId)).toBeCloseTo(
            10 - LEASE_6H - (LEASE_6H * 5) / 6,
            4,
        );
        expect(e2b.leases()).toHaveLength(0);
        const afterTick = await questPollen(ownerId);
        await runSandboxKeepAlive(env, silentLog);
        expect(await questPollen(ownerId)).toBeCloseTo(afterTick, 8);
    });

    test("a longer manual lease is never shortened or re-charged", async () => {
        const e2b = stubE2b();
        const owner = await sandboxKey();
        ownerId = owner.userId;
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();
        await keepAlive(owner.key, sandboxID, true);
        // The owner manually buys a full day.
        const extended = await post(
            owner.key,
            `/sandboxes/${sandboxID}/timeout`,
            {
                timeout: 86_400,
            },
        );
        expect(extended.status).toBe(204);
        const settled = await questPollen(ownerId);
        const manualEnd = Date.parse(e2b.sandboxes[0].endAt);

        await runSandboxKeepAlive(env, silentLog);
        expect(Date.parse(e2b.sandboxes[0].endAt)).toBe(manualEnd);
        expect(await questPollen(ownerId)).toBeCloseTo(settled, 8);
    });
});

describe("sandbox keep-alive fault injection", () => {
    const db = () => drizzle(env.DB);
    const flags = () => db().select().from(sandboxKeepAlive);
    const keepAlive = (key: string, id: string, enabled: boolean) =>
        post(key, `/sandboxes/${id}/keep-alive`, { enabled });
    const getCursor = async () =>
        (
            await db()
                .select({ value: sandboxKeepAliveMeta.value })
                .from(sandboxKeepAliveMeta)
                .where(eq(sandboxKeepAliveMeta.key, CURSOR_KEY))
                .limit(1)
        )[0]?.value;
    const putCursor = (value: string) =>
        db()
            .insert(sandboxKeepAliveMeta)
            .values({ key: CURSOR_KEY, value })
            .onConflictDoUpdate({
                target: sandboxKeepAliveMeta.key,
                set: { value },
            });

    afterEach(async () => {
        await db().delete(sandboxKeepAlive);
        await db().delete(sandboxKeepAliveMeta);
    });

    test("an unresolved deduction holds the claim, never retries, under-collects", async () => {
        const e2b = stubE2b();
        const owner = await sandboxKey();
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();
        await keepAlive(owner.key, sandboxID, true);
        const oneHourLeft = Math.floor(Date.now() / 1000) + 3600;
        e2b.sandboxes[0].endAt = new Date(oneHourLeft * 1000).toISOString();
        await db()
            .update(sandboxKeepAlive)
            .set({ chargedUntil: oneHourLeft })
            .where(eq(sandboxKeepAlive.sandboxId, sandboxID));
        const settled = await questPollen(owner.userId);

        // The E2B mutation happens, then the deduction's outcome is unknown.
        await runSandboxKeepAlive(env, silentLog, {
            deduct: () => Promise.reject(new Error("d1 gone")),
        });
        expect(await questPollen(owner.userId)).toBeCloseTo(settled, 8);
        const [held] = await flags();
        // The claim stays held (no release), the watermark did not move.
        expect(held.claimToken).not.toBeNull();
        expect(held.chargedUntil).toBe(oneHourLeft);
        expect(Date.parse(e2b.sandboxes[0].endAt) - Date.now()).toBeGreaterThan(
            KEEP_ALIVE_LEASE_SECONDS * 1000 - 10_000,
        );

        // While the claim is fresh, no tick touches the row.
        await runSandboxKeepAlive(env, silentLog);
        expect(await questPollen(owner.userId)).toBeCloseTo(settled, 8);

        // After expiry the next tick takes over, sees the extension E2B
        // already granted and collects nothing for it (conservative policy).
        await db()
            .update(sandboxKeepAlive)
            .set({ claimedAt: new Date(Date.now() - 11 * 60 * 1000) })
            .where(eq(sandboxKeepAlive.sandboxId, sandboxID));
        await runSandboxKeepAlive(env, silentLog);
        expect(await questPollen(owner.userId)).toBeCloseTo(settled, 8);
        const [after] = await flags();
        expect(after.claimToken).toBeNull();
        expect(after.chargedUntil).toBeGreaterThan(oneHourLeft);
    });

    test("an expired claim is taken over; the stale holder's writes no-op", async () => {
        const e2b = stubE2b();
        const owner = await sandboxKey();
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();
        await keepAlive(owner.key, sandboxID, true);
        const oneHourLeft = Math.floor(Date.now() / 1000) + 3600;
        e2b.sandboxes[0].endAt = new Date(oneHourLeft * 1000).toISOString();
        await db()
            .update(sandboxKeepAlive)
            .set({
                chargedUntil: oneHourLeft,
                claimedAt: new Date(Date.now() - 11 * 60 * 1000),
                claimToken: "stale-holder",
            })
            .where(eq(sandboxKeepAlive.sandboxId, sandboxID));
        const settled = await questPollen(owner.userId);

        await runSandboxKeepAlive(env, silentLog);
        // Taken over and charged for the 5h gap.
        expect(await questPollen(owner.userId)).toBeCloseTo(
            settled - (LEASE_6H * 5) / 6,
            4,
        );
        const [flag] = await flags();
        expect(flag.claimToken).toBeNull();
        const watermark = flag.chargedUntil;

        // The stale holder's token-fenced writes match nothing now.
        const stale = await db()
            .update(sandboxKeepAlive)
            .set({ chargedUntil: watermark + 9999 })
            .where(
                and(
                    eq(sandboxKeepAlive.sandboxId, sandboxID),
                    eq(sandboxKeepAlive.generation, flag.generation),
                    eq(sandboxKeepAlive.claimToken, "stale-holder"),
                ),
            )
            .returning({ sandboxId: sandboxKeepAlive.sandboxId });
        expect(stale).toEqual([]);
        const [untouched] = await flags();
        expect(untouched.chargedUntil).toBe(watermark);
    });

    test("the cursor skips finished rows and wraps; timeout is always 6h", async () => {
        const e2b = stubE2b();
        const owner = await sandboxKey();
        const { sandboxID } = await (await createSandbox(owner.key)).json<{
            sandboxID: string;
        }>();
        await keepAlive(owner.key, sandboxID, true);
        const oneHourLeft = Math.floor(Date.now() / 1000) + 3600;
        e2b.sandboxes[0].endAt = new Date(oneHourLeft * 1000).toISOString();
        await db()
            .update(sandboxKeepAlive)
            .set({ chargedUntil: oneHourLeft })
            .where(eq(sandboxKeepAlive.sandboxId, sandboxID));
        const settled = await questPollen(owner.userId);

        // A cursor past every row: this sweep does nothing and wraps.
        await putCursor("zzz");
        await runSandboxKeepAlive(env, silentLog);
        expect(await questPollen(owner.userId)).toBeCloseTo(settled, 8);
        expect(await getCursor()).toBe("");

        // The wrapped sweep does the work, always asking E2B for exactly 6h.
        e2b.timeouts.length = 0;
        await runSandboxKeepAlive(env, silentLog);
        expect(e2b.timeouts).toEqual([KEEP_ALIVE_LEASE_SECONDS]);
        expect(await questPollen(owner.userId)).toBeCloseTo(
            settled - (LEASE_6H * 5) / 6,
            4,
        );
    });
});

test("keep-alive sweep services every flagged row and wraps the cursor", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const db = drizzle(env.DB);
    try {
        const ids: string[] = [];
        for (let i = 0; i < 3; i++) {
            const { sandboxID } = await (await createSandbox(owner.key)).json<{
                sandboxID: string;
            }>();
            ids.push(sandboxID);
            await post(owner.key, `/sandboxes/${sandboxID}/keep-alive`, {
                enabled: true,
            });
            const oneHourLeft = Math.floor(Date.now() / 1000) + 3600;
            e2b.sandboxes[i].endAt = new Date(oneHourLeft * 1000).toISOString();
            await db
                .update(sandboxKeepAlive)
                .set({ chargedUntil: oneHourLeft })
                .where(eq(sandboxKeepAlive.sandboxId, sandboxID));
        }
        const settled = await questPollen(owner.userId);
        // Ignore the enable-time extensions; only the tick's calls count.
        e2b.timeouts.length = 0;

        await runSandboxKeepAlive(env, silentLog);
        // Every row was serviced: three 5h gap charges, cursor wrapped.
        expect(await questPollen(owner.userId)).toBeCloseTo(
            settled - 3 * ((LEASE_6H * 5) / 6),
            3,
        );
        expect(
            (
                await db
                    .select({ value: sandboxKeepAliveMeta.value })
                    .from(sandboxKeepAliveMeta)
                    .where(eq(sandboxKeepAliveMeta.key, "cursor"))
            )[0]?.value,
        ).toBe("");
        expect(e2b.timeouts).toEqual(ids.map(() => KEEP_ALIVE_LEASE_SECONDS));
    } finally {
        await db.delete(sandboxKeepAlive);
        await db.delete(sandboxKeepAliveMeta);
    }
});
