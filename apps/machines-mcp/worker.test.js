import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { CommandExitError } from "e2b";
import defaultWorker, { makeWorker } from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "sandbox_create",
    "sandbox_kill",
    "sandbox_list",
    "sandbox_pause",
    "sandbox_read_file",
    "sandbox_run",
    "sandbox_write_file",
];
const API_URL = "https://gen.pollinations.ai/alpha/e2b";

/** A stand-in for E2B's Sandbox that records every call and the options it got. */
function fakeSdk(overrides = {}) {
    const calls = [];
    const record = (name, ...args) => calls.push({ name, args });
    const machine = {
        commands: {
            run: async (command, options) => {
                record("run", command, options);
                return { exitCode: 0, stdout: "v24.0.0\n", stderr: "" };
            },
        },
        files: {
            read: async (path) => {
                record("read", path);
                return "hello";
            },
            write: async (path, content) => {
                record("write", path, content);
            },
        },
    };
    const sdk = {
        list: (options) => ({
            nextItems: async () => {
                record("list", options);
                return [
                    {
                        sandboxId: "sbx123",
                        name: "pollinations",
                        templateId: "tpl",
                        metadata: { name: "brave-otter" },
                        state: "running",
                        cpuCount: 2,
                        memoryMB: 2048,
                        endAt: "2026-10-16T18:00:00.000Z",
                    },
                ];
            },
        }),
        create: async (template, options) => {
            record("create", template, options);
            return { sandboxId: "sbx123" };
        },
        connect: async (id, options) => {
            record("connect", id, options);
            return machine;
        },
        pause: async (id, options) => {
            record("pause", id, options);
            return true;
        },
        kill: async (id, options) => {
            record("kill", id, options);
            return true;
        },
        ...overrides,
    };
    return { sdk, calls, machine };
}

async function connectClient(worker, token = TOKEN) {
    const client = new Client(
        { name: "machines-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, versionNegotiation: { mode: "auto" } },
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://machines-mcp.pollinations.ai"),
            {
                fetch: (input, init) =>
                    worker.fetch(
                        input instanceof Request
                            ? input
                            : new Request(input, init),
                    ),
                requestInit: { headers: { Authorization: `Bearer ${token}` } },
            },
        ),
    );
    return client;
}

const textOf = (result) => result.content[0].text;
const jsonOf = (result) => JSON.parse(textOf(result));

