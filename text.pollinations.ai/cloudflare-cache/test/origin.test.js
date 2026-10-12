import {
    createExecutionContext,
    env,
    runInDurableObject,
    waitOnExecutionContext,
} from "cloudflare:test";
import { expect, test, vi } from "vitest";
import worker from "../src/index.js";
import primeHeaders from "./fixtures/text.pollinations.ai-prime.headers?raw";
import vmModels from "./fixtures/vm-models.body?raw";
import vmRootRedirect from "./fixtures/vm-root-redirect.headers?raw";
import vm404 from "./fixtures/vm-unknown-model-404.body?raw";
import { alarmOf, call, capturedHeaders, nextIp, storedAt } from "./helpers.js";

// The fixed gen responses are in vitest.config.js
const NOTICE = JSON.parse(vm404).deprecation_notice;
const JSON_BODY = { "content-type": "application/json" };
const SSE_UNTIL_DONE =
    'data: {"choices":[{"delta":{"content":"o"}}],"model":"gpt-oss-20b"}\n\n' +
    'data: {"choices":[{"delta":{"content":"k"}}],"model":"gpt-oss-20b"}\n\n' +
    "data: [DONE]\n\n";

/** The IP_SLOT alarm of an IP whose last generation ended: within the interval */
const released = async (ip) => {
    const alarm = await alarmOf(ip);
    return alarm !== null && alarm <= Date.now() + 30_000;
};

/** env with a GEN binding that records the bodies it sends to gen */
function recordingGen() {
    const bodies = [];
    const testEnv = {
        ...env,
        GEN: {
            fetch: (url, init) => {
                bodies.push(JSON.parse(init.body));
                return env.GEN.fetch(url, init);
            },
        },
    };
    return { bodies, testEnv };
}

test("a free GET answers gen's text with the VM's headers and is stored", async () => {
    const { response, text } = await call("/free%20get");

    expect(response.status).toBe(200);
    expect(text).toBe("ok");
    const vm = capturedHeaders(primeHeaders);
    for (const name of [
        "content-type",
        "content-length",
        "cache-control",
        "etag",
        "access-control-allow-origin",
        "access-control-expose-headers",
        "link",
        "x-pollinations-logo",
        "x-powered-by",
        "x-model-used",
        "x-usage-prompt-text-tokens",
    ]) {
        expect(response.headers.get(name), name).toBe(vm.get(name));
    }
    // From the fixed gen usage: 46 completion tokens, 10 of them reasoning
    expect(response.headers.get("x-usage-completion-text-tokens")).toBe("36");
    expect(response.headers.get("x-usage-completion-reasoning-tokens")).toBe(
        "10",
    );
    expect(response.headers.get("x-usage-total-tokens")).toBe("368");
    expect(response.headers.get("x-legacy-path")).toBe("worker");
    // Content-Length sends it through the cache code's regular branch
    expect(response.headers.get("x-cache")).toBeNull();

    const hit = await call("/free%20get");
    expect(hit.response.headers.get("x-cache")).toBe("HIT");
    expect(hit.text).toBe("ok");
    expect(hit.response.headers.get("content-type")).toBe(
        "text/plain; charset=utf-8",
    );
});

test("gen gets the VM's request: bridge key, gpt-oss, system prompt, 1500 tokens, clamped parameters", async () => {
    const get = await call(
        "/gen:echo?temperature=9&top_p=-1&presence_penalty=5&frequency_penalty=-9&seed=4.7&json=true&model=openai&voice=nova",
    );
    const echo = JSON.parse(get.text);

    expect(echo.authorization).toBe("Bearer test-gen-key");
    expect(echo.body).toEqual({
        model: "gpt-oss",
        messages: [
            {
                role: "system",
                content: expect.stringMatching(
                    /^You are an expert conversationalist/,
                ),
            },
            { role: "user", content: "gen:echo" },
        ],
        seed: 4,
        temperature: 3,
        top_p: 0,
        presence_penalty: 2,
        frequency_penalty: -2,
        response_format: { type: "json_object" },
        stream: false,
        max_tokens: 1500,
    });

    // A given system prompt replaces the default; empty user messages get a placeholder
    const post = await call("/", {
        method: "POST",
        headers: JSON_BODY,
        body: JSON.stringify({
            system: "Be brief.",
            max_tokens: 99,
            messages: [
                { role: "user", content: " " },
                { role: "user", content: "gen:echo" },
            ],
        }),
    });
    const { body } = JSON.parse(post.text);
    expect(body.messages).toEqual([
        { role: "system", content: "Be brief." },
        { role: "user", content: "Please provide a response." },
        { role: "user", content: "gen:echo" },
    ]);
    expect(body.max_tokens).toBe(1500);

    // "/openai*" without messages: the rest of the path is the user message
    const openai = await call("/openaigen:echo", { method: "POST" });
    const { content } = JSON.parse(openai.text).choices[0].message;
    expect(JSON.parse(content).body.messages.at(-1)).toEqual({
        role: "user",
        content: "gen:echo",
    });
});

