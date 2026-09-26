import { env, runDurableObjectAlarm, SELF } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";

const SMOL = "https://api.smolmachines.com";
// 1 vCPU, 1 GB and 5 GB, the create defaults, at smol's list rates.
const HOURLY = 0.1067;

type Machine = Record<string, unknown> & { id: string; name: string };

// A tiny in-memory smol cloud that also records Tinybird events. Everything
// else goes to the real fetch, which the test environment needs.
function stubSmol(machines: Machine[] = []) {
    const events: Record<string, unknown>[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin === new URL(env.TINYBIRD_INGEST_URL).origin) {
            events.push(JSON.parse(await request.text()));
            return new Response(null, { status: 202 });
        }
        if (url.origin !== SMOL) return realFetch(input, init);
        expect(request.headers.get("authorization")).toBe(
            "Bearer not-a-secret-workers-test-only",
        );
        const path = url.pathname;
        if (path === "/v1/machines" && request.method === "GET") {
            return Response.json(machines);
        }
        if (path === "/v1/machines" && request.method === "POST") {
            const body = (await request.json()) as Record<string, unknown>;
            const machine = {
                id: `mach-${machines.length + 1}`,
                name: body.name as string,
                state: "stopped",
                source: body.source,
                resources: body.resources,
                autoStopSeconds: body.autoStopSeconds ?? null,
                createdAt: "2026-09-21T00:00:00Z",
            };
            machines.push(machine);
            return Response.json(machine, { status: 201 });
        }
        const [, id, rest] = path.match(/^\/v1\/machines\/([^/]+)(.*)$/) ?? [];
        const machine = machines.find((m) => m.id === id);
        if (!machine) return new Response("not found", { status: 404 });
        if (rest === "" && request.method === "GET") {
            return Response.json(machine);
        }
        if (rest === "/start" || rest === "/stop") {
            machine.state = rest === "/start" ? "started" : "stopped";
            return Response.json(machine);
        }
        if (rest === "/exec") {
            return Response.json({
                stdout: "hi\n",
                stderr: "",
                exitCode: 0,
                durationMs: 5,
                stdoutB64: "aGkK",
            });
        }
        if (rest === "" && request.method === "DELETE") {
            machines.splice(machines.indexOf(machine), 1);
            return new Response(null, { status: 204 });
        }
        return new Response("unexpected", { status: 500 });
    });
    return {
        machines,
        hours: () => events.filter((e) => e.eventType === "machine.hour"),
    };
}

const call = (key: string, path: string, init?: RequestInit) =>
    SELF.fetch(`https://gen.pollinations.ai${path}`, {
        ...init,
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
    });

const create = (key: string, name: string, image = "alpine") =>
    call(key, "/machines", {
        method: "POST",
        body: JSON.stringify({ name, image }),
    });

const machineKey = (tierBalance = 10, pollenBudget?: number) =>
    createTestApiKey({
        accountPermissions: ["machines"],
        pollenBudget,
        user: { tierBalance },
    });

const questPollen = async (userId: string) =>
    (await getUserBalance(drizzle(env.DB), userId)).tierBalance;

// Moves the clock past the paid hour and fires the machine's meter alarm.
async function nextHour(machineId: string) {
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    return runDurableObjectAlarm(env.MACHINE_METER.getByName(machineId));
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

test("creates, lists, execs and deletes a machine for its owner only", async () => {
    const smol = stubSmol();
    const owner = await machineKey();
    const other = await machineKey();

    const created = await call(owner.key, "/machines", {
        method: "POST",
        body: JSON.stringify({
            name: "my-agent",
            image: "node:22-bookworm-slim",
            command: ["node", "agent.js"],
        }),
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
        name: "my-agent",
        state: "started",
        image: "node:22-bookworm-slim",
        cpus: 1,
        memoryMb: 1024,
        diskGb: 5,
        pricePerHour: HOURLY,
    });
    expect(smol.machines[0].name).toMatch(/^p-[0-9a-f]{20}-my-agent$/);

    const listed = await call(owner.key, "/machines");
    expect(await listed.json()).toMatchObject({ data: [{ name: "my-agent" }] });

    // The other user sees nothing and cannot address the owner's machine.
    expect(await (await call(other.key, "/machines")).json()).toEqual({
        data: [],
    });
    expect((await call(other.key, "/machines/my-agent")).status).toBe(404);

    const exec = await call(owner.key, "/machines/my-agent/exec", {
        method: "POST",
        body: JSON.stringify({ command: ["echo", "hi"] }),
    });
    expect(await exec.json()).toEqual({
        stdout: "hi\n",
        stderr: "",
        exitCode: 0,
        durationMs: 5,
    });

    // Creating paid the first hour; the exec ran inside it.
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - HOURLY, 8);

    const deleted = await call(owner.key, "/machines/my-agent", {
        method: "DELETE",
    });
    expect(await deleted.json()).toEqual({ deleted: true });
    expect(smol.machines).toHaveLength(0);
});

