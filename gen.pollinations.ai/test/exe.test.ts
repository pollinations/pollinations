import {
    createExecutionContext,
    createScheduledController,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";

const EXE = "https://exe.dev/exec";
const HOUR = 0.105;

type Vm = { vm_name: string; tags?: string[] };

const now = () => Math.floor(Date.now() / 1000);

// exe.dev lexes the body like a shell. Gen sends only quoted words.
const words = (body: string) =>
    (body.match(/(?:'[^']*'|\\.)+/g) ?? []).map((word) =>
        word.replace(
            /'([^']*)'|\\(.)/g,
            (_, quoted, escaped) => quoted ?? escaped,
        ),
    );

// A tiny in-memory exe.dev account that also records Tinybird events.
// Everything else goes to the real fetch, which the test environment needs.
function stubExe() {
    const vms: Vm[] = [];
    const calls: string[][] = [];
    const events: Record<string, unknown>[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
        const request = new Request(input, init);
        if (request.url === env.TINYBIRD_INGEST_URL) {
            events.push(JSON.parse(await request.text()));
            return new Response(null, { status: 202 });
        }
        if (request.url !== EXE) return realFetch(input, init);
        // The team token replaces the caller's key.
        expect(request.headers.get("authorization")).toBe(
            "Bearer not-a-secret-workers-test-only",
        );
        const [command, ...args] = words(await request.text());
        calls.push([command, ...args]);
        const find = (name: string) => vms.find((vm) => vm.vm_name === name);
        const missing = (name: string) =>
            new Response(`VM ${name} not found`, { status: 422 });

        if (command === "ls") return Response.json({ vms });
        if (command === "new") {
            const values = (flag: string) =>
                args
                    .filter((arg) => arg.startsWith(`--${flag}=`))
                    .map((arg) => arg.slice(flag.length + 3));
            const vm = { vm_name: values("name")[0], tags: values("tag") };
            vms.push(vm);
            return Response.json(vm);
        }
        if (command === "rm") {
            for (const name of args) {
                const vm = find(name);
                if (!vm) return missing(name);
                vms.splice(vms.indexOf(vm), 1);
            }
            return Response.json({ deleted: args });
        }
        if (command === "tag") {
            const remove = args[0] === "-d";
            const [name, ...tags] = remove ? args.slice(1) : args;
            const vm = find(name);
            if (!vm) return missing(name);
            vm.tags = remove
                ? vm.tags?.filter((tag) => !tags.includes(tag))
                : [...(vm.tags ?? []), ...tags];
            return Response.json({ tags: vm.tags });
        }
        if (command === "ssh") {
            const [name, script] = args;
            if (!find(name)) return missing(name);
            // A stand-in for the VM's shell that knows two commands.
            const [, line, marker] =
                script.match(/^\(eval '(.*)'\); printf '\\n(\w+) %d\\n'/s) ??
                [];
            const [output, exit] =
                line === "echo hi"
                    ? ["hi\n", 0]
                    : line === "false"
                      ? ["", 1]
                      : [];
            return new Response(`${output}\n${marker} ${exit}\n`);
        }
        if (command === "share") {
            if (!find(args[1])) return missing(args[1]);
            return Response.json({ ok: true });
        }
        return new Response("unexpected", { status: 500 });
    });
    return {
        vms,
        calls,
        leases: () => events.filter((e) => e.eventType === "sandbox.lease"),
    };
}

const exec = (key: string, command: string) =>
    SELF.fetch("https://gen.pollinations.ai/exe/exec", {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: command,
    });

const vmKey = (tierBalance = 10, pollenBudget?: number) =>
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

test("new pays the first hours up front and keeps each user's VMs apart", async () => {
    const exe = stubExe();
    const owner = await vmKey();
    const other = await vmKey();

    const created = await exec(owner.key, "new --name=box --hours=2");
    expect(created.status).toBe(200);
    const [vm] = exe.vms;
    expect(vm.vm_name).toMatch(/^p[0-9a-f]{16}-box$/);
    const paid = Number(vm.tags?.[0].slice("paid-".length));
    expect(Math.abs(paid - (now() + 2 * 3600))).toBeLessThan(5);
    expect(exe.calls.at(-1)).toEqual(
        expect.arrayContaining(["--standalone", "--no-email"]),
    );
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 2 * HOUR, 8);
    await vi.waitFor(() => expect(exe.leases()).toHaveLength(1));
    expect(exe.leases()[0]).toMatchObject({
        userId: owner.userId,
        modelProviderUsed: "exe",
        isBilledUsage: true,
    });
    expect(exe.leases()[0].totalPrice).toBeCloseTo(2 * HOUR, 8);

    // Another user neither sees the VM nor reaches it, by short or full name.
    const listed = await exec(other.key, "ls");
    expect(await listed.json()).toEqual({ vms: [] });
    expect((await exec(other.key, "rm box")).status).toBe(422);
    expect((await exec(other.key, `rm ${vm.vm_name}`)).status).toBe(422);
    expect((await exec(other.key, `ssh ${vm.vm_name} echo hi`)).status).toBe(
        422,
    );
    expect(exe.vms).toHaveLength(1);

    const own = await exec(owner.key, "ls");
    expect(await own.json()).toEqual({ vms: [vm] });
    expect((await exec(owner.key, "share port box 8080")).status).toBe(200);
    expect(exe.calls.at(-1)).toEqual(["share", "port", vm.vm_name, "8080"]);
    expect((await exec(owner.key, "rm box")).status).toBe(200);
    expect(exe.vms).toEqual([]);
});

