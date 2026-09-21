import { SELF } from "cloudflare:test";
import { COMMUNITY_MODEL_ALLOWED_GITHUB_IDS } from "@shared/auth/github-id-list.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { afterEach, expect, vi } from "vitest";

const SMOL = "https://api.smolmachines.com";
const allowedUser = { githubId: COMMUNITY_MODEL_ALLOWED_GITHUB_IDS[0] };

type Machine = Record<string, unknown> & { id: string; name: string };

// A tiny in-memory smol cloud. Everything that is not smol goes to the
// real fetch, which the test environment needs for its own plumbing.
function stubSmol(machines: Machine[] = []) {
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
        const request = new Request(input, init);
        if (!request.url.startsWith(SMOL)) return realFetch(input, init);
        expect(request.headers.get("authorization")).toBe(
            "Bearer not-a-secret-workers-test-only",
        );
        const path = request.url.slice(SMOL.length);
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
        if (rest === "/start") {
            return Response.json({ ...machine, state: "started" });
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
    return { machines };
}

const call = (key: string, path: string, init?: RequestInit) =>
    SELF.fetch(`https://gen.pollinations.ai${path}`, {
        ...init,
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
    });

afterEach(() => vi.unstubAllGlobals());

test("creates, lists, execs and deletes a machine for its owner only", async () => {
    const smol = stubSmol();
    const owner = await createTestApiKey({ user: allowedUser });
    const other = await createTestApiKey({
        user: { githubId: COMMUNITY_MODEL_ALLOWED_GITHUB_IDS[1] },
    });

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

    const deleted = await call(owner.key, "/machines/my-agent", {
        method: "DELETE",
    });
    expect(await deleted.json()).toEqual({ deleted: true });
    expect(smol.machines).toHaveLength(0);
});

test("rejects accounts outside the preview, publishable keys and the fourth machine", async () => {
    stubSmol();
    const outsider = await createTestApiKey({ user: { githubId: 1 } });
    expect((await call(outsider.key, "/machines")).status).toBe(403);

    const owner = await createTestApiKey({ user: allowedUser });
    const publishable = await createTestApiKey({
        userId: owner.userId,
        type: "publishable",
    });
    expect((await call(publishable.key, "/machines")).status).toBe(403);

    const create = (name: string) =>
        call(owner.key, "/machines", {
            method: "POST",
            body: JSON.stringify({ name, image: "alpine" }),
        });
    for (const name of ["a", "b", "c"]) {
        expect((await create(name)).status).toBe(200);
    }
    expect((await create("d")).status).toBe(403);
    expect((await create("Bad_Name")).status).toBe(400);
});
