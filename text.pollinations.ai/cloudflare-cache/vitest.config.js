import { readFileSync } from "node:fs";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// wrangler.toml's Data rule for *.webp, for the tests: the pool cannot load a
// Data module from outside this folder (shared/assets/weft-paywall.webp)
const webpAsArrayBuffer = {
    name: "webp-as-array-buffer",
    enforce: "pre",
    async resolveId(source, importer) {
        if (!source.endsWith(".webp")) return;
        const resolved = await this.resolve(source, importer, {
            skipSelf: true,
        });
        // The query keeps the pool from handing the file to its Data rule
        return `${resolved.id}?array-buffer`;
    },
    load(id) {
        if (!id.endsWith(".webp?array-buffer")) return;
        const file = id.replace("?array-buffer", "");
        const base64 = readFileSync(file).toString("base64");
        return `export default Uint8Array.from(atob("${base64}"), (c) => c.charCodeAt(0)).buffer;`;
    },
};

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
 * "gen:echo" the request it got, "gen:slow" waits 300 ms. Streams get SSE.
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
    if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const chunk of SSE_CHUNKS) {
            res.write(chunk);
            await new Promise((r) => setTimeout(r, 5));
        }
        return res.end();
    }
    if (prompt === "gen:echo") {
        const echo = { authorization: req.headers.authorization, body };
        const message = { role: "assistant", content: JSON.stringify(echo) };
        return send(res, 200, { ...COMPLETION, choices: [{ message }] });
    }
    if (prompt === "gen:empty") {
        const message = { role: "assistant", content: "", reasoning: "hm" };
        return send(res, 200, { ...COMPLETION, choices: [{ message }] });
    }
    return send(res, 200, COMPLETION);
}

// Tests run in workerd with the [env.test] bindings from wrangler.toml
export default defineWorkersConfig({
    plugins: [webpAsArrayBuffer],
    test: {
        restoreMocks: true,
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
