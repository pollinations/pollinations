import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
    MCP_CALLER_ID_HEADER,
    MCP_USAGE_HEADERS,
} from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

function createHarness(options = {}) {
    const calls = {
        getSandbox: [],
        destroy: 0,
        ping: 0,
        exec: [],
        mkdir: [],
        writeFile: [],
        readFile: [],
        listFiles: [],
        deleteFile: [],
        responses: [],
    };
    const sandbox = {
        async destroy() {
            calls.destroy += 1;
        },
        async ping() {
            calls.ping += 1;
        },
        async exec(command, execOptions) {
            calls.exec.push({ command, options: execOptions });
            return (
                options.execResult ?? {
                    success: true,
                    stdout: "hello\n",
                    stderr: "",
                    exitCode: 0,
                }
            );
        },
        async writeFile(path, content) {
            calls.writeFile.push({ path, content });
        },
        async mkdir(path, mkdirOptions) {
            calls.mkdir.push({ path, options: mkdirOptions });
        },
        async readFile(path, readOptions) {
            calls.readFile.push({ path, options: readOptions });
            return { content: options.fileContent ?? "file contents" };
        },
        async listFiles(path) {
            calls.listFiles.push(path);
            return [{ name: "hello.txt", type: "file" }];
        },
        async deleteFile(path) {
            calls.deleteFile.push(path);
        },
    };
    return {
        calls,
        env: { SANDBOX: {} },
        worker: createWorker({
            getSandboxImpl(binding, callerId, sandboxOptions) {
                calls.getSandbox.push({ binding, callerId, sandboxOptions });
                return sandbox;
            },
        }),
    };
}

async function connect(worker, env, calls, callerId = "caller-123") {
    const client = new Client(
        { name: "sandbox-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://sandbox.internal"),
        {
            fetch: async (input, init) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                const headers = new Headers(request.headers);
                headers.set(MCP_CALLER_ID_HEADER, callerId);
                const response = await worker.fetch(
                    new Request(request, { headers }),
                    env,
                );
                calls.responses.push(response.clone());
                return response;
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("lists the sandbox lifecycle, shell, and file tools", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        [
            "container_initialize",
            "container_ping",
            "container_exec",
            "container_file_write",
            "container_file_read",
            "container_files_list",
            "container_file_delete",
        ],
    );
    assert.ok(
        calls.getSandbox.every(({ callerId }) => callerId === "caller-123"),
    );
    await client.close();
});

test("keeps one caller sandbox across lifecycle, shell, and file calls", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);

    await client.callTool({ name: "container_initialize", arguments: {} });
    const execution = await client.callTool({
        name: "container_exec",
        arguments: { command: "node --version", timeoutMs: 5_000 },
    });
    await client.callTool({
        name: "container_file_write",
        arguments: { path: "src/index.js", content: "console.log(1)" },
    });
    const read = await client.callTool({
        name: "container_file_read",
        arguments: { path: "/workspace/src/index.js" },
    });
    await client.callTool({
        name: "container_files_list",
        arguments: { path: "src" },
    });
    await client.callTool({
        name: "container_file_delete",
        arguments: { path: "src/index.js" },
    });

    assert.equal(calls.destroy, 1);
    assert.equal(calls.ping, 1);
    assert.deepEqual(calls.exec, [
        {
            command: "node --version",
            options: { cwd: "/workspace", timeout: 5_000 },
        },
    ]);
    assert.deepEqual(calls.writeFile, [
        {
            path: "/workspace/src/index.js",
            content: "console.log(1)",
        },
    ]);
    assert.deepEqual(calls.mkdir, [
        { path: "/workspace/src", options: { recursive: true } },
    ]);
    assert.equal(read.content[0].text, "file contents");
    assert.deepEqual(calls.listFiles, ["/workspace/src"]);
    assert.deepEqual(calls.deleteFile, ["/workspace/src/index.js"]);
    assert.match(execution.content[0].text, /hello/);
    const response = calls.responses.at(-1);
    assert.equal(
        response.headers.get(MCP_USAGE_HEADERS.tool),
        "container_file_delete",
    );
    assert.ok(response.headers.has(MCP_USAGE_HEADERS.cost));
    await client.close();
});

test("reports and bills command failures", async () => {
    const { calls, env, worker } = createHarness({
        execResult: {
            success: false,
            stdout: "",
            stderr: "command failed",
            exitCode: 2,
        },
    });
    const client = await connect(worker, env, calls);
    const result = await client.callTool({
        name: "container_exec",
        arguments: { command: "false" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /command failed/);
    const response = calls.responses.at(-1);
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "422");
    assert.ok(response.headers.has(MCP_USAGE_HEADERS.cost));
    await client.close();
});

test("rejects requests without trusted caller identity", async () => {
    const { env, worker } = createHarness();
    const response = await worker.fetch(
        new Request("https://sandbox.internal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
            }),
        }),
        env,
    );
    assert.equal(response.status, 401);
});

test("keeps file operations inside the workspace", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    const result = await client.callTool({
        name: "container_file_read",
        arguments: { path: "../etc/passwd" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /inside \/workspace/);
    assert.equal(calls.readFile.length, 0);
    await client.close();
});
