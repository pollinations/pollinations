import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import request from "supertest";
import { weftTextPayment } from "../weftX402.js";

const network = "eip155:84532";
const payTo = "0x0000000000000000000000000000000000000001";
const envKeys = [
    "WEFT_SELLER_API_KEY",
    "WEFT_PAY_TO",
    "WEFT_NETWORK",
    "WEFT_FACILITATOR_URL",
];
const originalEnv = envKeys.map((key) => process.env[key]);
const facilitatorRequests = [];
const facilitator = createServer((req, res) => {
    facilitatorRequests.push(req.url);
    if (req.url !== "/supported") {
        res.writeHead(500);
        res.end("Unexpected facilitator request");
        return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
        JSON.stringify({
            kinds: [{ x402Version: 2, scheme: "exact", network }],
            extensions: [],
            signers: {},
        }),
    );
});
const app = express();
app.use(weftTextPayment);
app.use((_req, res) => res.send("Unexpected text generation"));

before(async () => {
    await new Promise((resolve) => facilitator.listen(0, "127.0.0.1", resolve));
    const { port } = facilitator.address();
    process.env.WEFT_SELLER_API_KEY = "test-seller-key";
    process.env.WEFT_PAY_TO = payTo;
    process.env.WEFT_NETWORK = network;
    process.env.WEFT_FACILITATOR_URL = `http://127.0.0.1:${port}`;
});

after(async () => {
    envKeys.forEach((key, index) => {
        if (originalEnv[index] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[index];
    });
    await new Promise((resolve, reject) => {
        facilitator.close((error) => (error ? reject(error) : resolve()));
    });
});

for (const [method, path] of [
    ["get", "/hello"],
    ["post", "/"],
]) {
    test(`text ${method}: browser gets Weft setup with the same payment challenge`, async () => {
        const response = await request(app)
            [method](path)
            .set("Accept", "text/html")
            .set("User-Agent", "Mozilla/5.0");

        assert.equal(response.status, 402);
        assert.match(response.headers["content-type"], /text\/html/);
        assert.match(
            response.text,
            /set up https:\/\/weft\.network\/setup\.md/,
        );
        assert.match(
            response.text,
            /href="https:\/\/weft\.network\/setup\.md"/,
        );
        assert.match(response.text, /Get your response for just 0\.01 USD/);
        assert.match(response.text, /Give your AI agent a wallet/);
        assert.match(response.text, /Pay for this response with Weft\./);
        assert.doesNotMatch(response.text, /Get your image/);
        assert.match(
            response.text,
            /Create your Weft account and verify your email/,
        );
        assert.match(response.text, /\$3 in free credit/);
        assert.match(response.text, /src="data:image\/webp;base64,/);
        assert.match(response.text, /Connect your agent/);
        assert.match(response.text, /Ask it to pay/);
        assert.match(response.text, /class="setup-link"/);
        assert.doesNotMatch(response.text, /<img[^>]+src="https?:/);
        assert.doesNotMatch(response.text, /Note to developers/);
        assert.doesNotMatch(response.text, /<script/);
        assert.match(response.headers["cache-control"], /no-store/);

        const challenge = JSON.parse(
            Buffer.from(
                response.headers["payment-required"],
                "base64",
            ).toString(),
        );
        assert.equal(challenge.x402Version, 2);
        assert.equal(challenge.accepts.length, 1);
        assert.equal(challenge.accepts[0].scheme, "exact");
        assert.equal(challenge.accepts[0].network, network);
        assert.equal(challenge.accepts[0].payTo, payTo);
        assert.equal(challenge.accepts[0].amount, "10000");
    });

    test(`text ${method}: non-browser response stays JSON`, async () => {
        const response = await request(app)
            [method](path)
            .set("Accept", "application/json")
            .set("User-Agent", "Mozilla/5.0");

        assert.equal(response.status, 402);
        assert.match(response.headers["content-type"], /application\/json/);
        assert.deepEqual(response.body, {});
        assert.ok(response.headers["payment-required"]);
        assert.doesNotMatch(response.text, /weft\.network\/setup\.md/);
        assert.ok(facilitatorRequests.every((url) => url === "/supported"));
    });
}
