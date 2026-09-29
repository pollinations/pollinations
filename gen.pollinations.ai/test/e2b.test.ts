import { env, SELF } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";

const E2B = "https://api.e2b.app";
// The fake's 2 vCPU, 512 MiB sandbox for 300 s, at E2B's list rates.
const LEASE_300S = 300 * (2 * 0.000014 + 0.5 * 0.0000045);

type Sandbox = {
    sandboxID: string;
    startedAt: string;
    endAt: string;
    cpuCount: number;
    memoryMB: number;
    state: "running" | "paused";
    metadata: Record<string, string>;
};

const inSeconds = (seconds: number) =>
    new Date(Date.now() + seconds * 1000).toISOString();

// A tiny in-memory E2B control API that also records Tinybird events.
// Everything else goes to the real fetch, which the test environment needs.
function stubE2b() {
    const sandboxes: Sandbox[] = [];
    const events: Record<string, unknown>[] = [];
    let created = 0;
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin === new URL(env.TINYBIRD_INGEST_URL).origin) {
            events.push(JSON.parse(await request.text()));
            return new Response(null, { status: 202 });
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
            const sandbox: Sandbox = {
                sandboxID: `sbx${++created}`,
                startedAt: inSeconds(0),
                endAt: inSeconds(body.timeout ?? 300),
                cpuCount: 2,
                memoryMB: 512,
                state: "running",
                metadata: body.metadata ?? {},
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
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - LEASE_300S, 8);
    await vi.waitFor(() => expect(e2b.leases()).toHaveLength(1));
    expect(e2b.leases()[0]).toMatchObject({
        userId: owner.userId,
        modelProviderUsed: "e2b",
        isBilledUsage: true,
    });
    expect(e2b.leases()[0].totalPrice).toBeCloseTo(LEASE_300S, 8);

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

    const own = await call(owner.key, "/v2/sandboxes");
    expect(await own.json()).toMatchObject([{ sandboxID }]);
    const killed = await call(owner.key, `/sandboxes/${sandboxID}`, {
        method: "DELETE",
    });
    expect(killed.status).toBe(204);
    expect(e2b.sandboxes).toEqual([]);
});

test("each second of a lease is paid once", async () => {
    const e2b = stubE2b();
    const owner = await sandboxKey();
    const created = await createSandbox(owner.key);
    const { sandboxID } = await created.json<{ sandboxID: string }>();
    const timeout = (seconds: number) =>
        post(owner.key, `/sandboxes/${sandboxID}/timeout`, {
            timeout: seconds,
        });
    const connect = (seconds?: number) =>
        post(
            owner.key,
            `/v2/sandboxes/${sandboxID}/connect`,
            seconds === undefined ? undefined : { timeout: seconds },
        );
    const pause = () => post(owner.key, `/sandboxes/${sandboxID}/pause`);

    // Pausing and resuming within the 300 s paid at create costs nothing.
    expect((await pause()).status).toBe(204);
    expect((await connect(200)).status).toBe(201);
    // 600 s from now extends the paid 300 s by about 300 s.
    expect((await timeout(600)).status).toBe(204);
    // Shortening, then extending again within the paid 600 s, costs nothing.
    expect((await timeout(60)).status).toBe(204);
    expect(Date.parse(e2b.sandboxes[0].endAt)).toBeLessThan(
        Date.now() + 100_000,
    );
    expect((await timeout(500)).status).toBe(204);
    // So does connecting with E2B's default lease of 300 s.
    expect((await connect()).status).toBe(200);
    // Resuming for 900 s pays only for the 300 s past the paid 600 s.
    expect((await pause()).status).toBe(204);
    expect((await connect(900)).status).toBe(201);

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
