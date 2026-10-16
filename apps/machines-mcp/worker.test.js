import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { CommandExitError } from "e2b";
import { createWorker } from "./worker.js";

const TOKEN = "sk_test_machines";
const API_URL = "https://gen.pollinations.ai/alpha/e2b";
const EXPECTED_TOOLS = [
    "create_sandbox",
    "kill_sandbox",
    "list_sandboxes",
    "pause_sandbox",
    "read_file",
    "run_command",
    "write_file",
];

function createHarness({ onCreate } = {}) {
    const calls = [];
    const files = new Map();

    function instance(sandboxId) {
        return {
            sandboxId,
            commands: {
                async run(command, opts) {
                    calls.push({ op: "run", sandboxId, command, opts });
                    if (command === "exit 1") {
                        throw new CommandExitError({
                            exitCode: 1,
                            stdout: "before",
                            stderr: "boom",
                        });
                    }
                    return {
                        exitCode: 0,
                        stdout: `ran: ${command}\n`,
                        stderr: "",
                    };
                },
            },
            files: {
                async read(path) {
                    calls.push({ op: "read", sandboxId, path });
                    if (!files.has(path)) {
                        throw new Error(`File ${path} not found`);
                    }
                    return files.get(path);
                },
                async write(path, content) {
                    calls.push({ op: "write", sandboxId, path, content });
                    files.set(path, content);
                    return { path };
                },
            },
        };
    }

    const Sandbox = {
        async create(template, opts) {
            calls.push({ op: "create", template, opts });
            if (onCreate) return onCreate(template, opts);
            return { sandboxId: "sbx_new" };
        },
        async connect(sandboxId, opts) {
            calls.push({ op: "connect", sandboxId, opts });
            return instance(sandboxId);
        },
        list(opts) {
            calls.push({ op: "list", opts });
            return {
                nextItems: async () => [
                    {
                        sandboxId: "sbx_1",
                        templateId: "pollinations",
                        state: "running",
                        startedAt: new Date("2026-01-01T00:00:00Z"),
                        endAt: new Date("2026-01-01T00:05:00Z"),
                        cpuCount: 2,
                        memoryMB: 2048,
                    },
                ],
            };
        },
        async pause(sandboxId, opts) {
            calls.push({ op: "pause", sandboxId, opts });
            return true;
        },
        async kill(sandboxId, opts) {
            calls.push({ op: "kill", sandboxId, opts });
            return true;
        },
    };

    return { calls, worker: createWorker({ Sandbox }) };
}