test("serves health and requires bearer auth", async () => {
    const health = await defaultWorker.fetch(
        new Request("https://machines-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await defaultWorker.fetch(
        new Request("https://machines-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="machines-mcp.pollinations.ai"',
    );

    const oldEndpoint = await defaultWorker.fetch(
        new Request("https://machines-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("rejects JSON-RPC batches", async () => {
    const response = await defaultWorker.fetch(
        new Request("https://machines-mcp.pollinations.ai", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(response.status, 400);
});

test("lists its tools on the current and the 2025 transport", async () => {
    const { sdk } = fakeSdk();
    const client = await connectClient(makeWorker(sdk));
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await client.close();
});

test("lists sandboxes with the caller's key against gen's E2B route", async () => {
    const { sdk, calls } = fakeSdk();
    const client = await connectClient(makeWorker(sdk));
    const result = await client.callTool({
        name: "sandbox_list",
        arguments: {},
    });
    await client.close();

    assert.deepEqual(jsonOf(result), [
        {
            sandboxId: "sbx123",
            name: "brave-otter",
            template: "pollinations",
            state: "running",
            cpuCount: 2,
            memoryMB: 2048,
            endAt: "2026-10-16T18:00:00.000Z",
        },
    ]);
    assert.deepEqual(calls[0].args[0], { apiKey: TOKEN, apiUrl: API_URL });
});

test("creates a pollinations sandbox by default, with a name and a lease", async () => {
    const { sdk, calls } = fakeSdk();
    const client = await connectClient(makeWorker(sdk));
    const result = await client.callTool({
        name: "sandbox_create",
        arguments: { name: "scratch", timeoutSeconds: 900 },
    });
    await client.close();

    assert.deepEqual(jsonOf(result), {
        sandboxId: "sbx123",
        template: "pollinations",
        timeoutSeconds: 900,
    });
    assert.deepEqual(calls[0], {
        name: "create",
        args: [
            "pollinations",
            {
                apiKey: TOKEN,
                apiUrl: API_URL,
                timeoutMs: 900_000,
                metadata: { name: "scratch" },
            },
        ],
    });
});

test("runs a command after connecting, which resumes a paused sandbox", async () => {
    const { sdk, calls } = fakeSdk();
    const client = await connectClient(makeWorker(sdk));
    const result = await client.callTool({
        name: "sandbox_run",
        arguments: {
            sandboxId: "sbx123",
            command: "node --version",
            cwd: "/tmp",
            timeoutSeconds: 30,
        },
    });
    await client.close();

    assert.equal(result.isError, undefined);
    assert.deepEqual(jsonOf(result), {
        exitCode: 0,
        stdout: "v24.0.0\n",
        stderr: "",
    });
    assert.deepEqual(
        calls.map(({ name }) => name),
        ["connect", "run"],
    );
    assert.deepEqual(calls[0].args, [
        "sbx123",
        { apiKey: TOKEN, apiUrl: API_URL },
    ]);
    assert.deepEqual(calls[1].args, [
        "node --version",
        { cwd: "/tmp", timeoutMs: 30_000 },
    ]);
});

test("returns a failing command's output as a tool error, and cuts huge output", async () => {
    const { sdk, machine } = fakeSdk();
    const client = await connectClient(makeWorker(sdk));

    machine.commands.run = async () => {
        throw new CommandExitError({
            exitCode: 2,
            stdout: "partial",
            stderr: "boom",
            error: "exit status 2",
        });
    };
    const failed = await client.callTool({
        name: "sandbox_run",
        arguments: { sandboxId: "sbx123", command: "false" },
    });
    assert.equal(failed.isError, true);
    assert.deepEqual(jsonOf(failed), {
        exitCode: 2,
        stdout: "partial",
        stderr: "boom",
    });

    machine.commands.run = async () => ({
        exitCode: 0,
        stdout: "x".repeat(150_000),
        stderr: "",
    });
    const big = await client.callTool({
        name: "sandbox_run",
        arguments: { sandboxId: "sbx123", command: "yes" },
    });
    await client.close();
    assert.match(jsonOf(big).stdout, /\[cut at 100000 characters\]$/);
    assert.equal(
        jsonOf(big).stdout.length,
        100_000 + "\n[cut at 100000 characters]".length,
    );
});

test("reads and writes files after connecting", async () => {
    const { sdk, calls } = fakeSdk();
    const client = await connectClient(makeWorker(sdk));
    const written = await client.callTool({
        name: "sandbox_write_file",
        arguments: {
            sandboxId: "sbx123",
            path: "/work/a.txt",
            content: "héllo",
        },
    });
    const read = await client.callTool({
        name: "sandbox_read_file",
        arguments: { sandboxId: "sbx123", path: "/work/a.txt" },
    });
    await client.close();

    assert.deepEqual(jsonOf(written), { path: "/work/a.txt", bytes: 6 });
    assert.deepEqual(jsonOf(read), { path: "/work/a.txt", content: "hello" });
    assert.deepEqual(
        calls.map(({ name }) => name),
        ["connect", "write", "connect", "read"],
    );
    assert.deepEqual(calls[1].args, ["/work/a.txt", "héllo"]);
});

test("pauses and kills, and reports a sandbox that is not there", async () => {
    const { sdk, calls } = fakeSdk({ kill: async (id) => id === "sbx123" });
    const client = await connectClient(makeWorker(sdk));
    const paused = await client.callTool({
        name: "sandbox_pause",
        arguments: { sandboxId: "sbx123" },
    });
    const killed = await client.callTool({
        name: "sandbox_kill",
        arguments: { sandboxId: "sbx123" },
    });
    const missing = await client.callTool({
        name: "sandbox_kill",
        arguments: { sandboxId: "gone" },
    });
    await client.close();

    assert.deepEqual(jsonOf(paused), { sandboxId: "sbx123", state: "paused" });
    assert.deepEqual(jsonOf(killed), { sandboxId: "sbx123", killed: true });
    assert.equal(missing.isError, true);
    assert.equal(jsonOf(missing), "No sandbox gone.");
    assert.deepEqual(calls[0].args, [
        "sbx123",
        { apiKey: TOKEN, apiUrl: API_URL },
    ]);
});

test("returns the API's refusal as a tool error", async () => {
    const message = "This key does not have the machines permission.";
    const { sdk } = fakeSdk({
        list: () => ({
            nextItems: async () => {
                throw new Error(message);
            },
        }),
    });
    const client = await connectClient(makeWorker(sdk), "sk_without_machines");
    const result = await client.callTool({
        name: "sandbox_list",
        arguments: {},
    });
    await client.close();

    assert.equal(result.isError, true);
    assert.match(textOf(result), /machines permission/);
});

test("rejects ids, templates and paths that could change the request before calling the SDK", async () => {
    const { sdk, calls } = fakeSdk();
    const client = await connectClient(makeWorker(sdk));
    const attempts = [
        ["sandbox_run", { sandboxId: "../x", command: "id" }],
        ["sandbox_run", { sandboxId: "a b", command: "id" }],
        ["sandbox_pause", { sandboxId: "x/y" }],
        ["sandbox_kill", { sandboxId: "" }],
        ["sandbox_create", { template: "a b" }],
        ["sandbox_create", { template: "../../x?y" }],
        ["sandbox_create", { timeoutSeconds: 5 }],
        ["sandbox_read_file", { sandboxId: "ok", path: "" }],
    ];
    for (const [name, args] of attempts) {
        const result = await client
            .callTool({ name, arguments: args })
            .catch((error) => ({ isError: true, error }));
        assert.equal(result.isError, true, `${name} ${JSON.stringify(args)}`);
    }
    await client.close();
    assert.equal(calls.length, 0);
});

test("keeps each request's key to itself when calls overlap", async () => {
    const { sdk, calls } = fakeSdk();
    const worker = makeWorker(sdk);
    const [a, b] = await Promise.all([
        connectClient(worker, "sk_alice"),
        connectClient(worker, "sk_bob"),
    ]);
    await Promise.all([
        a.callTool({ name: "sandbox_list", arguments: {} }),
        b.callTool({ name: "sandbox_list", arguments: {} }),
    ]);
    await Promise.all([a.close(), b.close()]);

    assert.deepEqual(calls.map(({ args }) => args[0].apiKey).sort(), [
        "sk_alice",
        "sk_bob",
    ]);
});
