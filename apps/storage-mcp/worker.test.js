import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createWorker } from "./worker.js";

const LIST_XML = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>next-page</NextContinuationToken><Contents><Key>private/memory.md</Key><LastModified>2026-08-23T00:00:00.000Z</LastModified><ETag>"abc123"</ETag><Size>12</Size></Contents></ListBucketResult>`;

function createHarness(respond) {
    const calls = [];
    const worker = createWorker();
    const env = {
        MEDIA: {
            async fetch(request) {
                calls.push(request.clone());
                if (respond) return respond(request);
                if (
                    request.method === "GET" &&
                    new URL(request.url).pathname === "/s3/"
                ) {
                    return new Response(LIST_XML, {
                        headers: { "Content-Type": "application/xml" },
                    });
                }
                if (request.method === "GET") {
                    return new Response("remember this", {
                        headers: {
                            "Content-Type": "text/plain",
                            "Content-Length": "13",
                        },
                    });
                }
                return new Response(null, {
                    status: request.method === "DELETE" ? 204 : 200,
                });
            },
        },
    };
    return { calls, env, worker };
}

async function connect(worker, env) {
    const client = new Client(
        { name: "storage-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://storage.internal"),
        {
            requestInit: {
                headers: { Authorization: "Bearer ag_test" },
            },
            fetch: (input, init) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                return worker.fetch(request, env);
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("lists the four stateless storage tools", async () => {
    const { env, worker } = createHarness();
    const client = await connect(worker, env);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["listFiles", "readTextFile", "writeTextFile", "deleteFile"],
    );
    await client.close();
});

test("lists caller-scoped files and forwards the agent credential", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "listFiles",
        arguments: { prefix: "private/", limit: 20 },
    });

    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        files: [
            {
                key: "private/memory.md",
                size: 12,
                lastModified: "2026-08-23T00:00:00.000Z",
                etag: "abc123",
            },
        ],
        cursor: "next-page",
    });
    const request = calls.at(-1);
    assert.equal(request.headers.get("authorization"), "Bearer ag_test");
    assert.equal(new URL(request.url).searchParams.get("prefix"), "private/");
    assert.equal(new URL(request.url).searchParams.get("max-keys"), "20");
    await client.close();
});

test("reads, writes, and deletes private text files", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env);

    const read = await client.callTool({
        name: "readTextFile",
        arguments: { key: "private/memory.md" },
    });
    assert.equal(read.content[0].text, "remember this");

    await client.callTool({
        name: "writeTextFile",
        arguments: {
            key: "private/folder/new memory.md",
            content: "new memory",
            contentType: "text/markdown",
        },
    });
    const write = calls.at(-1);
    assert.equal(write.method, "PUT");
    assert.equal(
        new URL(write.url).pathname,
        "/s3/private/folder/new%20memory.md",
    );
    assert.equal(write.headers.get("content-type"), "text/markdown");
    assert.equal(await write.text(), "new memory");

    await client.callTool({
        name: "deleteFile",
        arguments: { key: "private/folder/new memory.md" },
    });
    assert.equal(calls.at(-1).method, "DELETE");
    await client.close();
});

test("rejects invalid keys before storage access", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env);
    for (const key of ["memory.md", "private/../secret.md"]) {
        const result = await client.callTool({
            name: "readTextFile",
            arguments: { key },
        });
        assert.equal(result.isError, true);
    }
    assert.equal(calls.length, 0);
    await client.close();
});

test("rejects files larger than model context before reading the body", async () => {
    const { env, worker } = createHarness(
        () =>
            new Response("x", {
                headers: { "Content-Length": String(64 * 1024 + 1) },
            }),
    );
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "readTextFile",
        arguments: { key: "private/large.txt" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /too large/);
    await client.close();
});

test("rejects JSON-RPC batches", async () => {
    const { env, worker } = createHarness();
    const response = await worker.fetch(
        new Request("https://storage.internal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "[]",
        }),
        env,
    );
    assert.equal(response.status, 400);
});