async function connectClient(worker, env = {}, token = TOKEN) {
    const client = new Client(
        { name: "machines-mcp-test", version: "0.0.1" },
        { capabilities: {}, versionNegotiation: { mode: "auto" } },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://machines-mcp.internal"),
        {
            fetch: (input, init) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                return worker.fetch(request, env);
            },
            requestInit: {
                headers: { Authorization: `Bearer ${token}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const { worker } = createHarness();

    const health = await worker.fetch(
        new Request("https://machines-mcp.internal/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://machines-mcp.internal", {
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

    const notFound = await worker.fetch(
        new Request("https://machines-mcp.internal/mcp", {
            headers: { Authorization: `Bearer ${TOKEN}` },
        }),
    );
    assert.equal(notFound.status, 404);
});

test("rejects JSON-RPC batches", async () => {
    const { worker } = createHarness();
    const response = await worker.fetch(
        new Request("https://machines-mcp.internal", {
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

test("lists the machine tools", async () => {
    const { worker } = createHarness();
    const client = await connectClient(worker);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(({ name }) => name).sort(), EXPECTED_TOOLS);
    await client.close();
});

test("lists the caller's sandboxes", async () => {
    const { calls, worker } = createHarness();
    const client = await connectClient(worker);
    const result = await client.callTool({
        name: "list_sandboxes",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), [
        {
            sandboxId: "sbx_1",
            templateId: "pollinations",
            state: "running",
            startedAt: "2026-01-01T00:00:00.000Z",
            endAt: "2026-01-01T00:05:00.000Z",
            cpuCount: 2,
            memoryMB: 2048,
        },
    ]);
    assert.equal(calls[0].op, "list");
    assert.equal(calls[0].opts.apiKey, TOKEN);
    assert.equal(calls[0].opts.apiUrl, API_URL);
    await client.close();
});

test("creates a sandbox with the requested template and lease", async () => {
    const { calls, worker } = createHarness();
    const client = await connectClient(worker);

    const created = await client.callTool({
        name: "create_sandbox",
        arguments: {},
    });
    assert.deepEqual(JSON.parse(created.content[0].text), {
        sandboxId: "sbx_new",
    });
    assert.equal(calls[0].op, "create");
    assert.equal(calls[0].template, "pollinations");
    assert.equal(calls[0].opts.apiKey, TOKEN);
    assert.equal(calls[0].opts.apiUrl, API_URL);
    assert.equal(calls[0].opts.timeoutMs, undefined);

    await client.callTool({
        name: "create_sandbox",
        arguments: { template: "pollinations-large", timeoutMs: 600_000 },
    });
    assert.equal(calls[1].template, "pollinations-large");
    assert.equal(calls[1].opts.timeoutMs, 600_000);
    await client.close();
});

test("runs a command and returns its exit code and output", async () => {
    const { calls, worker } = createHarness();
    const client = await connectClient(worker);
    const result = await client.callTool({
        name: "run_command",
        arguments: { sandboxId: "sbx_1", command: "node --version" },
    });
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, /exit code: 0/);
    assert.match(result.content[0].text, /ran: node --version/);
    assert.deepEqual(
        calls.map(({ op }) => op),
        ["connect", "run"],
    );
    assert.equal(calls[0].sandboxId, "sbx_1");
    assert.deepEqual(calls[1].opts, {});
    await client.close();
});

test("returns a non-zero command's output instead of a tool error", async () => {
    const { worker } = createHarness();
    const client = await connectClient(worker);
    const result = await client.callTool({
        name: "run_command",
        arguments: { sandboxId: "sbx_1", command: "exit 1" },
    });
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, /exit code: 1/);
    assert.match(result.content[0].text, /boom/);
    await client.close();
});

test("writes and reads files", async () => {
    const { calls, worker } = createHarness();
    const client = await connectClient(worker);
    await client.callTool({
        name: "write_file",
        arguments: { sandboxId: "sbx_1", path: "/tmp/a.txt", content: "hello" },
    });
    const read = await client.callTool({
        name: "read_file",
        arguments: { sandboxId: "sbx_1", path: "/tmp/a.txt" },
    });
    assert.equal(read.content[0].text, "hello");
    assert.deepEqual(
        calls.map(({ op }) => op),
        ["connect", "write", "connect", "read"],
    );
    await client.close();
});

test("pauses and kills a sandbox", async () => {
    const { calls, worker } = createHarness();
    const client = await connectClient(worker);
    const paused = await client.callTool({
        name: "pause_sandbox",
        arguments: { sandboxId: "sbx_1" },
    });
    const killed = await client.callTool({
        name: "kill_sandbox",
        arguments: { sandboxId: "sbx_1" },
    });
    assert.match(paused.content[0].text, /Paused sandbox sbx_1/);
    assert.match(killed.content[0].text, /Killed sandbox sbx_1/);
    assert.deepEqual(
        calls.map(({ op }) => op),
        ["pause", "kill"],
    );
    assert.equal(calls[0].opts.apiUrl, API_URL);
    assert.equal(calls[1].opts.apiKey, TOKEN);
    await client.close();
});

test("surfaces the sandbox API's permission error as a tool error", async () => {
    const { worker } = createHarness({
        onCreate: async () => {
            throw new Error(
                "403: API key does not have 'account:machines' permission.",
            );
        },
    });
    const client = await connectClient(worker);
    const result = await client.callTool({
        name: "create_sandbox",
        arguments: {},
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /account:machines/);
    await client.close();
});

test("calls the staging sandbox API when POLLINATIONS_BASE_URL is set", async () => {
    const { calls, worker } = createHarness();
    const client = await connectClient(worker, {
        POLLINATIONS_BASE_URL: "https://staging.gen.pollinations.ai/",
    });
    await client.callTool({ name: "list_sandboxes", arguments: {} });
    assert.equal(
        calls[0].opts.apiUrl,
        "https://staging.gen.pollinations.ai/alpha/e2b",
    );
    await client.close();
});
