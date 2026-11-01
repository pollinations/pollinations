import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { textTools } from "../src/services/textService.js";

test("generateText accepts assistant tool calls with null content for tool-use continuation", () => {
    const shape = textTools.find(([name]) => name === "generateText")[2];
    const messages = [
        { role: "user", content: "What is the weather?" },
        {
            role: "assistant",
            content: null,
            tool_calls: [
                {
                    id: "call_1",
                    type: "function",
                    function: { name: "weather", arguments: "{}" },
                },
            ],
        },
        { role: "tool", tool_call_id: "call_1", content: "Sunny" },
    ];
    const result = z.object(shape).safeParse({ messages });
    assert.equal(
        result.success,
        true,
        "Tool-use continuation must be accepted",
    );
    assert.deepEqual(result.data.messages, messages);
});

test("generateText returns requested token log probabilities", async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = original;
    });
    const logprobs = {
        content: [{ token: "Hi", logprob: -0.1, top_logprobs: [] }],
    };
    globalThis.fetch = async (input) =>
        String(input).endsWith("/text/models")
            ? Response.json([{ name: "test-model" }])
            : Response.json({
                  choices: [{ message: { content: "Hi" }, logprobs }],
              });
    const generateText = textTools.find(([name]) => name === "generateText")[3];
    const result = await generateText(
        {
            model: "test-model",
            messages: [{ role: "user", content: "Hi" }],
            logprobs: true,
        },
        { http: { authInfo: { token: "sk_test" } } },
    );
    assert.deepEqual(JSON.parse(result.content.at(-1).text).logprobs, logprobs);
});

test("generateText labels MP3 audio with the audio/mpeg media type", async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = original;
    });
    globalThis.fetch = async (input) =>
        String(input).endsWith("/text/models")
            ? Response.json([{ name: "test-model" }])
            : Response.json({
                  choices: [{ message: { audio: { data: "SUQz" } } }],
              });
    const generateText = textTools.find(([name]) => name === "generateText")[3];
    const result = await generateText(
        {
            model: "test-model",
            messages: [{ role: "user", content: "Say hello" }],
            modalities: ["audio"],
            audio: { voice: "alloy", format: "mp3" },
        },
        { http: { authInfo: { token: "sk_test" } } },
    );
    // MP3's registered media type is audio/mpeg, as in audioService.test.js.
    assert.deepEqual(
        result.content.find((block) => block.type === "audio"),
        {
            type: "audio",
            mimeType: "audio/mpeg",
            data: "SUQz",
        },
    );
});
