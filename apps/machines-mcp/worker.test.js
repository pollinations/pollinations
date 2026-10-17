import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { after } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const TOKEN = "sk_test_request_scoped";
const NO_MACHINES_KEY = "sk_no_machines";
const EXPECTED_TOOLS = [
    "sandbox_create",
    "sandbox_kill",
    "sandbox_list",
    "sandbox_pause",
    "sandbox_read_file",
    "sandbox_run",
    "sandbox_write_file",
];

// A local stand-in for gen's /alpha/e2b route. The e2b SDK builds its own
// undici dispatcher on Node, so requests arrive here over real HTTP instead
// of through a global fetch mock.
const requests = [];
const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
        const { pathname } = new URL(req.url, "http://127.0.0.1");
        const apiKey = req.headers["x-api-key"];
        requests.push({
            method: req.method,
            path: pathname,
            apiKey,
            body: Buffer.concat(chunks).toString(),
        });
        const json = (status, body) => {
            res.writeHead(status, { "content-type": "application/json" });
            res.end(JSON.stringify(body));
        };
        if (apiKey === NO_MACHINES_KEY) {
            return json(403, {
                code: 403,
                message: "API key does not have 'account:machines' permission.",
            });
        }
        if (pathname === "/alpha/e2b/v2/sandboxes") {
            if (req.method === "POST") {
                return json(201, {
                    sandboxID: "sbx_test",
                    domain: "test.invalid",
                    envdVersion: "0.5.2",
                    envdAccessToken: "envd_token",
                });
            }
            return json(200, [
                {
                    sandboxID: "sbx_test",
                    templateId: "pollinations",
                    metadata: {},
                    startedAt: "2026-10-17T00:00:00.000Z",
                    endAt: "2026-10-17T01:00:00.000Z",
                    state: "running",
                },
            ]);
        }
        if (pathname === "/alpha/e2b/sandboxes/sbx_test/pause") {
            return json(200, {});
        }
        if (pathname === "/alpha/e2b/sandboxes/sbx_paused/pause") {
            return json(409, { code: 409, message: "already paused" });
        }
        if (
            pathname === "/alpha/e2b/sandboxes/sbx_test" &&
            req.method === "DELETE"
        ) {
            return json(200, {});
        }
        if (pathname === "/alpha/e2b/sandboxes/sbx_missing/connect") {
            return json(404, {
                code: 404,
                message: "Sandbox sbx_missing not found",
            });
        }
        return json(404, { code: 404, message: `No stub for ${pathname}` });
    });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
process.env.POLLINATIONS_BASE_URL = `http://127.0.0.1:${port}`;
after(() => new Promise((resolve) => server.close(resolve)));

const worker = (await import("./worker.js")).default;

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

async function callTool(client, name, args) {
    return client.callTool({ name, arguments: args });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://machines-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
        name: "machines-mcp",
        transport: "streamable-http",
        endpoint: "/",
        stateless: true,
    });

    const missing = await worker.fetch(
        new Request("https://machines-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
        }),
    );
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get("WWW-Authenticate") ?? "", /^Bearer /);
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

test("lists the seven sandbox tools", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const tools = await client.listTools();
    assert.deepEqual(
        tools.tools.map((tool) => tool.name).sort(),
        EXPECTED_TOOLS,
    );
});

test("rejects invalid tool arguments before calling the sandbox API", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const before = requests.length;
    const invalid = [
        ["sandbox_run", { command: "ls" }],
        ["sandbox_run", { sandboxId: 7, command: "ls" }],
        ["sandbox_read_file", { sandboxId: "sbx_test", path: 42 }],
        ["sandbox_write_file", { sandboxId: "sbx_test", path: "/a" }],
        ["sandbox_kill", {}],
        ["sandbox_create", { template: "pollinations", timeoutMs: "10" }],
    ];
    for (const [name, args] of invalid) {
        const result = await callTool(client, name, args);
        assert.equal(result.isError, true, `${name} ${JSON.stringify(args)}`);
    }
    assert.equal(requests.length, before);
});

test("creates a sandbox through the caller's key", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const created = await callTool(client, "sandbox_create", {});
    assert.notEqual(created.isError, true);
    const info = JSON.parse(created.content[0].text);
    assert.equal(info.sandboxId, "sbx_test");
    assert.equal(info.template, "pollinations");

    const record = requests.find(
        (r) => r.path === "/alpha/e2b/v2/sandboxes" && r.method === "POST",
    );
    assert.equal(record?.apiKey, TOKEN);
    assert.equal(JSON.parse(record.body).templateID, "pollinations");

    const large = await callTool(client, "sandbox_create", {
        template: "pollinations-large",
        timeoutMs: 3_600_000,
    });
    assert.notEqual(large.isError, true);
    const largeRecord = requests
        .filter(
            (r) => r.method === "POST" && r.path === "/alpha/e2b/v2/sandboxes",
        )
        .at(-1);
    assert.deepEqual(
        {
            templateID: JSON.parse(largeRecord.body).templateID,
            timeout: JSON.parse(largeRecord.body).timeout,
        },
        { templateID: "pollinations-large", timeout: 3600 },
    );
});

test("lists, pauses, and kills sandboxes", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());

    const list = await callTool(client, "sandbox_list", {});
    assert.notEqual(list.isError, true);
    assert.match(list.content[0].text, /sbx_test/);
    assert.equal(
        requests.find(
            (r) => r.method === "GET" && r.path === "/alpha/e2b/v2/sandboxes",
        )?.apiKey,
        TOKEN,
    );

    const pause = await callTool(client, "sandbox_pause", {
        sandboxId: "sbx_test",
    });
    assert.deepEqual(JSON.parse(pause.content[0].text), {
        sandboxId: "sbx_test",
        paused: true,
    });
    const already = await callTool(client, "sandbox_pause", {
        sandboxId: "sbx_paused",
    });
    assert.deepEqual(JSON.parse(already.content[0].text), {
        sandboxId: "sbx_paused",
        paused: false,
    });

    const kill = await callTool(client, "sandbox_kill", {
        sandboxId: "sbx_test",
    });
    assert.deepEqual(JSON.parse(kill.content[0].text), {
        sandboxId: "sbx_test",
        killed: true,
    });
    assert.ok(
        requests.some(
            (r) =>
                r.path === "/alpha/e2b/sandboxes/sbx_test" &&
                r.method === "DELETE" &&
                r.apiKey === TOKEN,
        ),
    );
});

test("returns the API's message as a tool error for a key without machines", async (t) => {
    const client = await connectClient({}, NO_MACHINES_KEY);
    t.after(() => client.close());
    const result = await callTool(client, "sandbox_list", {});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /account:machines' permission/);
});

test("surfaces a missing sandbox as a tool error", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await callTool(client, "sandbox_run", {
        sandboxId: "sbx_missing",
        command: "node --version",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /sbx_missing not found/);
});

test("keeps bearer tokens scoped to concurrent requests", async (t) => {
    const options = { versionNegotiation: { mode: "auto" } };
    const first = await connectClient(options, "pk_first");
    const second = await connectClient(options, "sk_second");
    t.after(() => Promise.all([first.close(), second.close()]));
    const before = requests.length;
    const [a, b] = await Promise.all([
        callTool(first, "sandbox_list", {}),
        callTool(second, "sandbox_list", {}),
    ]);
    assert.notEqual(a.isError, true);
    assert.notEqual(b.isError, true);
    assert.deepEqual(
        new Set(requests.slice(before).map((r) => r.apiKey)),
        new Set(["pk_first", "sk_second"]),
    );
});
