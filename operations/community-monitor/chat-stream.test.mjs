import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChatStream } from "./chat-stream.mjs";

const content = 'data: {"choices":[{"delta":{"content":"ok-marker"}}]}\n\n';
const usage = { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 };
const counts = `data: ${JSON.stringify({ choices: [], usage })}\n\n`;
const done = "data: [DONE]\n\n";

test("reports missing usage even after a successful-looking answer", () => {
    const error =
        'data: {"error":{"code":"usage_missing","message":"internal diagnostic"}}\n\n';
    for (const newline of ["\n", "\r\n"]) {
        assert.deepEqual(
            parseChatStream(
                (content + counts + error).replaceAll("\n", newline),
            ),
            {
                content: "ok-marker",
                usage,
                protocolError:
                    "stream returned usage_missing: missing or invalid token usage",
            },
        );
    }
});

test("recognizes other errors without exposing provider messages", () => {
    const result = parseChatStream(
        `${content}data: {"error":{"message":"private diagnostic","code":"private-code"}}\n\n${done}`,
    );
    assert.equal(result.protocolError, "stream returned an error event");
});

test("preserves healthy streams and existing non-error validation", () => {
    assert.deepEqual(parseChatStream(content + counts + done), {
        content: "ok-marker",
        usage,
    });
    for (const [body, error] of [
        [`data: {}\n\n${done}`, "stream event is missing a choices array"],
        [`data: {broken}\n\n${done}`, "stream contained invalid JSON"],
        [content + counts, "stream is missing [DONE]"],
        [content + done + counts, "stream contained data after [DONE]"],
    ]) {
        assert.equal(parseChatStream(body).protocolError, error);
    }
});