test("rejects the fourth machine and invalid names", async () => {
    stubSmol();
    const owner = await machineKey();
    for (const name of ["a", "b", "c"]) {
        expect((await create(owner.key, name)).status).toBe(200);
    }
    expect((await create(owner.key, "d")).status).toBe(403);
    expect((await create(owner.key, "Bad_Name")).status).toBe(400);
});

test("requires the machines permission on the key", async () => {
    stubSmol();
    const { key } = await createTestApiKey({
        accountPermissions: ["keys"],
        user: { tierBalance: 10 },
    });
    expect((await call(key, "/machines")).status).toBe(403);
});

test("refuses a machine the wallet or key budget cannot run for an hour", async () => {
    const smol = stubSmol();
    const broke = await machineKey(0.05);
    const response = await create(broke.key, "a");
    expect(response.status).toBe(402);
    expect(await response.text()).toContain("Insufficient balance");

    const capped = await machineKey(10, 0.05);
    const budget = await create(capped.key, "a");
    expect(budget.status).toBe(402);
    expect(await budget.text()).toContain("API key budget too low");

    // Nothing is left behind and nothing was charged.
    expect(smol.machines).toHaveLength(0);
    expect(await questPollen(broke.userId)).toBe(0.05);
});

test("bills each further hour once while the machine runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const smol = stubSmol();
    const owner = await machineKey();
    await create(owner.key, "a");
    const { id } = smol.machines[0];

    expect(await nextHour(id)).toBe(true);
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 2 * HOURLY, 8);

    // An alarm that fires again inside a paid hour charges nothing.
    expect(await runDurableObjectAlarm(env.MACHINE_METER.getByName(id))).toBe(
        true,
    );
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 2 * HOURLY, 8);
    // One billed event per charged hour.
    expect(smol.hours()).toMatchObject([
        { userId: owner.userId, apiKeyId: owner.id, totalPrice: HOURLY },
        { userId: owner.userId, apiKeyId: owner.id, totalPrice: HOURLY },
    ]);
});

test("a stopped machine costs nothing until it starts again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const smol = stubSmol();
    const owner = await machineKey();
    await create(owner.key, "a");
    const { id } = smol.machines[0];
    await call(owner.key, "/machines/a/stop", { method: "POST" });

    expect(await nextHour(id)).toBe(true);
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - HOURLY, 8);
    // The meter is cleared: no alarm is left.
    expect(await runDurableObjectAlarm(env.MACHINE_METER.getByName(id))).toBe(
        false,
    );

    await call(owner.key, "/machines/a/start", { method: "POST" });
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 2 * HOURLY, 8);
});

test("stops the machine when the next hour is unaffordable", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const smol = stubSmol();
    const owner = await machineKey(0.15);
    await create(owner.key, "a");
    const { id } = smol.machines[0];

    expect(await nextHour(id)).toBe(true);
    expect(smol.machines[0].state).toBe("stopped");
    expect(await questPollen(owner.userId)).toBeCloseTo(0.15 - HOURLY, 8);
    expect(await runDurableObjectAlarm(env.MACHINE_METER.getByName(id))).toBe(
        false,
    );
});