test("POST /openai and /v1/chat/completions answer OpenAI JSON with a pllns_ id", async () => {
    for (const path of ["/openai", "/v1/chat/completions"]) {
        const { response, text } = await call(path, {
            method: "POST",
            headers: JSON_BODY,
            body: JSON.stringify({
                messages: [{ role: "user", content: path }],
            }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe(
            "application/json; charset=utf-8",
        );
        expect(response.headers.get("cache-control")).toBeNull();
        expect(response.headers.get("x-usage-total-tokens")).toBe("368");
        const completion = JSON.parse(text);
        expect(completion).toMatchObject({
            object: "chat.completion",
            created: 1791750000,
            model: "gpt-oss-20b",
            user_tier: "anonymous",
            choices: [{ message: { role: "assistant", content: "ok" } }],
        });
        expect(completion.id).toMatch(/^pllns_[0-9a-f]{32}$/);
    }
});

test("a message without content answers the message itself as JSON", async () => {
    const { response, text } = await call("/gen:empty");

    expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
    );
    expect(JSON.parse(text)).toEqual({
        role: "assistant",
        content: "",
        reasoning: "hm",
    });
});

test("a stream ends after data: [DONE] and is stored once complete", async () => {
    const { response, text } = await call("/stream?stream=true");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
        "text/event-stream; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(text).toBe(SSE_UNTIL_DONE);

    const hit = await call("/stream?stream=true");
    expect(hit.response.headers.get("x-cache")).toBe("HIT");
    expect(hit.text).toBe(SSE_UNTIL_DONE);
});

test("gen errors keep the VM's JSON: the status passes through, a failed stream is a 500", async () => {
    const failed = await call("/gen:503");
    expect(failed.response.status).toBe(503);
    expect(JSON.parse(failed.text)).toEqual({
        error: "503 Service Unavailable",
        status: 503,
        deprecation_notice: NOTICE,
        details: { error: { message: "gen answered 503" } },
    });

    // node-fetch's statusText: the reason phrase of any status gen passes on
    const unprocessable = await call("/gen:422");
    expect(JSON.parse(unprocessable.text).error).toBe(
        "422 Unprocessable Entity",
    );

    // The VM's cache stored a gen 400 like any status below 401
    const rejected = await call("/gen:400");
    expect(rejected.response.status).toBe(400);
    expect(await storedAt("/gen:400")).not.toBeNull();

    const stream = await call("/gen:400?stream=true");
    expect(stream.response.status).toBe(500);
    expect(JSON.parse(stream.text)).toEqual({
        error: "400 Bad Request",
        status: 500,
        deprecation_notice: NOTICE,
    });
    expect(await storedAt("/gen:400?stream=true")).toBeNull();
});

test("the VM's other routes: redirect, models, crossdomain, feed and preflight", async () => {
    const root = await call("/");
    expect(root.response.status).toBe(301);
    const vm = capturedHeaders(vmRootRedirect);
    for (const name of [
        "content-type",
        "content-length",
        "location",
        "vary",
        "access-control-allow-origin",
        "access-control-expose-headers",
    ]) {
        expect(root.response.headers.get(name), name).toBe(vm.get(name));
    }
    expect(root.text).toBe(
        "Moved Permanently. Redirecting to https://github.com/pollinations/pollinations/blob/master/APIDOCS.md",
    );
    // res.redirect negotiates text/plain, text/html or an empty body
    const html = `<p>${root.text}</p>`;
    for (const [accept, type, body] of [
        ["text/html", "text/html", html],
        ["text/html,application/xhtml+xml,*/*;q=0.8", "text/html", html],
        ["text/plain, text/html", "text/plain", root.text],
        ["text/html;q=0.5, */*", "text/plain", root.text],
        ["application/json, text/*;q=0.2", "text/plain", root.text],
        ["*/plain", "text/plain", root.text],
        ["TEXT/HTML", "text/html", html],
        ["application/json", null, ""],
        ["text/html;q=0, text/plain;q=0", null, ""],
        ["text/html;level=1", null, ""],
        ["*", null, ""],
    ]) {
        const { response, text } = await call("/", { headers: { accept } });
        expect(response.status, accept).toBe(301);
        expect(text, accept).toBe(body);
        expect(response.headers.get("content-type"), accept).toBe(
            type && `${type}; charset=utf-8`,
        );
        expect(response.headers.get("content-length"), accept).toBe(
            String(body.length),
        );
        expect(response.headers.get("vary"), accept).toBe("Accept");
    }

    const models = await call("/models");
    expect(models.text).toBe(vmModels);
    expect(models.response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
    );

    const openAiModels = JSON.parse((await call("/openai/models")).text);
    expect(openAiModels).toEqual({
        object: "list",
        data: [
            {
                id: "openai-fast",
                object: "model",
                created: expect.any(Number),
                owned_by: "ovh",
            },
        ],
    });

    const xml = await call("/crossdomain.xml");
    expect(xml.response.headers.get("content-type")).toBe(
        "application/xml; charset=utf-8",
    );
    expect(xml.text).toContain(
        '<allow-access-from domain="*" secure="false"/>',
    );

    const feed = await call("/feed");
    expect(feed.response.status).toBe(410);
    expect(feed.response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(feed.text)).toEqual({
        error: "feed_removed",
        message: "The public feed has been retired.",
    });

    const preflight = await call("/anything", {
        method: "OPTIONS",
        headers: {
            origin: "https://example.com",
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type,x-custom",
        },
    });
    expect(preflight.response.status).toBe(204);
    expect(preflight.response.headers.get("access-control-allow-origin")).toBe(
        "*",
    );
    expect(preflight.response.headers.get("access-control-allow-methods")).toBe(
        "GET,HEAD,PUT,PATCH,POST,DELETE",
    );
    expect(preflight.response.headers.get("access-control-allow-headers")).toBe(
        "content-type,x-custom",
    );
    // cors() set it for Safari
    expect(preflight.response.headers.get("content-length")).toBe("0");
    // Preflights take the cache path and its split, as before
    expect(preflight.response.headers.get("x-legacy-path")).toBe("worker");
});

/** Express's finalhandler page, as the VM sent it without its stack lines */
const errorPage = (message) =>
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>${message}</pre>\n</body>\n</html>\n`;
// The headers of an Express error page, with the CORS of the routes after cors()
const pageHeaders = (cors) => ({
    ...(cors && {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "Payment-Required,Payment-Response",
    }),
    "content-security-policy": "default-src 'none'",
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-legacy-path": "worker",
    "x-powered-by": "Express",
});
// What the cache code adds to a chunked response below 401
const CACHE_MISS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
        "Content-Type, X-Turnstile-Token, Payment-Signature, X-PAYMENT",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "x-cache": "MISS",
    "x-cache-key": expect.stringMatching(/^[0-9a-f]{64}$/),
};

test("an invalid messages array gets the route's JSON 400", async () => {
    const { response, text } = await call("/", {
        method: "POST",
        headers: JSON_BODY,
        body: JSON.stringify({ messages: "hi" }),
    });
    expect(response.status).toBe(400);
    expect(text).toBe('{"error":"Invalid messages array"}');
});

test("bad bodies, malformed % and unknown routes get Express's HTML error page with the error line", async () => {
    const cases = [
        // body-parser ran before cors(): no CORS headers. The VM's chunked
        // 400 pages got the cache code's headers, as in the live captures.
        [
            { method: "POST", headers: JSON_BODY, body: "{bad" },
            "/",
            400,
            "SyntaxError: Expected property name or &#39;}&#39; in JSON at position 1 (line 1 column 2)",
            false,
        ],
        [
            { method: "POST", headers: JSON_BODY, body: " " },
            "/",
            400,
            "SyntaxError: Unexpected end of JSON input",
            false,
        ],
        [
            { method: "POST", headers: JSON_BODY, body: '"pr7e2e-r1"' },
            "/v1/chat/completions",
            400,
            "SyntaxError: Unexpected token &#39;&quot;&#39;, &quot;&quot;pr7e2e-r1&quot;&quot; is not valid JSON",
            false,
        ],
        [
            // The message quotes the body, line breaks and double spaces
            // as finalhandler wrote them
            { method: "POST", headers: JSON_BODY, body: '{\n  "a": x\n}' },
            "/",
            400,
            "SyntaxError: Unexpected token &#39;x&#39;, &quot;{<br> &nbsp;&quot;a&quot;: x<br>}&quot; is not valid JSON",
            false,
        ],
        [
            // body-parser's "20mb" limit
            { method: "POST", headers: JSON_BODY, body: " ".repeat(20971521) },
            "/",
            413,
            "PayloadTooLargeError: request entity too large",
            false,
        ],
        // The router's errors came after cors()
        [
            {},
            "/pr7e2e-r1-bad%E0%A4-x",
            400,
            "URIError: Failed to decode param &#39;pr7e2e-r1-bad%E0%A4-x&#39;",
            true,
        ],
        [
            { method: "POST" },
            "/openai/pr7e2e-r1-bad%C3-x",
            400,
            "URIError: Failed to decode param &#39;/pr7e2e-r1-bad%C3-x&#39;",
            true,
        ],
        [{ method: "PUT" }, "/nothing", 404, "Cannot PUT /nothing", true],
        [
            { method: "DELETE" },
            "/it's%",
            404,
            "Cannot DELETE /it&#39;s%25",
            true,
        ],
    ];
    for (const [options, path, status, message, cors] of cases) {
        const gen = recordingGen();
        const { response, text } = await call(path, {
            ...options,
            testEnv: gen.testEnv,
        });
        const label = `${options.method ?? "GET"} ${path} ${options.body?.slice(0, 9) ?? ""}`;

        expect(response.status, label).toBe(status);
        expect(text, label).toBe(errorPage(message));
        // Chunked, without Content-Length; below 401 the cache code adds
        // its headers and stores the page, as it did the VM's
        expect(Object.fromEntries(response.headers), label).toEqual({
            ...pageHeaders(cors),
            ...(status < 401 && CACHE_MISS),
        });
        expect(gen.bodies, label).toHaveLength(0);
    }
});

test("a blocked /24 gets an empty 403 without CORS, but cache hits are still served", async () => {
    await call("/stored%20before%20the%20block");
    const blocked = "192.42.116.7";

    const hit = await call("/stored%20before%20the%20block", { ip: blocked });
    expect(hit.response.headers.get("x-cache")).toBe("HIT");

    const miss = await call("/after%20the%20block", { ip: blocked });
    expect(miss.response.status).toBe(403);
    expect(miss.text).toBe("");
    expect(miss.response.headers.get("access-control-allow-origin")).toBeNull();
});

test("a request line plus headers over 16 KB gets Node's empty 431, but a stored answer is still served", async () => {
    const filler = { "x-filler": "a".repeat(17_000) };
    await call("/long%20headers");
    const hit = await call("/long%20headers", { headers: filler });
    expect(hit.response.headers.get("x-cache")).toBe("HIT");

    const gen = recordingGen();
    const miss = await call("/long%20headers%20miss", {
        headers: filler,
        testEnv: gen.testEnv,
    });

    expect(miss.response.status).toBe(431);
    expect(miss.text).toBe("");
    expect(miss.response.headers.get("x-powered-by")).toBeNull();
    expect(gen.bodies).toHaveLength(0);
    expect(await storedAt("/long%20headers%20miss")).toBeNull();
});

test("while a free generation runs, a stream from the same IP gets the VM's 429", async () => {
    const ip = nextIp();
    const running = call("/gen:slow", { ip });
    await expect.poll(() => alarmOf(ip)).toBeGreaterThan(Date.now() + 30_000);

    const stream = await call("/meanwhile?stream=true", { ip });

    expect(stream.response.status).toBe(429);
    expect(JSON.parse(stream.text)).toEqual({
        error: `Queue full for IP: ${ip}: 1 requests already queued (max: 1). Get unlimited access at https://enter.pollinations.ai`,
        status: 429,
        deprecation_notice: NOTICE,
    });
    expect((await running).text).toBe("ok");
});

