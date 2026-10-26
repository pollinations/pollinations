import {
    createExecutionContext,
    createScheduledController,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { signSessionToken } from "@shared/auth/session-token.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import { apikey, user } from "@shared/db/better-auth.ts";
import { sandboxKeep, sandboxPort } from "@shared/db/sandbox.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";
import { sandboxPortHost } from "../src/routes/e2b.ts";

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
    // What the fake's metrics report.
    cpuUsedPct?: number;
};

type PortRequest = {
    host: string;
    method: string;
    path: string;
    trafficToken: string | null;
    body: string;
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
    const portRequests: PortRequest[] = [];
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
        // E2B's proxy in front of each sandbox port answers only while the
        // sandbox runs; the fake's server echoes what reached it.
        const port = url.hostname.match(/^(\d+)-(\w+)\.e2b\.app$/);
        if (port) {
            const sandbox = sandboxes.find((s) => s.sandboxID === port[2]);
            if (sandbox?.state !== "running") {
                return Response.json(
                    {
                        sandboxId: port[2],
                        message: "The sandbox was not found",
                        code: 502,
                    },
                    { status: 502 },
                );
            }
            portRequests.push({
                host: url.host,
                method: request.method,
                path: url.pathname + url.search,
                trafficToken: request.headers.get("e2b-traffic-access-token"),
                body: await request.text(),
            });
            // Like polli's websocat in front of sshd, but an echo.
            if (request.headers.get("upgrade") === "websocket") {
                const [client, server] = Object.values(new WebSocketPair());
                server.accept();
                server.addEventListener("message", (event) =>
                    server.send(`echo ${event.data}`),
                );
                return new Response(null, { status: 101, webSocket: client });
            }
            return new Response(`port ${port[1]} says hi`, {
                headers: { "x-app": "echo" },
            });
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
        if (call === "GET /metrics") {
            const start = Number(url.searchParams.get("start"));
            expect(Date.now() / 1000 - start).toBeCloseTo(300, -1);
            return Response.json(
                sandbox.cpuUsedPct === undefined
                    ? []
                    : [
                          {
                              timestampUnix: start,
                              cpuUsedPct: sandbox.cpuUsedPct,
                          },
                      ],
            );
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
            return Response.json(
                { ...sandbox, trafficAccessToken: "traffic" },
                { status: resumed ? 201 : 200 },
            );
        }
        return new Response("unexpected", { status: 500 });
    });
    return {
        sandboxes,
        files,
        portRequests,
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

const keeps = () => drizzle(env.DB).select().from(sandboxKeep);

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

test("a lease that runs out pauses the sandbox unless the caller asks E2B to kill it", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();

    // E2B's SDKs omit autoPause unless told `lifecycle.onTimeout`.
    expect((await createSandbox(owner.key)).status).toBe(201);
    expect((await createSandbox(owner.key, { autoPause: false })).status).toBe(
        201,
    );
    expect(e2b.sandboxes.map((s) => s.autoPause)).toEqual([true, false]);
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
    // The run ends 450 s from now: an hour's timeout pays the 150 s past the
    // paid 300 and keeps the sandbox for the rest, in a new run.
    e2b.sandboxes[0].startedAt = new Date(
        Date.now() - RUN_MS + 450_000,
    ).toISOString();

    const extended = await post(owner.key, `/sandboxes/${sandboxID}/timeout`, {
        timeout: 3600,
    });
    expect(extended.status).toBe(204);
    const [keep] = await keeps();
    expect(keep.sandboxId).toBe(sandboxID);
    expect(keep.until.getTime() - Date.now()).toBeCloseTo(3_600_000, -4);

    // E2B pauses the sandbox when the run ends; resuming pays a whole lease.
    await post(owner.key, `/sandboxes/${sandboxID}/pause`);
    e2b.sandboxes[0].startedAt = new Date(Date.now() - RUN_MS).toISOString();
    const resumed = await post(owner.key, `/sandboxes/${sandboxID}/connect`, {
        timeout: 300,
    });
    expect(resumed.status).toBe(201);

    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(3));
    expect(e2b.leases()[1].totalPrice).toBeCloseTo(LEASE_300S / 2, 5);
    expect(e2b.leases()[2].totalPrice).toBeCloseTo(LEASE_300S, 5);
    expect(await questPollen(owner.userId)).toBeCloseTo(
        10 - 2.5 * LEASE_300S,
        5,
    );
});

