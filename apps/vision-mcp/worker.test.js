import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createWorker } from "./worker.js";

const IMAGE_URL = "https://media.pollinations.ai/example.png";

function createHarness(options = {}) {
    const calls = [];
    const imageCalls = [];
    const fetchImage = async (url, init) => {
        imageCalls.push({ url: url.toString(), init });
        return (
            options.imageResponse ??
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "Content-Type": "image/png" },
            })
        );
    };
    const fetchGen = async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        if (options.response) return options.response;
        return Response.json({
            choices: [{ message: { content: "The sign says Pollinations." } }],
        });
    };
    return {
        calls,
        imageCalls,
        worker: createWorker({ fetchImpl: fetchImage }),
        env: { GEN: { fetch: fetchGen } },
    };
}

async function connect(worker, env) {
    const client = new Client(
        { name: "vision-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://vision.internal"),
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

test("lists one visual-understanding tool", async () => {
    const { worker, env } = createHarness();
    const client = await connect(worker, env);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["analyzeImage"],
    );
    await client.close();
});

test("forwards multimodal input and caller billing auth to Gen", async () => {
    const { calls, imageCalls, worker, env } = createHarness();
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "analyzeImage",
        arguments: {
            imageUrl: IMAGE_URL,
            question: "Read the sign",
            model: "openai",
        },
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, "The sign says Pollinations.");
    assert.equal(imageCalls[0].url, IMAGE_URL);
    assert.equal(
        calls[0].url,
        "https://gen.pollinations.ai/v1/chat/completions",
    );
    assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
    assert.deepEqual(calls[0].body, {
        model: "openai",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: "Read the sign" },
                    {
                        type: "image_url",
                        image_url: { url: "data:image/png;base64,AQID" },
                    },
                ],
            },
        ],
    });
    await client.close();
});

test("rejects unsafe image URLs before calling Gen", async () => {
    const { calls, imageCalls, worker, env } = createHarness();
    const client = await connect(worker, env);
    for (const imageUrl of [
        "http://example.com/image.png",
        "https://localhost/image.png",
        "https://127.0.0.1/image.png",
        "https://user:secret@example.com/image.png",
    ]) {
        const result = await client.callTool({
            name: "analyzeImage",
            arguments: { imageUrl },
        });
        assert.equal(result.isError, true);
    }
    assert.equal(calls.length, 0);
    assert.equal(imageCalls.length, 0);
    await client.close();
});

test("returns Gen failures as tool errors", async () => {
    const { worker, env } = createHarness({
        response: new Response("vision unavailable", { status: 503 }),
    });
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "analyzeImage",
        arguments: { imageUrl: IMAGE_URL },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /vision unavailable/);
    await client.close();
});
