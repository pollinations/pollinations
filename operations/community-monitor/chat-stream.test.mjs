import assert from "node:assert/strict";
import { test } from "node:test";
import {
    hasChatProbeMarker,
    parseChatStream,
    probeErrorDetails,
} from "./chat-stream.mjs";

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
                errorCode: "usage_missing",
                errorMessage: "internal diagnostic",
                upstreamStatus: null,
            },
        );
    }
});

test("preserves safe terminal error details without raw upstream bodies", () => {
    const error = {
        code: "DEPLOYMENT_DISABLED",
        message:
            "Deployment disabled at https://private.example/test?key=secret Bearer hidden-token sk-probe-secret",
        details: { upstreamStatus: 402, upstreamBody: "private upstream body" },
    };
    const result = parseChatStream(
        `${content}data: ${JSON.stringify({ error })}\n\n${done}`,
    );
    assert.equal(result.protocolError, "stream returned an error event");
    assert.equal(result.errorCode, "DEPLOYMENT_DISABLED");
    assert.equal(
        result.errorMessage,
        "Deployment disabled at [URL] Bearer [redacted] [redacted]",
    );
    assert.equal(result.upstreamStatus, 402);
    for (const secret of [
        "private.example",
        "hidden-token",
        "sk-probe-secret",
        "private upstream body",
    ]) {
        assert.equal(JSON.stringify(result).includes(secret), false);
    }
});

test("keeps the agent caller-wallet failure distinct from a provider error", () => {
    const error = {
        code: "agent_error",
        message:
            "Insufficient balance. This request costs ~0.0397 pollen, but your available paid balance is 0.0000. Top up at https://enter.pollinations.ai",
    };
    const result = parseChatStream(
        `data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: ${JSON.stringify({ error })}\n\n`,
    );
    assert.equal(result.content, "");
    assert.equal(result.errorCode, "agent_error");
    assert.match(
        result.errorMessage,
        /Insufficient balance.*available paid balance is 0\.0000/,
    );
    assert.equal(result.upstreamStatus, null);
});

test("keeps caller and provider HTTP error metadata without attributing arbitrary 400s", () => {
    for (const [error, expected] of [
        [
            { code: "PAYMENT_REQUIRED", message: "Insufficient pollen" },
            {
                errorCode: "PAYMENT_REQUIRED",
                errorMessage: "Insufficient pollen",
                upstreamStatus: null,
            },
        ],
        [
            {
                code: "BAD_GATEWAY",
                message: "DEPLOYMENT_DISABLED",
                details: { upstreamStatus: 402 },
            },
            {
                errorCode: "BAD_GATEWAY",
                errorMessage: "DEPLOYMENT_DISABLED",
                upstreamStatus: 402,
            },
        ],
        [
            {
                code: "BAD_REQUEST",
                message: "UnsupportedModel",
                details: { upstreamStatus: 400 },
            },
            {
                errorCode: "BAD_REQUEST",
                errorMessage: "UnsupportedModel",
                upstreamStatus: 400,
            },
        ],
        [
            { code: "BAD_REQUEST", message: "Invalid input" },
            {
                errorCode: "BAD_REQUEST",
                errorMessage: "Invalid input",
                upstreamStatus: null,
            },
        ],
    ]) {
        assert.deepEqual(probeErrorDetails(error), expected);
    }
});

test("rejects finish_reason error and preserves its diagnostic even after text", () => {
    const result = parseChatStream(
        `${content}data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "error", error: { code: 429, message: "Provider quota exhausted" } }] })}\n\n${done}`,
    );
    assert.equal(result.protocolError, "stream ended with finish_reason=error");
    assert.equal(result.errorCode, "429");
    assert.equal(result.errorMessage, "Provider quota exhausted");
});

test("accepts marker case changes but still requires the nonce in final content", () => {
    const marker = "ok-a1b2c3d4";
    for (const response of [
        marker,
        "Ok-a1b2c3d4",
        "OK-A1B2C3D4",
        `<think>Thinking</think>\n${marker}`,
    ]) {
        assert.equal(hasChatProbeMarker(response, marker), true);
    }
    for (const response of [
        undefined,
        "ok-wrong123",
        "ok",
        `<think>${marker}</think>`,
        `<thought>${marker}`,
        `<THINK>${marker}`,
    ]) {
        assert.equal(hasChatProbeMarker(response, marker), false);
    }
});

test("preserves healthy streams and existing non-error validation", () => {
    assert.deepEqual(parseChatStream(content + counts + done), {
        content: "ok-marker",
        usage,
    });
    for (const [body, error] of [
        [`data: {}\n\n${done}`, "stream event is missing a choices array"],
        [`data: null\n\n${done}`, "stream event is missing a choices array"],
        [`data: {broken}\n\n${done}`, "stream contained invalid JSON"],
        [content + counts, "stream is missing [DONE]"],
        [content + done + counts, "stream contained data after [DONE]"],
    ]) {
        assert.equal(parseChatStream(body).protocolError, error);
    }
});

test("rejects an error event even if it includes choices", () => {
    assert.equal(
        parseChatStream(
            `${content}data: {"choices":[],"error":{"code":"usage_missing"}}\n\n${done}`,
        ).protocolError,
        "stream returned usage_missing: missing or invalid token usage",
    );
});