test("refuses keys without the scope, unpaid leases and closed endpoints", async () => {
    const e2b = stubE2b();

    const plain = await createTestApiKey({ user: { tierBalance: 10 } });
    const denied = await call(plain.key, "/v2/sandboxes");
    expect(denied.status).toBe(403);
    const { message } = await denied.json<{ message: string }>();
    expect(message).toContain("account:machines");
    // The link asks the owner to approve exactly the missing scope.
    expect(message).toContain(`/grant?id=${plain.id}&permission=machines`);

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

    // A user may run eight sandboxes at once.
    for (let i = 0; i < 8; i++) {
        expect((await createSandbox(owner.key)).status).toBe(201);
    }
    expect((await createSandbox(owner.key)).status).toBe(429);
    expect(e2b.sandboxes).toHaveLength(8);
    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(8));
});

test("a timeout over 10 minutes keeps the sandbox, paying 10 minutes at a time", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const week = 7 * 86_400;

    const created = await createSandbox(owner.key, { timeout: 3600 });
    expect(created.status).toBe(201);
    const [sandbox] = e2b.sandboxes;
    const [keep] = await keeps();
    expect(keep).toMatchObject({
        sandboxId: sandbox.sandboxID,
        apiKeyId: owner.id,
    });
    expect(keep.until.getTime() - Date.now()).toBeCloseTo(3_600_000, -4);
    // E2B gets 10 minutes at a time, paid in advance.
    expect(Date.parse(sandbox.endAt) - Date.parse(sandbox.startedAt)).toBe(
        600_000,
    );
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 2 * LEASE_300S, 8);

    // Kept from the dashboard's session, the owner pays the renewals.
    const token = await signSessionToken({
        secret: env.BETTER_AUTH_SECRET,
        userId: owner.userId,
    });
    expect((await createSandbox(token, { timeout: week })).status).toBe(201);
    expect((await keeps())[1]).toMatchObject({
        sandboxId: e2b.sandboxes[1].sandboxID,
        apiKeyId: null,
    });

    // As on E2B, `endAt` says when the timeout ends, in the list and for
    // the one sandbox.
    expect((await createSandbox(owner.key)).status).toBe(201);
    const listed = await (await call(owner.key, "/v2/sandboxes")).json<
        { endAt: string }[]
    >();
    expect(listed.map((sandbox) => Date.parse(sandbox.endAt))).toEqual([
        keep.until.getTime(),
        (await keeps())[1].until.getTime(),
        Date.parse(e2b.sandboxes[2].endAt),
    ]);
    const one = await call(owner.key, `/sandboxes/${sandbox.sandboxID}`);
    expect(Date.parse((await one.json<{ endAt: string }>()).endAt)).toBe(
        keep.until.getTime(),
    );
});

