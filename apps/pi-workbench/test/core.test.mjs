import assert from "node:assert/strict";
import { test } from "node:test";
import {
    authorizeRequest,
    mcpResult,
    projectPath,
    streamReceipt,
} from "../public/core.js";

const options = { model: "openai/gpt-5.4-nano", exa: false, computer: false };
const request = (url, body) => ({
    url,
    method: "POST",
    body: JSON.stringify(body),
});
test("credential bridge refuses other hosts, account mutations, disabled MCPs, and model substitution", () => {
    const model = { model: options.model };
    for (const url of [
        "https://evil.example/v1/chat/completions",
        "https://gen.pollinations.ai/account/keys",
        "https://gen.pollinations.ai/v1/chat/completions?destination=evil",
        "https://gen.pollinations.ai/mcp/computer",
    ])
        assert.throws(() => authorizeRequest(request(url, model), options));
    assert.throws(() =>
        authorizeRequest(
            request("https://gen.pollinations.ai/v1/chat/completions", {
                model: "other",
            }),
            options,
        ),
    );
    const allowed = authorizeRequest(
        request("https://gen.pollinations.ai/v1/chat/completions", {
            ...model,
            max_tokens: 99999,
        }),
        options,
    );
    assert.equal(allowed.body.max_completion_tokens, undefined);
    assert.equal(allowed.body.max_tokens, 99999);
    assert.deepEqual(allowed.body.stream_options, { include_usage: true });
});
test("terminal uses Pi's selected model and preserves its configured token allowance", () => {
    const body = { model: "other", max_completion_tokens: 64000 };
    const allowed = authorizeRequest(
        request("https://gen.pollinations.ai/v1/chat/completions", body),
        { ...options, mode: "terminal" },
    );
    assert.equal(allowed.body.model, "other");
    assert.equal(allowed.body.max_completion_tokens, 64000);
    assert.throws(() =>
        authorizeRequest(
            request("https://evil.example/v1/chat/completions", body),
            { ...options, mode: "terminal" },
        ),
    );
});
test("enabled MCP only permits explicitly supported tool calls, never publish", () => {
    const call = (name) =>
        request("https://gen.pollinations.ai/mcp/computer", {
            jsonrpc: "2.0",
            method: "tools/call",
            params: { name, arguments: {} },
        });
    assert.equal(
        authorizeRequest(call("bash"), { ...options, computer: true }).kind,
        "bash",
    );
    assert.throws(() =>
        authorizeRequest(call("publish"), { ...options, computer: true }),
    );
});
test("project import and editor reject paths outside the visible project and reserved credentials", () => {
    assert.equal(projectPath("src/main.js"), "src/main.js");
    assert.equal(projectPath(".env.example"), ".env.example");
    assert.equal(
        projectPath("src/.config/settings.json"),
        "src/.config/settings.json",
    );
    for (const path of [
        "/etc/passwd",
        "../secret",
        "src/../../x",
        ".pi/auth.json",
        "src\\file",
        "src//file",
    ])
        assert.throws(() => projectPath(path));
});
test("stream receipts require provider usage and retain the real response ID", () => {
    const body =
        'data: {"id":"chatcmpl-real","choices":[]}\n\ndata: {"id":"chatcmpl-real","usage":{"prompt_tokens":32,"completion_tokens":4,"total_tokens":36}}\n\ndata: [DONE]\n\n';
    assert.deepEqual(streamReceipt(body), {
        responseId: "chatcmpl-real",
        usage: { prompt_tokens: 32, completion_tokens: 4, total_tokens: 36 },
    });
    assert.throws(() =>
        streamReceipt('data: {"id":"no-usage"}\n\ndata: [DONE]\n'),
    );
});
test("MCP results decode both supported response transports and surface tool failures", () => {
    const result = { content: [{ type: "text", text: "source" }] };
    const body = JSON.stringify({ jsonrpc: "2.0", id: "1", result });
    assert.deepEqual(mcpResult(body, "application/json"), result);
    assert.deepEqual(
        mcpResult(`data: ${body}\n\n`, "text/event-stream"),
        result,
    );
    assert.throws(() =>
        mcpResult('{"result":{"isError":true}}', "application/json"),
    );
});