test("ssh returns the command's output with its exit code in a header", async () => {
    stubExe();
    const owner = await vmKey();
    await exec(owner.key, "new --name=box");

    const ok = await exec(owner.key, "ssh box echo hi");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-exe-exit")).toBe("0");
    expect(await ok.text()).toBe("hi\n");

    const failed = await exec(owner.key, "ssh box 'false'");
    expect(failed.headers.get("x-exe-exit")).toBe("1");
    expect(await failed.text()).toBe("");
});

test("extend pays for hours after the paid time ends", async () => {
    const exe = stubExe();
    const owner = await vmKey();
    await exec(owner.key, "new --name=box");
    const [vm] = exe.vms;
    const paid = Number(vm.tags?.[0].slice("paid-".length));

    const extended = await exec(owner.key, "extend box --hours 3");
    expect(extended.status).toBe(200);
    const until = paid + 3 * 3600;
    expect(await extended.json()).toEqual({
        vm_name: vm.vm_name,
        paid_until: new Date(until * 1000).toISOString(),
    });
    // The old tag goes once the new one is set.
    await vi.waitFor(() => expect(vm.tags).toEqual([`paid-${until}`]));
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - 4 * HOUR, 8);
    await vi.waitFor(() => expect(exe.leases()).toHaveLength(2));
});

test("the cron deletes only user VMs whose paid time is over", async () => {
    const exe = stubExe();
    const owned = "p0123456789abcdef-";
    exe.vms.push(
        { vm_name: `${owned}expired`, tags: [`paid-${now() - 60}`] },
        { vm_name: `${owned}untagged`, tags: [] },
        { vm_name: `${owned}paid`, tags: [`paid-${now() + 60}`] },
        // Without a tags field the paid time is unknown.
        { vm_name: `${owned}unknown` },
        // VMs outside the user namespace are not gen's.
        { vm_name: "team-box", tags: [`paid-${now() - 60}`] },
    );

    const ctx = createExecutionContext();
    worker.scheduled(
        createScheduledController({ cron: "*/5 * * * *" }),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(exe.vms.map((vm) => vm.vm_name)).toEqual([
        `${owned}paid`,
        `${owned}unknown`,
        "team-box",
    ]);
});

test("refuses keys without the scope, unpaid VMs and closed commands", async () => {
    const exe = stubExe();

    const plain = await createTestApiKey({ user: { tierBalance: 10 } });
    const denied = await exec(plain.key, "ls");
    expect(denied.status).toBe(403);
    expect(await denied.text()).toContain("account:machines");

    // An empty wallet or a key budget below the first hour creates nothing.
    const broke = await vmKey(0);
    expect((await exec(broke.key, "new")).status).toBe(402);
    const capped = await vmKey(10, 0.001);
    expect((await exec(capped.key, "new")).status).toBe(402);
    expect(exe.vms).toEqual([]);

    // Commands that reach the account, its secrets or its credits stay closed.
    const owner = await vmKey();
    for (const command of [
        "ssh-key generate-api-key",
        "integrations list",
        "share add box someone@example.com",
        "cp box",
    ]) {
        expect((await exec(owner.key, command)).status).toBe(403);
    }
    for (const command of [
        "new --integration=llm",
        "new --prompt=hello",
        "new --cpu=16",
        "new --hours=0",
        "new 'unbalanced",
        "ssh box",
    ]) {
        expect((await exec(owner.key, command)).status).toBe(400);
    }
    expect(exe.calls).toEqual([]);

    // A user may keep three VMs.
    for (let i = 0; i < 3; i++) {
        expect((await exec(owner.key, "new")).status).toBe(200);
    }
    expect((await exec(owner.key, "new")).status).toBe(429);
    expect(exe.vms).toHaveLength(3);
    await vi.waitFor(() => expect(exe.leases()).toHaveLength(3));
});
