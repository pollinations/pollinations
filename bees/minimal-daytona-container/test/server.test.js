import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { handle } from "../src/server.js";

function listen() {
    const server = createServer(handle);
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            resolve({ server, port: address.port });
        });
    });
}

test("minimal Daytona/container bee exposes health, card, and message route", async () => {
    const { server, port } = await listen();
    try {
        const health = await fetch(`http://127.0.0.1:${port}/health`);
        const card = await fetch(
            `http://127.0.0.1:${port}/.well-known/agent-card.json`,
        );
        const message = await fetch(`http://127.0.0.1:${port}/message`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: "hello" }),
        });
        const messageBody = await message.json();

        assert.equal(health.status, 200);
        assert.equal(card.status, 200);
        assert.equal(message.status, 200);
        assert.match(messageBody.text, /hello/);
    } finally {
        server.close();
    }
});
