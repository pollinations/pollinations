import {
    createExecutionContext,
    createScheduledController,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { azureSandbox, sandboxKeep } from "@shared/db/sandbox.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";

const GROUP =
    "https://management.eastus.azuredevcompute.io/subscriptions/s/resourceGroups/r/sandboxGroups/g";
// Azure is off in the test environment unless a test turns it on.
const azureEnv = {
    ...env,
    AZURE_SANDBOX_CLIENT_SECRET: "not-a-secret-workers-test-only",
    AZURE_SANDBOX_CLIENT_ID: "client",
    AZURE_SANDBOX_TENANT_ID: "tenant",
    AZURE_SANDBOX_GROUP_URL: GROUP,
    AZURE_SANDBOX_IMAGE: "image",
};
// A second of the 2 vCPU, 2 GiB template: what Azure charges us, and the 25%
// of it the caller pays.
const COST_SECOND = 2 * 0.000024 + 2 * 0.000003;
const PRICE_SECOND = COST_SECOND * 0.25;

type Box = {
    id: string;
    state: string;
    createdAt: string;
    labels: Record<string, string>;
    resources?: unknown;
    environment?: Record<string, string>;
    lifecycle?: unknown;
    ports?: unknown;
    cmd?: string[];
    sourcesRef?: unknown;
};

// A tiny in-memory Azure sandbox group, with Entra's login, envd in each box,
// an empty E2B team and Tinybird. Everything else goes to the real fetch.
function stubAzure() {
    const boxes: Box[] = [];
    const events: Record<string, unknown>[] = [];
    const envd: { url: string; headers: Headers }[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin === new URL(env.TINYBIRD_INGEST_URL).origin) {
            events.push(JSON.parse(await request.text()));
            return new Response(null, { status: 202 });
        }
        if (url.hostname === "login.microsoftonline.com") {
            const form = new URLSearchParams(await request.text());
            expect(url.pathname).toBe("/tenant/oauth2/v2.0/token");
            expect(form.get("scope")).toBe(
                "https://dynamicsessions.io/.default",
            );
            return Response.json({ access_token: "azure", expires_in: 3600 });
        }
        if (
            url.hostname.endsWith(".eastus.adcproxy.io") ||
            url.hostname === "sandbox.e2b.app"
        ) {
            envd.push({ url: request.url, headers: request.headers });
            return url.pathname === "/files"
                ? Response.json([{ type: "file" }])
                : new Response(null, { status: 204 });
        }
        if (url.origin === "https://api.e2b.app") return Response.json([]);
        if (!request.url.startsWith(GROUP)) return realFetch(input, init);
        expect(request.headers.get("authorization")).toBe("Bearer azure");
        expect(url.searchParams.get("api-version")).toBe("2026-02-01-preview");
        const path = url.pathname.slice(new URL(GROUP).pathname.length);
        if (path === "/sandboxes" && request.method === "PUT") {
            const box: Box = {
                ...(await request.json<Omit<Box, "id">>()),
                id: crypto.randomUUID(),
                state: "Running",
                createdAt: new Date().toISOString(),
            };
            boxes.push(box);
            return Response.json(box);
        }
        if (path === "/sandboxes") {
            const [key, value] =
                url.searchParams.get("labels")?.split("=") ?? [];
            return Response.json(
                boxes.filter((box) => !key || box.labels[key] === value),
            );
        }
        const [, id, action = ""] =
            path.match(/^\/sandboxes\/([^/]+)(?:\/(\w+))?$/) ?? [];
        const box = boxes.find((found) => found.id === id);
        if (!box) return Response.json({ error: "not found" }, { status: 404 });
        const call = `${request.method} ${action}`;
        if (call === "GET ") return Response.json(box);
        if (call === "DELETE ") {
            boxes.splice(boxes.indexOf(box), 1);
            return new Response(null, { status: 202 });
        }
        if (call === "POST stop") box.state = "Stopped";
        else if (call === "POST resume") box.state = "Running";
        else return new Response("unexpected", { status: 500 });
        return new Response(null, { status: 202 });
    });
    return {
        boxes,
        envd,
        leases: () => events.filter((e) => e.eventType === "sandbox.lease"),
    };
}

