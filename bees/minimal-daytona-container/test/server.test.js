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

test("minimal Daytona/container bee exposes health, card, message, and OpenAI routes", async () => {
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
        const chat = await fetch(
            `http://127.0.0.1:${port}/v1/chat/completions`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "minimal-daytona-container-bee",
                    messages: [{ role: "user", content: "from openai" }],
                }),
            },
        );
        const chatBody = await chat.json();

        assert.equal(health.status, 200);
        assert.equal(card.status, 200);
        assert.equal(message.status, 200);
        assert.equal(chat.status, 200);
        assert.match(messageBody.text, /hello/);
        assert.equal(chatBody.object, "chat.completion");
        assert.match(chatBody.choices[0].message.content, /from openai/);
    } finally {
        server.close();
    }
});