test("like E2B's timeout, a later timeout or a pause ends the keep, and connect never does", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const created = await createSandbox(owner.key);
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    const week = 7 * 86_400;
    const timeout = (seconds: number) =>
        post(owner.key, `/sandboxes/${sandboxID}/timeout`, {
            timeout: seconds,
        });
    const connect = (seconds: number) =>
        post(owner.key, `/sandboxes/${sandboxID}/connect`, {
            timeout: seconds,
        });

    // Kept from now: 10 minutes paid, 300 s past the paid 300.
    expect((await timeout(week)).status).toBe(204);
    expect(await keeps()).toHaveLength(1);
    expect(Date.parse(e2b.sandboxes[0].endAt) - Date.now()).toBeGreaterThan(
        590_000,
    );
    expect((await connect(300)).status).toBe(200);
    expect(await keeps()).toHaveLength(1);
    expect((await timeout(300)).status).toBe(204);
    expect(await keeps()).toHaveLength(0);

    // A paused sandbox resumed with a long timeout is kept again.
    expect((await timeout(week)).status).toBe(204);
    expect(
        (await post(owner.key, `/sandboxes/${sandboxID}/pause`)).status,
    ).toBe(204);
    expect(await keeps()).toHaveLength(0);
    expect((await connect(week)).status).toBe(201);
    expect(await keeps()).toHaveLength(1);
    expect(Date.parse(e2b.sandboxes[0].endAt) - Date.now()).toBeGreaterThan(
        590_000,
    );

    // A kept sandbox with a longer lease paid keeps all of it.
    e2b.sandboxes[0].endAt = inSeconds(5 * 3600);
    expect((await timeout(week)).status).toBe(204);
    expect(Date.parse(e2b.sandboxes[0].endAt) - Date.now()).toBeGreaterThan(
        5 * 3600_000 - 10_000,
    );

    // Created for 300 s, kept for 300 s more, kept again 300 s past the 300 s
    // timeout, resumed for 600 s; the longer lease costs nothing.
    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(4));
    const paid = e2b.leases().map((lease) => lease.totalPrice as number);
    expect(paid[0]).toBeCloseTo(LEASE_300S, 5);
    expect(paid[1]).toBeCloseTo(LEASE_300S, 4);
    expect(paid[2]).toBeCloseTo(LEASE_300S, 4);
    expect(paid[3]).toBeCloseTo(2 * LEASE_300S, 4);
});

