import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

const COMPLETION = {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1791750000,
    model: "gpt-oss-20b",
    choices: [
        {
            index: 0,
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
        },
    ],
    usage: {
        prompt_tokens: 322,
        completion_tokens: 46,
        total_tokens: 368,
        completion_tokens_details: { reasoning_tokens: 10 },
    },
};

// SSE in small chunks, with "data: [DONE]" split across two of them and a
// further event after it
const SSE_CHUNKS = [
    'data: {"choices":[{"delta":{"content":"o"}}],"model":"gpt-oss-20b"}\n\n',
    'data: {"choices":[{"delta":{"content":"k"}}],"model":"gpt-oss-20b"}\n\ndata: [DO',
    'NE]\n\ndata: {"after":"done"}\n\n',
];

const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
};

/**
 * Fixed gen responses for POST /v1/chat/completions, picked by the last
 * message: "gen:<status>" answers that error, "gen:empty" an empty content,
 * "gen:length" a reply cut off at max_tokens,
 * "gen:echo" the request it got, "gen:stream-error" a stream that ends
 * with an error event, "gen:slow" waits 300 ms. Streams get SSE,
 * one chunk a second for "gen:long".
 */
async function gen(req, res) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const prompt = String(body.messages.at(-1)?.content);
    const status = prompt.match(/^gen:(\d{3})$/)?.[1];

    if (status) {
        return send(res, Number(status), {
            error: { message: `gen answered ${status}` },
        });
    }
    if (prompt === "gen:slow") await new Promise((r) => setTimeout(r, 300));
    // A stream gen opens, then ends with an error event, as gen does when the
    // provider fails mid-stream
    if (body.stream && prompt === "gen:stream-error") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(SSE_CHUNKS[0]);
        res.write(
            'data: {"error":{"message":"boom","type":"upstream_error"}}\n\n',
        );
        return res.end("data: [DONE]\n\n");
    }
    if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const pause = prompt === "gen:long" ? 1000 : 5;
        for (const chunk of SSE_CHUNKS) {
            res.write(chunk);
            await new Promise((r) => setTimeout(r, pause));
        }
        return res.end();
    }
    if (prompt === "gen:echo") {
        const echo = {
            authorization: req.headers.authorization,
            ip: req.headers["cf-connecting-ip"],
            referer: req.headers.referer,
            body,
        };
        const message = { role: "assistant", content: JSON.stringify(echo) };
        return send(res, 200, { ...COMPLETION, choices: [{ message }] });
    }
    // An error object in a 200, with and without a status
    if (prompt === "gen:200-error") {
        return send(res, 200, { error: { message: "boom", status: 503 } });
    }
    if (prompt === "gen:200-error-text")
        return send(res, 200, { error: "oops" });
    // A reply cut off at max_tokens
    if (prompt === "gen:length") {
        const message = { role: "assistant", content: '{"a": [1, 2' };
        return send(res, 200, {
            ...COMPLETION,
            choices: [{ message, finish_reason: "length" }],
        });
    }
    if (prompt === "gen:empty") {
        const message = { role: "assistant", content: "", reasoning: "hm" };
        return send(res, 200, { ...COMPLETION, choices: [{ message }] });
    }
    return send(res, 200, COMPLETION);
}

// Tests run in workerd with the [env.test] bindings from wrangler.toml
export default defineWorkersConfig({
    test: {
        restoreMocks: true,
        // vi.resetModules() must also reset the SDK's per-isolate /supported memo
        server: { deps: { inline: ["@weftlabs/sdk"] } },
        poolOptions: {
            workers: {
                wrangler: {
                    configPath: "./wrangler.toml",
                    environment: "test",
                },
                miniflare: {
                    bindings: {
                        GEN_API_KEY: "test-gen-key",
                        WEFT_SELLER_API_KEY: "test-seller-key",
                    },
                    serviceBindings: { GEN: { node: gen } },
                },
            },
        },
    },
});
