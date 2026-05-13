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

test("minimal AgentCore bee exposes ping, invocations, and OpenAI route", async () => {
    const { server, port } = await listen();
    try {
        const ping = await fetch(`http://127.0.0.1:${port}/ping`);
        const invocation = await fetch(`http://127.0.0.1:${port}/invocations`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ session_id: "s1", prompt: "hello" }),
        });
        const body = await invocation.json();
        const chat = await fetch(
            `http://127.0.0.1:${port}/v1/chat/completions`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "minimal-aws-agentcore-bee",
                    messages: [{ role: "user", content: "from openai" }],
                }),
            },
        );
        const chatBody = await chat.json();

        assert.equal(ping.status, 200);
        assert.equal(invocation.status, 200);
        assert.equal(chat.status, 200);
        assert.equal(body.session_id, "s1");
        assert.match(body.response, /hello/);
        assert.equal(chatBody.object, "chat.completion");
        assert.match(chatBody.choices[0].message.content, /from openai/);
    } finally {
        server.close();
    }
});