test("the cron renews kept sandboxes until their timeout, resumes paused ones, and ends a keep its key or owner cannot pay", async () => {
    const e2b = stubE2b();
    const db = drizzle(env.DB);
    const owner = await sandboxKey();
    const other = await sandboxKey();
    const broke = await sandboxKey(0);
    const capped = await sandboxKey(10, 0);
    const revoked = await sandboxKey();
    await db
        .update(apikey)
        .set({ enabled: false })
        .where(eq(apikey.id, revoked.id));
    // Kept from the dashboard, without a key.
    const viewer = await sandboxKey();
    const banned = await sandboxKey();
    await db
        .update(user)
        .set({ banned: true })
        .where(eq(user.id, banned.userId));
    const sandbox = (
        sandboxID: string,
        userId: string,
        fields: Partial<Sandbox> = {},
    ) => ({
        sandboxID,
        startedAt: inSeconds(0),
        endAt: inSeconds(300),
        cpuCount: 2,
        memoryMB: 512,
        state: "running" as const,
        metadata: { pollinations_user: userId },
        ...fields,
    });
    e2b.sandboxes.push(
        sandbox("due", owner.userId),
        // Its run ends within the next lease, so it restarts.
        sandbox("old", owner.userId, {
            startedAt: inSeconds(300 - RUN_MS / 1000),
        }),
        sandbox("ended", owner.userId),
        sandbox("ending", other.userId),
        sandbox("paused", other.userId, {
            state: "paused",
            endAt: inSeconds(-600),
        }),
        sandbox("dashboard", viewer.userId),
        sandbox("later", other.userId, { endAt: inSeconds(1800) }),
        // Not kept.
        sandbox("unkept", broke.userId),
        sandbox("broke", broke.userId),
        sandbox("capped", capped.userId),
        sandbox("revoked", revoked.userId),
        sandbox("banned", banned.userId),
        sandbox("banned-key", banned.userId),
    );
    const until = new Date(Date.now() + 450_000);
    const month = new Date(Date.now() + 30 * 86_400_000);
    await db.insert(sandboxKeep).values([
        { sandboxId: "due", apiKeyId: owner.id, until: month },
        { sandboxId: "old", apiKeyId: owner.id, until: month },
        { sandboxId: "ended", apiKeyId: owner.id, until: new Date() },
        { sandboxId: "gone", apiKeyId: owner.id, until: month },
        { sandboxId: "ending", apiKeyId: other.id, until },
        { sandboxId: "paused", apiKeyId: other.id, until: month },
        { sandboxId: "later", apiKeyId: other.id, until: month },
        { sandboxId: "broke", apiKeyId: broke.id, until: month },
        { sandboxId: "capped", apiKeyId: capped.id, until: month },
        { sandboxId: "revoked", apiKeyId: revoked.id, until: month },
        { sandboxId: "dashboard", apiKeyId: null, until: month },
        { sandboxId: "banned", apiKeyId: null, until: month },
        { sandboxId: "banned-key", apiKeyId: banned.id, until: month },
    ]);
    const untouched = structuredClone(e2b.sandboxes.slice(6));
    untouched.unshift(structuredClone(e2b.sandboxes[2]));

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);

    const [due, old, , ending, paused, dashboard] = e2b.sandboxes;
    expect(Date.parse(due.endAt) - Date.now()).toBeGreaterThan(590_000);
    expect(old.state).toBe("running");
    expect(Date.now() - Date.parse(old.startedAt)).toBeLessThan(10_000);
    expect(Date.parse(old.endAt) - Date.now()).toBeGreaterThan(590_000);
    // Renewed only up to its timeout.
    expect(Math.abs(Date.parse(ending.endAt) - until.getTime())).toBeLessThan(
        2000,
    );
    expect(paused.state).toBe("running");
    expect(Date.parse(paused.endAt) - Date.now()).toBeGreaterThan(590_000);
    expect(Date.parse(dashboard.endAt) - Date.now()).toBeGreaterThan(590_000);
    expect([e2b.sandboxes[2], ...e2b.sandboxes.slice(6)]).toEqual(untouched);

    // Kept on: the renewed, the waiting; ended: the expired, the gone, those
    // whose key cannot pay or is revoked, and the banned owner's, with or
    // without a key.
    expect((await keeps()).map((keep) => keep.sandboxId).sort()).toEqual([
        "dashboard",
        "due",
        "ending",
        "later",
        "old",
        "paused",
    ]);

    // The renewals pay for 300 s past the paid 300, the restart and the
    // resume for 600 s, and the ending sandbox for the 150 s left.
    expect(e2b.leases()).toHaveLength(5);
    const paid = Object.fromEntries(
        e2b.leases().map((lease) => [lease.requestPath, lease]),
    );
    const renewal = paid["/alpha/e2b/sandboxes/due/timeout"];
    expect(renewal).toMatchObject({ userId: owner.userId, apiKeyId: owner.id });
    expect(renewal.totalPrice).toBeCloseTo(LEASE_300S, 4);
    expect(paid["/alpha/e2b/sandboxes/old/connect"].totalPrice).toBeCloseTo(
        2 * LEASE_300S,
        4,
    );
    const last = paid["/alpha/e2b/sandboxes/ending/timeout"];
    expect(last).toMatchObject({ userId: other.userId, apiKeyId: other.id });
    expect(last.totalPrice).toBeCloseTo(LEASE_300S / 2, 4);
    expect(paid["/alpha/e2b/sandboxes/paused/connect"].totalPrice).toBeCloseTo(
        2 * LEASE_300S,
        4,
    );
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 3 * LEASE_300S, 4);
    const byOwner = paid["/alpha/e2b/sandboxes/dashboard/timeout"];
    expect(byOwner).toMatchObject({ userId: viewer.userId });
    expect(byOwner.totalPrice).toBeCloseTo(LEASE_300S, 4);
    expect(await questPollen(broke.userId)).toBe(0);
    expect(await questPollen(capped.userId)).toBe(10);
    expect(await questPollen(banned.userId)).toBe(10);
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

test("anyone can read the prices, and they match what gen charges", async () => {
    stubE2b();
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/alpha/e2b/pricing",
    );
    expect(response.status).toBe(200);
    const pricing = await response.json<{
        maxRunning: number;
        vcpuSecond: number;
        gibSecond: number;
        templates: Record<string, { cpuCount: number; memoryMB: number }>;
    }>();
    expect(pricing).toMatchObject({
        maxRunning: 8,
        templates: { "pollinations-large": { cpuCount: 4, memoryMB: 8192 } },
    });
    // The fake's 2 vCPU, 512 MiB sandbox for 300 s.
    expect(
        300 * (2 * pricing.vcpuSecond + 0.5 * pricing.gibSecond),
    ).toBeCloseTo(LEASE_300S, 12);
});