test("a stream that waits for the slot holds the IP, so a second waiter gets 429", async () => {
    const ip = nextIp();
    // The last free generation started 29.8 s ago and has ended
    await runInDurableObject(env.IP_SLOT.getByName(ip), (_slot, state) =>
        state.storage.setAlarm(Date.now() + 200),
    );

    const waiting = call("/first%20waiter?stream=true", { ip });
    await expect.poll(() => alarmOf(ip)).toBeGreaterThan(Date.now() + 30_000);
    const second = await call("/second%20waiter?stream=true", { ip });

    expect(second.response.status).toBe(429);
    const first = await waiting;
    expect(first.response.status).toBe(200);
    expect(first.text).toBe(SSE_UNTIL_DONE);
});

test("the IP is released when the response completes, fails or is cancelled", async () => {
    const completed = nextIp();
    await call("/released%20after%20success", { ip: completed });
    expect(await released(completed)).toBe(true);

    const failed = nextIp();
    expect((await call("/gen:500", { ip: failed })).response.status).toBe(500);
    expect(await released(failed)).toBe(true);

    const cancelled = nextIp();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://text.pollinations.ai/cancelled?stream=true", {
            headers: { "cf-connecting-ip": cancelled },
        }),
        env,
        ctx,
    );
    const reader = response.body.getReader();
    await reader.read();
    await reader.cancel();
    await waitOnExecutionContext(ctx);
    expect(await released(cancelled)).toBe(true);
});

