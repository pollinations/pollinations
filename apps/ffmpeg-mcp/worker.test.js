import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createWorker } from "./worker.js";

const TOKEN = "sk_test_ffmpeg";
const SOURCE = "https://media.pollinations.ai/source";

function createHarness(options = {}) {
    const calls = {
        authorize: [],
        settle: [],
        run: [],
        upload: [],
        destroy: 0,
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
        BILLING: {
            async authorize(token) {
                calls.authorize.push(token);
                return options.authorization ?? { ok: true };
            },
            async settle(token, input) {
                calls.settle.push({ token, input });
                return options.settlement ?? { ok: true, charge: 0.0001 };
            },
        },
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
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { "Content-Length": "3" },
            });
        },
    });
    return { calls, env, worker };
}

async function connect(worker, env, token = TOKEN) {
    const client = new Client(
        { name: "ffmpeg-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://ffmpeg.pollinations.ai"),
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

test("serves stateless HTTPS MCP at the root and requires bearer auth", async () => {
    const { env, worker } = createHarness();
    const health = await worker.fetch(
        new Request("https://ffmpeg.pollinations.ai/health"),
        env,
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://ffmpeg.pollinations.ai", { method: "POST" }),
        env,
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="ffmpeg.pollinations.ai"',
    );
    assert.equal(
        (
            await worker.fetch(
                new Request("https://ffmpeg.pollinations.ai/mcp"),
                env,
            )
        ).status,
        404,
    );
});

test("runs FFmpeg, stores its stream, settles billing, and returns a resource link", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["runFfmpeg"],
    );

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
    assert.match(result.content[1].text, /"charge":0.0001/);
    assert.deepEqual(calls.authorize, [TOKEN]);
    assert.deepEqual(calls.run[0].input, new Uint8Array([1, 2, 3]));
    assert.deepEqual(calls.run[0].args, ["-t", "1", "-vf", "scale=32:32"]);
    assert.deepEqual(calls.upload[0].body, new Uint8Array([4, 5, 6]));
    assert.deepEqual(calls.upload[0].input, {
        contentType: "video/mp4",
        fileName: "ffmpeg.mp4",
        size: 3,
    });
    assert.equal(calls.destroy, 1);
    assert.equal(calls.settle.length, 1);
    assert.equal(calls.settle[0].token, TOKEN);
    assert.equal(calls.settle[0].input.responseStatus, 200);
    assert.ok(calls.settle[0].input.runtimeMs >= 0);
    await client.close();
});

test("does not start a container when billing authorization fails", async () => {
    const { calls, env, worker } = createHarness({
        authorization: { ok: false, status: 401, message: "Invalid key" },
    });
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "runFfmpeg",
        arguments: {
            source: SOURCE,
            args: [],
            outputExtension: "mp4",
        },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Invalid key/);
    assert.equal(calls.run.length, 0);
    assert.equal(calls.settle.length, 0);
    await client.close();
});

test("accepts only hosted media inputs and arguments without a second input", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env);
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
    assert.equal(calls.authorize.length, 0);
    assert.equal(calls.run.length, 0);
    await client.close();
});

test("settles executed FFmpeg and media-upload failures", async () => {
    for (const options of [
        { runResult: { ok: false, stderr: "bad filter" }, status: 422 },
        { uploadError: new Error("media unavailable"), status: 502 },
    ]) {
        const { calls, env, worker } = createHarness(options);
        const client = await connect(worker, env);
        const result = await client.callTool({
            name: "runFfmpeg",
            arguments: {
                source: SOURCE,
                args: [],
                outputExtension: "mp4",
            },
        });
        assert.equal(result.isError, true);
        assert.equal(calls.settle.length, 1);
        assert.equal(calls.settle[0].input.responseStatus, options.status);
        assert.equal(calls.destroy, 1);
        await client.close();
    }
});