test("the pollinations templates come logged in with a key from enter's key API", async () => {
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
            accountPermissions: ["profile", "usage", "machines"],
        },
    });

    // The large size is the same image, so it comes logged in too.
    const large = await createSandbox(owner.key, {
        templateID: "pollinations-large",
    });
    const { sandboxID: largeID } = await large.json<{ sandboxID: string }>();
    expect(e2b.files.map((file) => file.sandboxID)).toEqual([
        sandboxID,
        largeID,
    ]);
});

const SECRET = "a-webhook-secret-of-32-characters";

// A shared port's own host, as a webhook would reach it.
const visit = (
    host: string,
    path = "/",
    init: RequestInit & { headers?: Record<string, string> } = {},
) =>
    SELF.fetch(`https://${host}${path}`, {
        ...init,
        headers: { "x-pollinations-secret": SECRET, ...init.headers },
    });

const sharePort = (
    key: string,
    sandboxID: string,
    port: number,
    body: Record<string, unknown> = { secret: SECRET },
) =>
    call(key, `/sandboxes/${sandboxID}/ports/${port}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });

test("only hosts of the form <port>-<sandbox id> under the sites domain name a port", () => {
    expect(sandboxPortHost(env, "8080-ixyz123.pollinations.app")).toEqual({
        port: 8080,
        sandboxID: "ixyz123",
    });
    for (const host of [
        "gen.pollinations.ai",
        "pollinations.app",
        "8080-ixyz123--staging.pollinations.app",
        "ixyz123.pollinations.app",
        "0-ixyz123.pollinations.app",
        "65536-ixyz123.pollinations.app",
        "8080-ixyz123.a.pollinations.app",
        "8080-ixyz123.pollinations.app.evil",
        "8080-ixyz123.notpollinations.app",
    ]) {
        expect(sandboxPortHost(env, host), host).toBeNull();
    }
});

test("a shared port wakes its paused sandbox, paid in advance by the key that shared it", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const other = await sandboxKey();
    const created = await createSandbox(owner.key);
    const { sandboxID } = await created.json<{ sandboxID: string }>();

    // Only the owner can share it, and only with a secret.
    expect((await sharePort(other.key, sandboxID, 3000)).status).toBe(404);
    for (const body of [
        {},
        { secret: "too-short" },
        { secret: SECRET, header: "Authorization" },
    ]) {
        const refused = await sharePort(owner.key, sandboxID, 3000, body);
        expect(refused.status, JSON.stringify(body)).toBe(400);
    }
    const shared = await sharePort(owner.key, sandboxID, 3000);
    expect(shared.status).toBe(200);
    expect(await shared.json()).toEqual({
        url: `https://3000-${sandboxID}.pollinations.app`,
    });

    await post(owner.key, `/sandboxes/${sandboxID}/pause`);
    const host = `3000-${sandboxID}.pollinations.app`;
    // Without the secret, a request wakes nothing and costs nothing.
    for (const secret of ["", "a-wrong-secret-of-32-characters!"]) {
        const refused = await visit(host, "/", {
            headers: { "x-pollinations-secret": secret },
        });
        expect(refused.status).toBe(403);
        expect(await refused.text()).toBe(
            "This port needs the secret it was shared with in x-pollinations-secret.\n",
        );
    }
    expect(e2b.sandboxes[0].state).toBe("paused");
    expect(e2b.portRequests).toEqual([]);
    const response = await visit(host, "/hello?x=1", {
        method: "POST",
        body: "hi",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-app")).toBe("echo");
    expect(await response.text()).toBe("port 3000 says hi");
    expect(e2b.sandboxes[0].state).toBe("running");
    expect(e2b.portRequests).toEqual([
        {
            host: `3000-${sandboxID}.e2b.app`,
            method: "POST",
            path: "/hello?x=1",
            trafficToken: "traffic",
            body: "hi",
        },
    ]);

    // The wake is a connect, paid like the owner's own; requests inside the
    // lease pay nothing more, and still need the secret.
    await (await visit(host, "/again")).text();
    expect(e2b.portRequests).toHaveLength(2);
    const unsigned = await visit(host, "/", {
        headers: { "x-pollinations-secret": "" },
    });
    expect(unsigned.status).toBe(403);
    expect(e2b.portRequests).toHaveLength(2);
    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(2));
    const wake = e2b.leases()[1];
    expect(wake).toMatchObject({
        requestPath: `/alpha/e2b/sandboxes/${sandboxID}/connect`,
        userId: owner.userId,
        apiKeyId: owner.id,
    });
    expect(wake.totalPrice).toBeCloseTo(LEASE_300S, 5);
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 2 * LEASE_300S, 5);

    // A sandbox its owner paused inside the cached lease wakes again, and
    // still gets the request.
    await post(owner.key, `/sandboxes/${sandboxID}/pause`);
    const again = await visit(host, "/update", {
        method: "POST",
        body: "again",
    });
    expect(await again.text()).toBe("port 3000 says hi");
    expect(e2b.sandboxes[0].state).toBe("running");
    expect(e2b.portRequests.at(-1)).toMatchObject({
        path: "/update",
        body: "again",
    });
    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(3));
});

