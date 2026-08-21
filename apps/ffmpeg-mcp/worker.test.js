import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

const SOURCE = "https://media.pollinations.ai/source";

function createHarness(options = {}) {
    const calls = {
        run: [],
        upload: [],
        destroy: 0,
        responses: [],
    };
    const container = {
        async run(input, args, outputExtension, deadlineMs) {
            calls.run.push({
                input: new Uint8Array(await new Response(input).arrayBuffer()),
                args,
                outputExtension,
                deadlineMs,
            });
            return (
                options.runResult ?? {
                    ok: true,
                    output: new Blob([new Uint8Array([4, 5, 6])]).stream(),
                    bytes: 3,
                    stderr: "",
                }
            );
        },
        async destroy() {
            calls.destroy += 1;
        },
    };
    const env = {
        FFMPEG: {},
        MEDIA: {
            async upload(body, input) {
                calls.upload.push({
                    body: new Uint8Array(
                        await new Response(body).arrayBuffer(),
                    ),
                    input,
                });
                if (options.uploadError) throw options.uploadError;
                return {
                    id: "output",
                    url: "https://media.pollinations.ai/output",
                    contentType: input.contentType,
                    size: input.size,
                };
            },
        },
    };
    const worker = createWorker({
        getContainerImpl: () => container,
        createFixedLengthStreamImpl: () => new TransformStream(),
        fetchImpl: async (url, init) => {
            assert.equal(url, SOURCE);
            assert.equal(init.redirect, "manual");
            return (
                options.sourceResponse ??
                new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "Content-Length": "3" },
                })
            );
        },
    });
    return { calls, env, worker };
}

async function connect(worker, env, calls) {
    const client = new Client(
        { name: "ffmpeg-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://ffmpeg.internal"),
        {
            fetch: async (input, init) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                const response = await worker.fetch(request, env);
                calls.responses.push(response.clone());
                return response;
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves stateless MCP without caller credentials", async () => {
    const { calls, env, worker } = createHarness();
    const health = await worker.fetch(
        new Request("https://ffmpeg.internal/health"),
        env,
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const client = await connect(worker, env, calls);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["runFfmpeg"],
    );
    assert.equal(
        calls.responses.some((response) =>
            response.headers.has(MCP_USAGE_HEADERS.cost),
        ),
        false,
    );
    await client.close();
});

test("runs FFmpeg, uploads the output, and reports trusted usage", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    const result = await client.callTool({
        name: "runFfmpeg",
        arguments: {
            source: SOURCE,
            args: ["-t", "1", "-vf", "scale=32:32"],
            outputExtension: "mp4",
        },
    });

    assert.equal(result.isError, undefined);
    assert.deepEqual(result.content[0], {
        type: "resource_link",
        uri: "https://media.pollinations.ai/output",
        name: "FFmpeg output",
        mimeType: "video/mp4",
    });
    assert.deepEqual(calls.run[0].input, new Uint8Array([1, 2, 3]));
    assert.deepEqual(calls.run[0].args, ["-t", "1", "-vf", "scale=32:32"]);
    assert.deepEqual(calls.upload[0].body, new Uint8Array([4, 5, 6]));
    assert.equal(calls.destroy, 1);

    const response = calls.responses.at(-1);
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.tool), "runFfmpeg");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "200");
    assert.equal(
        response.headers.get(MCP_USAGE_HEADERS.adjustmentId),
        "cloudflare.container.basic_runtime.v1",
    );
    assert.ok(Number(response.headers.get(MCP_USAGE_HEADERS.cost)) >= 0);
    await client.close();
});

test("accepts only Pollinations media and a single supplied input", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    for (const arguments_ of [
        {
            source: "https://example.com/source.mp4",
            args: [],
            outputExtension: "mp4",
        },
        {
            source: SOURCE,
            args: ["-i", "https://example.com/other.mp4"],
            outputExtension: "mp4",
        },
    ]) {
        const result = await client.callTool({
            name: "runFfmpeg",
            arguments: arguments_,
        });
        assert.equal(result.isError, true);
    }
    assert.equal(calls.run.length, 0);
    assert.equal(
        calls.responses.some((response) =>
            response.headers.has(MCP_USAGE_HEADERS.cost),
        ),
        false,
    );
    await client.close();
});

test("rejects source responses without a known size", async () => {
    const { calls, env, worker } = createHarness({
        sourceResponse: new Response(new Uint8Array([1, 2, 3])),
    });
    const client = await connect(worker, env, calls);
    const result = await client.callTool({
        name: "runFfmpeg",
        arguments: {
            source: SOURCE,
            args: [],
            outputExtension: "mp4",
        },
    });
    assert.equal(result.isError, true);
    assert.equal(calls.run.length, 0);
    assert.equal(
        calls.responses.at(-1).headers.has(MCP_USAGE_HEADERS.cost),
        false,
    );
    await client.close();
});

test("reports usage for executed failures", async () => {
    for (const options of [
        { runResult: { ok: false, stderr: "bad filter" }, status: 422 },
        { uploadError: new Error("media unavailable"), status: 502 },
    ]) {
        const { calls, env, worker } = createHarness(options);
        const client = await connect(worker, env, calls);
        const result = await client.callTool({
            name: "runFfmpeg",
            arguments: {
                source: SOURCE,
                args: [],
                outputExtension: "mp4",
            },
        });
        assert.equal(result.isError, true);
        const response = calls.responses.at(-1);
        assert.equal(
            response.headers.get(MCP_USAGE_HEADERS.status),
            String(options.status),
        );
        assert.ok(response.headers.has(MCP_USAGE_HEADERS.cost));
        assert.equal(calls.destroy, 1);
        await client.close();
    }
});