const fetchGen = async (
    key: string,
    path: string,
    init: RequestInit = {},
    bindings: typeof env = azureEnv,
) => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai/alpha/e2b${path}`, {
            ...init,
            headers: {
                "x-api-key": key,
                "content-type": "application/json",
                ...init.headers,
            },
        }),
        bindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
};

const post = (key: string, path: string, body: unknown) =>
    fetchGen(key, path, { method: "POST", body: JSON.stringify(body) });

const sandboxKey = () =>
    createTestApiKey({
        accountPermissions: ["machines", "keys"],
        user: { tierBalance: 10 },
    });

const rows = () => drizzle(env.DB).select().from(azureSandbox);

afterEach(() => {
    vi.unstubAllGlobals();
});

test("an Azure template runs on Azure behind E2B's API, paid at 25% of Azure's rates", async () => {
    const azure = stubAzure();
    const owner = await sandboxKey();
    const other = await sandboxKey();

    expect(
        (
            await post(owner.key, "/v2/sandboxes", {
                templateID: "pollinations-azure",
                timeout: -60,
            })
        ).status,
    ).toBe(400);
    expect(azure.boxes).toEqual([]);

    const created = await post(owner.key, "/v2/sandboxes", {
        templateID: "pollinations-azure",
        timeout: 300,
        metadata: { app: "demo", pollinations_user: other.userId },
        envVars: { GREETING: "hi" },
    });
    expect(created.status).toBe(201);
    const sandbox = await created.json<{
        sandboxID: string;
        envdAccessToken: string;
        domain: string;
    }>();
    expect(sandbox.domain).toBe("eastus.adcproxy.io");
    const [box] = azure.boxes;
    expect(box).toMatchObject({
        id: sandbox.sandboxID,
        sourcesRef: { diskImage: { id: "image" } },
        resources: { cpu: "2000m", memory: "2048Mi" },
        labels: { pollinations_user: owner.userId },
        // envd gets a token of its own, which Azure never shows again.
        environment: {
            POLLI_ENVD_INIT: JSON.stringify({
                accessToken: sandbox.envdAccessToken,
                defaultUser: "user",
                envVars: { GREETING: "hi" },
            }),
        },
        lifecycle: { autoSuspendPolicy: { enabled: false } },
        cmd: ["/usr/local/bin/polli-box"],
    });
    expect(sandbox.envdAccessToken).toMatch(/^[0-9a-f]{64}$/);

    // The lease runs on to the cron's next run, which stops the box, and the
    // caller pays for all of it.
    const [row] = await rows();
    const seconds = (row.endAt.getTime() - row.startedAt.getTime()) / 1000;
    expect(row.endAt.getTime() % 300_000).toBe(0);
    expect(seconds).toBeGreaterThanOrEqual(300);
    expect(seconds).toBeLessThan(600);
    expect(azure.leases()).toHaveLength(1);
    expect(azure.leases()[0]).toMatchObject({
        userId: owner.userId,
        modelProviderUsed: "azure",
    });
    // Charges round to the 1e-8 ledger unit, so allow one rounding step.
    expect(azure.leases()[0].totalCost).toBeCloseTo(seconds * COST_SECOND, 7);
    expect(azure.leases()[0].totalPrice).toBeCloseTo(seconds * PRICE_SECOND, 7);
    expect(
        (await getUserBalance(drizzle(env.DB), owner.userId)).tierBalance,
    ).toBeCloseTo(10 - seconds * PRICE_SECOND, 7);
    // The template's listed rates are the ones it was charged.
    const pricing = await (await fetchGen("", "/pricing")).json<{
        templates: Record<string, { vcpuSecond: number; gibSecond: number }>;
    }>();
    const rates = pricing.templates["pollinations-azure"];
    expect(azure.leases()[0].totalPrice).toBeCloseTo(
        seconds * (2 * rates.vcpuSecond + 2 * rates.gibSecond),
        7,
    );

    // It comes logged in, through envd at Azure's port URL.
    const login = azure.envd.find((call) =>
        call.url.startsWith(
            `https://${sandbox.sandboxID}--49983.eastus.adcproxy.io/files?`,
        ),
    );
    expect(login?.headers.get("x-access-token")).toBe(sandbox.envdAccessToken);

    const listed = await fetchGen(owner.key, "/v2/sandboxes");
    expect(await listed.json()).toMatchObject([
        {
            sandboxID: sandbox.sandboxID,
            templateID: "pollinations-azure",
            cpuCount: 2,
            memoryMB: 2048,
            state: "running",
            metadata: { app: "demo", pollinations_user: owner.userId },
        },
    ]);
    expect(await (await fetchGen(other.key, "/v2/sandboxes")).json()).toEqual(
        [],
    );
    const path = `/sandboxes/${sandbox.sandboxID}`;
    expect((await fetchGen(other.key, path)).status).toBe(404);

    expect((await fetchGen(owner.key, path, { method: "DELETE" })).status).toBe(
        204,
    );
    expect(azure.boxes).toEqual([]);
    expect(await rows()).toEqual([]);
});