test("polli ssh's WebSocket to a shared port wakes the sandbox and passes through", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const created = await createSandbox(owner.key);
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    await sharePort(owner.key, sandboxID, 8022);
    await post(owner.key, `/sandboxes/${sandboxID}/pause`);

    const response = await visit(`8022-${sandboxID}.pollinations.app`, "/", {
        headers: { upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
    expect(e2b.sandboxes[0].state).toBe("running");
    expect(e2b.portRequests).toMatchObject([{ trafficToken: "traffic" }]);
    const socket = response.webSocket;
    if (!socket) throw new Error("no WebSocket");
    socket.accept();
    const reply = new Promise((resolve) =>
        socket.addEventListener("message", (event) => resolve(event.data)),
    );
    socket.send("SSH-2.0-OpenSSH_9.6");
    expect(await reply).toBe("echo SSH-2.0-OpenSSH_9.6");
    socket.close();
});

test("an unshared port, a gone sandbox or a payer who can't pay gets no wake", async () => {
    const e2b = stubE2b();
    const db = drizzle(env.DB);
    const owner = await sandboxKey();
    const broke = await sandboxKey(0);
    const created = await createSandbox(owner.key);
    const { sandboxID } = await created.json<{ sandboxID: string }>();

    const unshared = await visit(`4000-${sandboxID}.pollinations.app`);
    expect(unshared.status).toBe(404);
    expect(await unshared.text()).toBe("No sandbox port is shared here.\n");

    // Unsharing ends it at once, also where an isolate served it before.
    await sharePort(owner.key, sandboxID, 4000);
    const served = await visit(`4000-${sandboxID}.pollinations.app`);
    expect(await served.text()).toBe("port 4000 says hi");
    await db.delete(sandboxPort);
    expect((await visit(`4000-${sandboxID}.pollinations.app`)).status).toBe(
        404,
    );

    await sharePort(owner.key, sandboxID, 4000);
    const unshare = await call(
        owner.key,
        `/sandboxes/${sandboxID}/ports/4000`,
        {
            method: "DELETE",
        },
    );
    expect(unshare.status).toBe(204);
    expect((await visit(`4000-${sandboxID}.pollinations.app`)).status).toBe(
        404,
    );

    // A killed sandbox's port stops being shared.
    await sharePort(owner.key, sandboxID, 4001);
    await call(owner.key, `/sandboxes/${sandboxID}`, { method: "DELETE" });
    expect((await visit(`4001-${sandboxID}.pollinations.app`)).status).toBe(
        404,
    );
    expect(await db.select().from(sandboxPort)).toEqual([]);

    e2b.sandboxes.push({
        sandboxID: "asleep",
        startedAt: inSeconds(-600),
        endAt: inSeconds(-300),
        cpuCount: 2,
        memoryMB: 512,
        state: "paused",
        metadata: { pollinations_user: broke.userId },
    });
    expect((await sharePort(broke.key, "asleep", 4002)).status).toBe(200);
    const refused = await visit("4002-asleep.pollinations.app");
    expect(refused.status).toBe(402);
    expect(await refused.text()).toMatch(
        /^This sandbox is asleep and could not be woken: Insufficient balance\..*Top up at https:\/\//,
    );
    expect(e2b.sandboxes.at(-1)?.state).toBe("paused");
    expect(e2b.portRequests.map((request) => request.host)).toEqual([
        `4000-${sandboxID}.e2b.app`,
    ]);
    expect(await questPollen(broke.userId)).toBe(0);
});

test("an idle timeout is opt-in, needs a kept E2B sandbox, and stays until turned off", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const unkept = await createSandbox(owner.key, { idleTimeout: 900 });
    expect(unkept.status).toBe(400);
    expect(await unkept.json()).toEqual({
        code: 400,
        message: "idleTimeout needs a timeout longer than 600 seconds",
    });
    const short = await createSandbox(owner.key, {
        timeout: 3600,
        idleTimeout: 60,
    });
    expect(short.status).toBe(400);
    const azure = await createSandbox(owner.key, {
        templateID: "pollinations-azure",
        timeout: 3600,
        idleTimeout: 900,
    });
    expect(await azure.json()).toEqual({
        code: 400,
        message: "Azure sandboxes have no idleTimeout.",
    });
    expect(e2b.sandboxes).toEqual([]);

    const created = await createSandbox(owner.key, {
        timeout: 3600,
        idleTimeout: 900,
    });
    expect(created.status).toBe(201);
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    const [keep] = await keeps();
    expect(keep).toMatchObject({ sandboxId: sandboxID, idleTimeout: 900 });
    expect(Date.now() - (keep.activeAt?.getTime() ?? 0)).toBeLessThan(10_000);

    // E2B's SDKs know nothing of it: a later timeout without it keeps it,
    // and 0 turns it off.
    await post(owner.key, `/sandboxes/${sandboxID}/timeout`, {
        timeout: 7200,
    });
    expect(await keeps()).toMatchObject([
        { sandboxId: sandboxID, idleTimeout: 900 },
    ]);
    await post(owner.key, `/sandboxes/${sandboxID}/timeout`, {
        timeout: 7200,
        idleTimeout: 0,
    });
    expect(await keeps()).toMatchObject([
        { sandboxId: sandboxID, idleTimeout: null },
    ]);
    // It comes with a timeout that keeps the sandbox, so a short connect
    // can't seem to change it.
    const connect = await post(owner.key, `/sandboxes/${sandboxID}/connect`, {
        idleTimeout: 900,
    });
    expect(connect.status).toBe(400);
    expect(await keeps()).toMatchObject([
        { sandboxId: sandboxID, idleTimeout: null },
    ]);
});

// A kept sandbox of `userId`'s that started an hour ago.
const keptSandbox = (
    sandboxID: string,
    userId: string,
    fields: Partial<Sandbox> = {},
): Sandbox => ({
    sandboxID,
    startedAt: inSeconds(-3600),
    endAt: inSeconds(300),
    cpuCount: 2,
    memoryMB: 512,
    state: "running",
    metadata: { pollinations_user: userId },
    ...fields,
});

const runCron = async () => {
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);
};

