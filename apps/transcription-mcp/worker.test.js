import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createWorker } from "./worker.js";

const SOURCE = "https://cdn.example.com/speech.mp3";

function createHarness(options = {}) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: url.toString(), init });
        if (url.toString() === SOURCE) {
            return (
                options.sourceResponse ??
                new Response(new Uint8Array([1, 2, 3]), {
                    headers: {
                        "Content-Type": "audio/mpeg",
                        "Content-Length": "3",
                    },
                })
            );
        }
        if (options.transcriptionResponse) {
            return options.transcriptionResponse;
        }
        return Response.json({
            text: "Hello from the recording.",
            language: "en",
            duration: 1.5,
        });
    };
    return {
        calls,
        worker: createWorker({ fetchImpl }),
        env: { GEN: { fetch: fetchImpl } },
    };
}

async function connect(worker, env) {
    const client = new Client(
        { name: "transcription-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://transcription.internal"),
        {
            requestInit: {
                headers: { Authorization: "Bearer test-key" },
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

test("lists one transcription tool", async () => {
    const { worker, env } = createHarness();
    const client = await connect(worker, env);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["transcribeAudio"],
    );
    await client.close();
});

test("fetches public audio and forwards it to the billed transcription API", async () => {
    const { calls, worker, env } = createHarness();
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "transcribeAudio",
        arguments: {
            source: SOURCE,
            model: "gpt-transcribe",
            language: "en",
            prompt: "Pollinations",
        },
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, "Hello from the recording.");
    const apiCall = calls[1];
    assert.equal(
        apiCall.url,
        "https://gen.pollinations.ai/v1/audio/transcriptions",
    );
    assert.equal(apiCall.init.headers.Authorization, "Bearer test-key");
    assert.equal(apiCall.init.body.get("model"), "gpt-transcribe");
    assert.equal(apiCall.init.body.get("language"), "en");
    assert.equal(apiCall.init.body.get("prompt"), "Pollinations");
    assert.equal(apiCall.init.body.get("file").size, 3);
    await client.close();
});

test("rejects unsafe sources before fetching", async () => {
    const { calls, worker, env } = createHarness();
    const client = await connect(worker, env);
    for (const source of [
        "http://example.com/audio.mp3",
        "https://localhost/audio.mp3",
        "https://127.0.0.1/audio.mp3",
        "https://user:secret@example.com/audio.mp3",
    ]) {
        const result = await client.callTool({
            name: "transcribeAudio",
            arguments: { source },
        });
        assert.equal(result.isError, true);
    }
    assert.equal(calls.length, 0);
    await client.close();
});

test("returns transcription API failures as tool errors", async () => {
    const { worker, env } = createHarness({
        transcriptionResponse: new Response("provider unavailable", {
            status: 503,
        }),
    });
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "transcribeAudio",
        arguments: { source: SOURCE },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /provider unavailable/);
    await client.close();
});

test("rejects oversized audio before buffering it", async () => {
    const { calls, worker, env } = createHarness({
        sourceResponse: new Response(new Uint8Array([1]), {
            headers: { "Content-Length": String(50 * 1024 * 1024 + 1) },
        }),
    });
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "transcribeAudio",
        arguments: { source: SOURCE },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /exceeds 50 MB/);
    assert.equal(calls.length, 1);
    await client.close();
});
