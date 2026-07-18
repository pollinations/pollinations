import assert from "node:assert/strict";
import http from "node:http";
import { afterEach, test } from "node:test";
import { generateTextPortkey } from "../generateTextPortkey.js";

const originalGenApiKey = process.env.GEN_API_KEY;
const originalGenApiUrl = process.env.GEN_API_URL;

afterEach(() => {
    if (originalGenApiKey === undefined) delete process.env.GEN_API_KEY;
    else process.env.GEN_API_KEY = originalGenApiKey;

    if (originalGenApiUrl === undefined) delete process.env.GEN_API_URL;
    else process.env.GEN_API_URL = originalGenApiUrl;
});

test("routes legacy text generation through the authenticated Gen model", async () => {
    let received;
    const server = http.createServer((req, res) => {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            received = {
                authorization: req.headers.authorization,
                body: JSON.parse(body),
            };
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
                JSON.stringify({
                    id: "chatcmpl-test",
                    object: "chat.completion",
                    model: "gpt-oss-20b",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "hello" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 1,
                        completion_tokens: 1,
                        total_tokens: 2,
                    },
                }),
            );
        });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    process.env.GEN_API_KEY = "sk_legacy_text";
    process.env.GEN_API_URL = `http://127.0.0.1:${address.port}/v1/chat/completions`;

    try {
        const result = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "openai-fast",
                temperature: 0.5,
                userInfo: { username: "legacy-user" },
                isPrivate: true,
            },
        );

        assert.equal(result.choices[0].message.content, "hello");
        assert.equal(received.authorization, "Bearer sk_legacy_text");
        assert.equal(
            received.body.model,
            "sharktide/inferenceport.ai-gpt-oss-20b",
        );
        assert.equal(received.body.temperature, 0.5);
        assert.equal(received.body.userInfo, undefined);
        assert.equal(received.body.modelConfig, undefined);
        assert.equal(received.body.modelDef, undefined);
        assert.equal(received.body.isPrivate, undefined);
    } finally {
        await new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    }
});

test("passes Gen streaming responses through as OpenAI SSE", async () => {
    let receivedBody;
    const server = http.createServer((req, res) => {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            receivedBody = JSON.parse(body);
            res.writeHead(200, { "content-type": "text/event-stream" });
            res.end(
                'data: {"choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n\ndata: [DONE]\n\n',
            );
        });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    process.env.GEN_API_KEY = "sk_legacy_text";
    process.env.GEN_API_URL = `http://127.0.0.1:${address.port}/v1/chat/completions`;

    try {
        const result = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            { model: "openai-fast", stream: true },
        );
        let output = "";
        for await (const chunk of result.responseStream) output += chunk;

        assert.equal(result.stream, true);
        assert.equal(receivedBody.stream, true);
        assert.equal(
            receivedBody.model,
            "sharktide/inferenceport.ai-gpt-oss-20b",
        );
        assert.match(output, /"content":"hello"/);
        assert.match(output, /data: \[DONE\]/);
    } finally {
        await new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    }
});

test("fails closed when the Gen service key is missing", async () => {
    delete process.env.GEN_API_KEY;
    process.env.GEN_API_URL = "http://127.0.0.1:1/v1/chat/completions";

    await assert.rejects(
        generateTextPortkey([{ role: "user", content: "hello" }], {
            model: "openai-fast",
        }),
        /Generic OpenAI API key is not set/,
    );
});