test("the cron pauses a kept sandbox idle past its idle timeout, leaves it paused, and resumes one paused while active", async () => {
    const e2b = stubE2b();
    const db = drizzle(env.DB);
    const owner = await sandboxKey();
    // polli in a sandbox uses the sandbox's own key: a request with it is
    // activity, but only for the owner's sandbox.
    const ownKey = await createTestApiKey({
        userId: owner.userId,
        name: "polli-sandbox-agent",
    });
    const strangersKey = await createTestApiKey({
        name: "polli-sandbox-idle",
    });
    await db
        .update(apikey)
        .set({ lastRequest: new Date(Date.now() - 60_000) })
        .where(inArray(apikey.id, [ownKey.id, strangersKey.id]));
    // An idle CPU, unless said otherwise.
    const quiet = { cpuUsedPct: 2 };
    e2b.sandboxes.push(
        keptSandbox("idle", owner.userId, quiet),
        keptSandbox("active", owner.userId, quiet),
        keptSandbox("agent", owner.userId, quiet),
        keptSandbox("busy", owner.userId, { cpuUsedPct: 80 }),
        // Resumed a minute ago, by a wake.
        keptSandbox("woken", owner.userId, {
            ...quiet,
            startedAt: inSeconds(-60),
        }),
        // No metrics yet: a job may run.
        keptSandbox("unmeasured", owner.userId),
        keptSandbox("asleep", owner.userId, {
            state: "paused",
            endAt: inSeconds(-600),
        }),
        // Paused without being idle, as by a failed restart.
        keptSandbox("stalled", owner.userId, {
            state: "paused",
            endAt: inSeconds(-600),
        }),
    );
    const month = new Date(Date.now() + 30 * 86_400_000);
    const longAgo = new Date(Date.now() - 1000_000);
    await db.insert(sandboxKeep).values(
        e2b.sandboxes.map(({ sandboxID }) => ({
            sandboxId: sandboxID,
            apiKeyId: owner.id,
            until: month,
            idleTimeout: 900,
            activeAt: ["active", "stalled"].includes(sandboxID)
                ? new Date(Date.now() - 100_000)
                : longAgo,
        })),
    );

    await runCron();

    const state = Object.fromEntries(
        e2b.sandboxes.map((s) => [s.sandboxID, s.state]),
    );
    expect(state).toEqual({
        idle: "paused",
        active: "running",
        agent: "running",
        busy: "running",
        woken: "running",
        unmeasured: "running",
        asleep: "paused",
        stalled: "running",
    });
    const renewed = e2b.sandboxes.filter(
        (s) => !["idle", "asleep"].includes(s.sandboxID),
    );
    for (const sandbox of renewed) {
        expect(
            Date.parse(sandbox.endAt) - Date.now(),
            sandbox.sandboxID,
        ).toBeGreaterThan(590_000);
    }
    // Pausing ends no keep; a busy CPU is activity from now on.
    const kept = Object.fromEntries(
        (await keeps()).map((keep) => [keep.sandboxId, keep]),
    );
    expect(Object.keys(kept).sort()).toEqual([
        "active",
        "agent",
        "asleep",
        "busy",
        "idle",
        "stalled",
        "unmeasured",
        "woken",
    ]);
    expect(Date.now() - (kept.busy.activeAt?.getTime() ?? 0)).toBeLessThan(
        10_000,
    );
    // Only the renewals cost anything.
    expect(e2b.leases()).toHaveLength(renewed.length);
});

