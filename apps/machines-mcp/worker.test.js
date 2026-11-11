import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

// Keep E2B's runtime fetcher on globalThis.fetch even when undici is present
// in a parent node_modules on Node >= 22.19.
Object.defineProperty(process.versions, "node", {
    value: "22.0.0",
    configurable: true,
});

const TOKEN = "sk_test_machines_scoped";
const EXPECTED_TOOLS = [
    "connect_sandbox",
    "create_sandbox",
    "kill_sandbox",
    "list_sandboxes",
    "pause_sandbox",
    "read_file",
    "run_command",
    "write_file",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "machines-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://machines-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${token}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

function connectFrame(payload, flags = 0) {
    const json = Buffer.from(JSON.stringify(payload), "utf8");
    const header = Buffer.alloc(5);
    header.writeUInt8(flags, 0);
    header.writeUInt32BE(json.length, 1);
    return Buffer.concat([header, json]);
}

function connectProcessStream({
    stdout = "",
    stderr = "",
    exitCode = 0,
    error,
}) {
    const frames = [connectFrame({ event: { start: { pid: 101 } } })];
    if (stdout) {
        frames.push(
            connectFrame({
                event: {
                    data: {
                        stdout: Buffer.from(stdout, "utf8").toString("base64"),
                    },
                },
            }),
        );
    }
    if (stderr) {
        frames.push(
            connectFrame({
                event: {
                    data: {
                        stderr: Buffer.from(stderr, "utf8").toString("base64"),
                    },
                },
            }),
        );
    }
    frames.push(
        connectFrame({
            event: {
                end: {
                    exitCode,
                    exited: true,
                    status: `exit status ${exitCode}`,
                    ...(error ? { error } : {}),
                },
            },
        }),
        connectFrame({}, 2),
    );
    return new Response(Buffer.concat(frames), {
        status: 200,
        headers: { "content-type": "application/connect+json" },
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://machines-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
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

    const oldEndpoint = await worker.fetch(
        new Request("https://machines-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    const modernTools = (await modern.listTools()).tools;
    assert.deepEqual(
        modernTools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await legacy.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
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

test("creates a sandbox, runs node --version, pauses it, runs another command in it, and kills it", async (t) => {
    const events = [];
    let state = "none";

    t.mock.method(globalThis, "fetch", async (input, init) => {
        const req = new Request(input, init);
        const url = new URL(req.url);

        if (url.origin === "https://gen.pollinations.ai") {
            assert.equal(req.headers.get("x-api-key"), TOKEN);

            if (
                url.pathname === "/alpha/e2b/v2/sandboxes" &&
                req.method === "POST"
            ) {
                const body = await req.json();
                assert.equal(body.templateID, "pollinations");
                state = "running";
                events.push("create");
                return Response.json(
                    {
                        sandboxID: "sbx_lifecycle",
                        envdVersion: "0.5.7",
                        envdAccessToken: "envd_secret",
                        domain: "e2b.app",
                    },
                    { status: 201 },
                );
            }

            if (
                url.pathname ===
                    "/alpha/e2b/v2/sandboxes/sbx_lifecycle/connect" &&
                req.method === "POST"
            ) {
                const wasPaused = state === "paused";
                state = "running";
                events.push(wasPaused ? "resume" : "connect");
                return Response.json(
                    {
                        sandboxID: "sbx_lifecycle",
                        envdVersion: "0.5.7",
                        envdAccessToken: "envd_secret",
                        domain: "e2b.app",
                    },
                    { status: wasPaused ? 201 : 200 },
                );
            }

            if (
                url.pathname === "/alpha/e2b/sandboxes/sbx_lifecycle/pause" &&
                req.method === "POST"
            ) {
                state = "paused";
                events.push("pause");
                return new Response(null, { status: 204 });
            }

            if (
                url.pathname === "/alpha/e2b/sandboxes/sbx_lifecycle" &&
                req.method === "DELETE"
            ) {
                state = "killed";
                events.push("kill");
                return new Response(null, { status: 204 });
            }
        }

        if (
            url.pathname === "/process.Process/Start" &&
            req.method === "POST"
        ) {
            assert.equal(state, "running");
            assert.equal(req.headers.get("e2b-sandbox-id"), "sbx_lifecycle");
            assert.equal(req.headers.get("x-access-token"), "envd_secret");
            const raw = Buffer.from(await req.arrayBuffer());
            const payload = JSON.parse(raw.subarray(5).toString("utf8"));
            const cmd = payload.process.args.at(-1);
            events.push(`exec:${cmd}`);
            if (cmd === "node --version") {
                return connectProcessStream({ stdout: "v24.12.0\n" });
            }
            if (cmd === "uname -s") {
                return connectProcessStream({ stdout: "Linux\n" });
            }
        }

        throw new Error(`Unexpected fetch: ${req.method} ${req.url}`);
    });

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const created = await client.callTool({
        name: "create_sandbox",
        arguments: {},
    });
    assert.notEqual(created.isError, true);
    const { sandboxId } = JSON.parse(created.content[0].text);
    assert.equal(sandboxId, "sbx_lifecycle");

    const firstRun = await client.callTool({
        name: "run_command",
        arguments: { sandboxId, command: "node --version" },
    });
    assert.notEqual(firstRun.isError, true);
    assert.deepEqual(JSON.parse(firstRun.content[0].text), {
        exitCode: 0,
        stdout: "v24.12.0\n",
        stderr: "",
    });

    const paused = await client.callTool({
        name: "pause_sandbox",
        arguments: { sandboxId },
    });
    assert.notEqual(paused.isError, true);
    assert.deepEqual(JSON.parse(paused.content[0].text), {
        sandboxId: "sbx_lifecycle",
        paused: true,
        state: "paused",
    });

    const secondRun = await client.callTool({
        name: "run_command",
        arguments: { sandboxId, command: "uname -s" },
    });
    assert.notEqual(secondRun.isError, true);
    assert.deepEqual(JSON.parse(secondRun.content[0].text), {
        exitCode: 0,
        stdout: "Linux\n",
        stderr: "",
    });

    const killed = await client.callTool({
        name: "kill_sandbox",
        arguments: { sandboxId },
    });
    assert.notEqual(killed.isError, true);
    assert.deepEqual(JSON.parse(killed.content[0].text), {
        sandboxId: "sbx_lifecycle",
        killed: true,
    });

    assert.deepEqual(events, [
        "create",
        "connect",
        "exec:node --version",
        "pause",
        "resume",
        "exec:uname -s",
        "kill",
    ]);
});

test("writes and reads files and lists sandboxes", async (t) => {
    const files = new Map();
    const listTokens = [];

    t.mock.method(globalThis, "fetch", async (input, init) => {
        const req = new Request(input, init);
        const url = new URL(req.url);

        if (
            url.pathname === "/alpha/e2b/v2/sandboxes/sbx_files/connect" &&
            req.method === "POST"
        ) {
            return Response.json({
                sandboxID: "sbx_files",
                envdVersion: "0.5.7",
                envdAccessToken: "envd_tok",
                domain: "e2b.app",
            });
        }

        if (
            url.pathname === "/alpha/e2b/v2/sandboxes" &&
            req.method === "GET"
        ) {
            const token = url.searchParams.get("nextToken");
            listTokens.push(token);
            return Response.json(
                [
                    {
                        sandboxID: token ? "sbx_second_page" : "sbx_files",
                        templateID: "pollinations",
                        alias: "pollinations",
                        state: "running",
                        cpuCount: 2,
                        memoryMB: 2048,
                        startedAt: "2026-10-16T08:00:00.000Z",
                        endAt: "2026-10-16T08:10:00.000Z",
                        envdVersion: "0.5.7",
                        metadata: { name: "workbox" },
                    },
                ],
                { headers: token ? {} : { "x-next-token": "page2" } },
            );
        }

        if (url.pathname === "/files" && req.method === "POST") {
            const path = url.searchParams.get("path");
            const file = (await req.formData()).get("file");
            files.set(path, await file.text());
            return Response.json([
                {
                    path,
                    name: path.split("/").pop(),
                    type: "file",
                },
            ]);
        }

        if (url.pathname === "/files" && req.method === "GET") {
            const path = url.searchParams.get("path");
            return new Response(files.get(path) ?? "", { status: 200 });
        }

        throw new Error(`Unexpected fetch: ${req.method} ${req.url}`);
    });

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const written = await client.callTool({
        name: "write_file",
        arguments: {
            sandboxId: "sbx_files",
            path: "/home/user/hello.txt",
            content: "hello from pollinations sandbox",
        },
    });
    assert.notEqual(written.isError, true);
    assert.equal(
        JSON.parse(written.content[0].text).path,
        "/home/user/hello.txt",
    );

    const read = await client.callTool({
        name: "read_file",
        arguments: {
            sandboxId: "sbx_files",
            path: "/home/user/hello.txt",
        },
    });
    assert.notEqual(read.isError, true);
    assert.equal(read.content[0].text, "hello from pollinations sandbox");

    files.set("/home/user/long.txt", "x".repeat(100_001));
    const longFile = await client.callTool({
        name: "read_file",
        arguments: { sandboxId: "sbx_files", path: "/home/user/long.txt" },
    });
    assert.equal(
        longFile.content[0].text,
        `${"x".repeat(100_000)}\n[cut at 100000 characters]`,
    );

    const listed = await client.callTool({
        name: "list_sandboxes",
        arguments: {},
    });
    assert.notEqual(listed.isError, true);
    const sandboxes = JSON.parse(listed.content[0].text);
    assert.equal(sandboxes.length, 2);
    assert.equal(sandboxes[0].sandboxId, "sbx_files");
    assert.equal(sandboxes[1].sandboxId, "sbx_second_page");
    assert.deepEqual(listTokens, [null, "page2"]);
    assert.equal(sandboxes[0].metadata.name, "workbox");
});

test("returns a key without machines permission error message as a tool error", async (t) => {
    const apiMessage =
        "API key does not have 'account:machines' permission. Allow it at https://enter.pollinations.ai/grant?id=key_123&permission=machines&ref=agent_grant";

    t.mock.method(globalThis, "fetch", async (input, init) => {
        const req = new Request(input, init);
        assert.equal(
            req.url,
            "https://gen.pollinations.ai/alpha/e2b/v2/sandboxes",
        );
        assert.equal(req.headers.get("x-api-key"), "sk_no_machines");
        return Response.json(
            {
                code: 403,
                message: apiMessage,
            },
            { status: 403 },
        );
    });

    const client = await connectClient(
        { versionNegotiation: { mode: "auto" } },
        "sk_no_machines",
    );
    t.after(() => client.close());

    const result = await client.callTool({
        name: "create_sandbox",
        arguments: {},
    });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes(apiMessage));
});

test("keeps bearer tokens scoped to concurrent requests", async (t) => {
    const seenKeys = new Set();

    t.mock.method(globalThis, "fetch", async (input, init) => {
        const req = new Request(input, init);
        const key = req.headers.get("x-api-key");
        seenKeys.add(key);
        return Response.json(
            {
                sandboxID: `sbx_${key}`,
                envdVersion: "0.5.7",
                envdAccessToken: "envd_tok",
                domain: "e2b.app",
            },
            { status: 201 },
        );
    });

    const options = { versionNegotiation: { mode: "auto" } };
    const firstClient = await connectClient(options, "sk_first");
    const secondClient = await connectClient(options, "sk_second");
    t.after(() => Promise.all([firstClient.close(), secondClient.close()]));

    const [first, second] = await Promise.all([
        firstClient.callTool({ name: "create_sandbox", arguments: {} }),
        firstClient
            .callTool({ name: "create_sandbox", arguments: {} })
            .then(() =>
                secondClient.callTool({
                    name: "create_sandbox",
                    arguments: {},
                }),
            ),
    ]);

    assert.equal(JSON.parse(first.content[0].text).sandboxId, "sbx_sk_first");
    assert.equal(JSON.parse(second.content[0].text).sandboxId, "sbx_sk_second");
    assert.deepEqual(seenKeys, new Set(["sk_first", "sk_second"]));
});

test("connects to an existing sandbox and formats non-zero command exits as tool errors", async (t) => {
    let connectBody;
    let commandOutput = {
        stdout: "partial output\n",
        stderr: "command failed\n",
        exitCode: 2,
        error: "exit status 2",
    };

    t.mock.method(globalThis, "fetch", async (input, init) => {
        const req = new Request(input, init);
        const url = new URL(req.url);

        if (
            url.pathname === "/alpha/e2b/v2/sandboxes/sbx_resume/connect" &&
            req.method === "POST"
        ) {
            connectBody = await req.json();
            return Response.json({
                sandboxID: "sbx_resume",
                envdVersion: "0.5.7",
                envdAccessToken: "envd_tok",
                domain: "e2b.app",
            });
        }

        if (
            url.pathname === "/process.Process/Start" &&
            req.method === "POST"
        ) {
            return connectProcessStream(commandOutput);
        }

        throw new Error(`Unexpected fetch: ${req.method} ${req.url}`);
    });

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const connected = await client.callTool({
        name: "connect_sandbox",
        arguments: { sandboxId: "sbx_resume", timeout: 0 },
    });
    assert.notEqual(connected.isError, true);
    assert.deepEqual(JSON.parse(connected.content[0].text), {
        sandboxId: "sbx_resume",
        connected: true,
        state: "running",
    });
    assert.equal(connectBody.timeout, 2 ** 31 - 1);

    const failedRun = await client.callTool({
        name: "run_command",
        arguments: { sandboxId: "sbx_resume", command: "exit 2" },
    });
    assert.equal(failedRun.isError, true);
    assert.deepEqual(JSON.parse(failedRun.content[0].text), {
        exitCode: 2,
        stdout: "partial output\n",
        stderr: "command failed\n",
        error: "exit status 2",
    });

    for (const exitCode of [0, 2]) {
        commandOutput = {
            stdout: "x".repeat(100_001),
            stderr: "y".repeat(100_000),
            exitCode,
        };
        const result = await client.callTool({
            name: "run_command",
            arguments: { sandboxId: "sbx_resume", command: "large output" },
        });
        assert.equal(result.isError === true, exitCode !== 0);
        const output = JSON.parse(result.content[0].text);
        assert.equal(output.exitCode, exitCode);
        assert.equal(
            output.stdout,
            `${"x".repeat(100_000)}\n[cut at 100000 characters]`,
        );
        assert.equal(output.stderr, commandOutput.stderr);
    }
});