test("a stream frees the IP once gen answers, and a client that leaves cancels gen", async () => {
    const ip = nextIp();
    let cancelled = false;
    // gen's stream, recording whether origin() cancels it
    const testEnv = {
        ...env,
        GEN: {
            fetch: async (url, init) => {
                const response = await env.GEN.fetch(url, init);
                const reader = response.body.getReader();
                const body = new ReadableStream({
                    async pull(controller) {
                        const { done, value } = await reader.read();
                        // The runtime rejects a read pending on a cancel, so
                        // gen's stream is cancelled after its next chunk
                        if (cancelled) return reader.cancel();
                        if (done) controller.close();
                        else controller.enqueue(value);
                    },
                    cancel() {
                        cancelled = true;
                    },
                });
                return new Response(body, response);
            },
        },
    };
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://text.pollinations.ai/gen:long?stream=true", {
            headers: { "cf-connecting-ip": ip },
        }),
        testEnv,
        ctx,
    );

    const reader = response.body.getReader();
    await reader.read();
    try {
        // The VM's queue job ended when the stream started; gen:long sends
        // its next chunk only after a second
        await expect.poll(() => released(ip), { timeout: 500 }).toBe(true);
    } finally {
        await reader.cancel();
    }
    await expect.poll(() => cancelled, { timeout: 500 }).toBe(true);
    await waitOnExecutionContext(ctx);
});