test("a request to a shared port wakes a sandbox paused while idle, and a connect is activity", async () => {
    const e2b = stubE2b();
    const db = drizzle(env.DB);
    const owner = await sandboxKey();
    e2b.sandboxes.push(
        keptSandbox("dozing", owner.userId, {
            state: "paused",
            endAt: inSeconds(-600),
        }),
        keptSandbox("sshed", owner.userId),
    );
    const longAgo = new Date(Date.now() - 1000_000);
    await db.insert(sandboxKeep).values(
        ["dozing", "sshed"].map((sandboxId) => ({
            sandboxId,
            apiKeyId: owner.id,
            until: new Date(Date.now() + 86_400_000),
            idleTimeout: 900,
            activeAt: longAgo,
        })),
    );
    // Telegram sends a webhook's secret_token in its own header.
    const header = "X-Telegram-Bot-Api-Secret-Token";
    await sharePort(owner.key, "dozing", 8443, { secret: SECRET, header });

    const response = await visit("8443-dozing.pollinations.app", "/telegram", {
        method: "POST",
        body: "{}",
        headers: { "x-pollinations-secret": "", [header]: SECRET },
    });
    expect(await response.text()).toBe("port 8443 says hi");
    // polli ssh renews its lease with a connect.
    expect((await post(owner.key, "/sandboxes/sshed/connect", {})).status).toBe(
        200,
    );
    const activeAt = Object.fromEntries(
        (await keeps()).map((keep) => [keep.sandboxId, keep.activeAt]),
    );
    expect(Date.now() - (activeAt.dozing?.getTime() ?? 0)).toBeLessThan(10_000);
    expect(Date.now() - (activeAt.sshed?.getTime() ?? 0)).toBeLessThan(10_000);

    // The cron keeps both running.
    await runCron();
    expect(e2b.sandboxes.map((s) => s.state)).toEqual(["running", "running"]);
    expect(Date.parse(e2b.sandboxes[0].endAt) - Date.now()).toBeGreaterThan(
        590_000,
    );
});
