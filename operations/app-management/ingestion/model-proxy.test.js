const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");

process.env.POLLINATIONS_API_KEY = "sk_test";
const server = require("./model-proxy.js");

// Records where the proxy would send each request instead of calling gen.
let upstream;
const calls = [];
globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return upstream();
};

before(() => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)));
after(() => server.close());

// Sends the request target as written, without URL normalization.
function send(path, method = "POST") {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: "127.0.0.1", port: server.address().port, path, method },
            (res) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () =>
                    resolve({
                        status: res.statusCode,
                        body: Buffer.concat(chunks).toString(),
                    }),
                );
            },
        );
        req.on("error", reject);
        req.end(
            method === "POST"
                ? JSON.stringify({ model: "openai/gpt-5", messages: [] })
                : undefined,
        );
    });
}

test("forwards Messages requests only to gen's fixed URL, on the pinned model", async () => {
    upstream = () => new Response("{}");
    calls.length = 0;
    for (const path of [
        "/v1/messages?beta=true",
        "http://attacker.example/v1/messages",
        "/v1/messages?host=attacker.example",
    ]) {
        assert.equal((await send(path)).status, 200);
    }
    for (const { url, init } of calls) {
        assert.equal(url, "https://gen.pollinations.ai/v1/messages");
        assert.equal(init.headers.authorization, "Bearer sk_test");
        assert.equal(JSON.parse(init.body).model, "openai/gpt-6-luna");
    }
    assert.equal(calls.length, 3);
});

test("refuses other paths and methods without calling upstream", async () => {
    calls.length = 0;
    for (const path of [
        "/v1/messages/../../account/keys",
        "/v1/messages/%2e%2e/%2e%2e/account/keys",
        "/v1/messages/count_tokens",
        "http://attacker.example/account/keys",
    ]) {
        assert.equal((await send(path)).status, 403);
    }
    assert.equal((await send("/v1/messages", "GET")).status, 403);
    assert.equal(calls.length, 0);
});

test("answers an upstream failure without its error text", async () => {
    upstream = () => {
        throw new Error("upstream detail");
    };
    assert.deepEqual(await send("/v1/messages"), { status: 502, body: "" });
});