test("a limiter failure is answered as a free request, booking and releasing nothing", async () => {
    const gen = recordingGen();
    const calls = [];
    const failing = {
        getByName: () => ({
            take: async () => {
                calls.push("take");
                throw new Error("IpSlot RPC failed");
            },
            release: async () => calls.push("release"),
        }),
    };

    const { response, text } = await call("/limiter%20down", {
        testEnv: { ...gen.testEnv, IP_SLOT: failing },
    });

    expect(response.status).toBe(200);
    expect(text).toBe("ok");
    expect(response.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
    );
    expect(gen.bodies).toHaveLength(1);
    expect(calls).toEqual(["take"]);
});

test("a HEAD miss is not stored, so the next GET returns the full text", async () => {
    const head = await call("/head%20then%20get", { method: "HEAD" });
    expect(head.response.status).toBe(200);
    // Express answered HEAD through its OpenAI JSON branch
    expect(head.response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
    );
    expect(await storedAt("/head%20then%20get")).toBeNull();

    expect((await call("/head%20then%20get")).text).toBe("ok");
    const hit = await call("/head%20then%20get");
    expect(hit.response.headers.get("x-cache")).toBe("HIT");
    expect(hit.text).toBe("ok");
});

test("ADAPTER_SHARE 0 sends every generating path to the VM", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
            new Response("from the vm", {
                headers: { "content-length": "11" },
            }),
    );
    const testEnv = { ...env, ADAPTER_SHARE: "0" };

    for (const [path, options, stored] of [
        ["/to%20the%20vm", {}, true],
        ["/preflight%20to%20the%20vm", { method: "OPTIONS" }, true],
        // POST /openai/models generates on the VM ("/openai*"), uncached
        ["/openai/models", { method: "POST", headers: JSON_BODY, body: "{}" }],
        ["/paid%20on%20the%20vm", { headers: { "payment-signature": "x" } }],
    ]) {
        const { response, text } = await call(path, { ...options, testEnv });
        const label = `${options.method ?? "GET"} ${path}`;

        expect(text, label).toBe("from the vm");
        expect(response.headers.get("x-legacy-path"), label).toBe("vm");
        expect((await storedAt(path, options.method)) !== null, label).toBe(
            Boolean(stored),
        );
    }
});

test("an exception on a miss path is the Worker's 500, labelled with the path", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("tunnel down"));
    const onVm = await call("/tunnel%20down", {
        testEnv: { ...env, ADAPTER_SHARE: "0" },
    });
    expect(onVm.response.status).toBe(500);
    expect(onVm.text).toBe("Worker error: tunnel down");
    expect(onVm.response.headers.get("x-error")).toBe("tunnel down");
    expect(onVm.response.headers.get("x-legacy-path")).toBe("vm");
});