test("pause stops the box, connect resumes it, and the cron stops boxes whose lease ended", async () => {
    const azure = stubAzure();
    const owner = await sandboxKey();
    const create = async (timeout: number) => {
        const response = await post(owner.key, "/v2/sandboxes", {
            templateID: "pollinations-azure",
            timeout,
            metadata: {},
        });
        return (await response.json<{ sandboxID: string }>()).sandboxID;
    };
    const state = (id: string) =>
        azure.boxes.find((box) => box.id === id)?.state;

    const paused = await create(300);
    expect(
        (await post(owner.key, `/sandboxes/${paused}/pause`, {})).status,
    ).toBe(204);
    expect(state(paused)).toBe("Stopped");
    expect(
        (await post(owner.key, `/sandboxes/${paused}/pause`, {})).status,
    ).toBe(409);
    // A paused sandbox has no lease to extend.
    expect(
        (await post(owner.key, `/sandboxes/${paused}/timeout`, { timeout: 60 }))
            .status,
    ).toBe(404);
    const resumed = await post(owner.key, `/v2/sandboxes/${paused}/connect`, {
        timeout: 300,
    });
    expect(resumed.status).toBe(201);
    expect(state(paused)).toBe("Running");
    // The resume paid a new lease.
    expect(azure.leases()).toHaveLength(2);

    // A lease that ran out, a kept sandbox the keeper renews, a box gen never
    // recorded, one being created right now, and an image builder's box.
    const expired = await create(300);
    const kept = await create(3600);
    const db = drizzle(env.DB);
    await db
        .update(azureSandbox)
        .set({ endAt: new Date(Date.now() - 1000) })
        .where(eq(azureSandbox.sandboxId, expired));
    expect(await db.select().from(sandboxKeep)).toMatchObject([
        { sandboxId: kept },
    ]);
    const ago = new Date(Date.now() - 120_000).toISOString();
    azure.boxes.push(
        {
            id: crypto.randomUUID(),
            state: "Running",
            createdAt: ago,
            labels: { pollinations_user: owner.userId },
        },
        {
            id: crypto.randomUUID(),
            state: "Running",
            createdAt: new Date().toISOString(),
            labels: { pollinations_user: owner.userId },
        },
        {
            id: crypto.randomUUID(),
            state: "Running",
            createdAt: ago,
            labels: { pollinations_role: "image-builder" },
        },
    );

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), azureEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(azure.boxes.map((box) => box.state)).toEqual([
        "Running",
        "Stopped",
        "Running",
        "Stopped",
        "Running",
        "Running",
    ]);
    const row = await db
        .select()
        .from(azureSandbox)
        .where(eq(azureSandbox.sandboxId, kept))
        .get();
    expect(row?.endAt.getTime()).toBeGreaterThan(Date.now() + 590_000);
});

test("Azure templates refuse to start until Azure is configured", async () => {
    stubAzure();
    const owner = await sandboxKey();
    const response = await fetchGen(
        owner.key,
        "/v2/sandboxes",
        {
            method: "POST",
            body: JSON.stringify({ templateID: "pollinations-azure" }),
        },
        env,
    );
    expect(response.status).toBe(503);
    expect((await fetchGen(owner.key, "/v2/sandboxes", {}, env)).status).toBe(
        200,
    );
    const envdCall = await fetchGen(
        "",
        "/sandbox/health",
        {
            headers: {
                "e2b-sandbox-id": crypto.randomUUID(),
                "e2b-sandbox-port": "49983",
            },
        },
        env,
    );
    expect(envdCall.status).toBe(404);
});

test("E2B's SDKs reach envd in either provider's sandboxes through gen", async () => {
    const azure = stubAzure();
    const id = crypto.randomUUID();
    const envdCall = (sandbox: string, port: string) =>
        fetchGen("", "/sandbox/files?path=/x", {
            headers: {
                "e2b-sandbox-id": sandbox,
                "e2b-sandbox-port": port,
                "x-access-token": "token",
            },
        });

    const response = await envdCall(id, "49983");
    expect(await response.json()).toEqual([{ type: "file" }]);
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(azure.envd.at(-1)?.url).toBe(
        `https://${id}--49983.eastus.adcproxy.io/files?path=/x`,
    );
    expect(azure.envd.at(-1)?.headers.get("x-access-token")).toBe("token");

    // E2B routes by the same headers.
    expect((await envdCall("abc123", "49983")).status).toBe(200);
    expect(azure.envd.at(-1)?.url).toBe(
        "https://sandbox.e2b.app/files?path=/x",
    );
    expect(azure.envd.at(-1)?.headers.get("e2b-sandbox-id")).toBe("abc123");

    // Only envd's port.
    expect((await envdCall(id, "8022")).status).toBe(400);
    expect((await envdCall("../x", "49983")).status).toBe(404);
});
