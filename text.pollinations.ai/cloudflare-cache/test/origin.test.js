import {
    createExecutionContext,
    env,
    runInDurableObject,
    waitOnExecutionContext,
} from "cloudflare:test";
import { Buffer } from "node:buffer";
import { deflateSync, gzipSync } from "node:zlib";
import { expect, test, vi } from "vitest";
import worker from "../src/index.js";
import feedHeaders from "./fixtures/text.pollinations.ai-feed.headers?raw";
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

    // An error object in gen's 200 answers its status, else 500
    const inOk = await call("/gen:200-error");
    expect(inOk.response.status).toBe(503);
    expect(JSON.parse(inOk.text)).toEqual({
        error: "boom",
        status: 503,
        deprecation_notice: NOTICE,
    });
    const textError = await call("/gen:200-error-text");
    expect(textError.response.status).toBe(500);
    expect(JSON.parse(textError.text).error).toBe("oops");

    const stream = await call("/gen:400?stream=true");
    expect(stream.response.status).toBe(500);
    expect(JSON.parse(stream.text)).toEqual({
        error: "400 Bad Request",
        status: 500,
        deprecation_notice: NOTICE,
    });
    expect(await storedAt("/gen:400?stream=true")).toBeNull();
});

test("the VM's other routes: redirect, models, crossdomain and feed", async () => {
    const root = await call("/");
    expect(root.response.status).toBe(301);
    // Every header of the live redirect, X-Powered-By: Express included
    const vm = Object.fromEntries(capturedHeaders(vmRootRedirect));
    expect(Object.fromEntries(root.response.headers)).toEqual(vm);
    // HEAD / takes the cache path and its split
    const head = await call("/", { method: "HEAD" });
    expect(Object.fromEntries(head.response.headers)).toEqual({
        ...vm,
        "x-legacy-path": "worker",
    });
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
});

test("the public feed gets each public generation as the VM sent it, and nothing private", async () => {
    const ctx = createExecutionContext();
    const listener = await worker.fetch(
        new Request("https://text.pollinations.ai/feed?password=x"),
        env,
        ctx,
    );
    // Every header of the live feed
    expect(Object.fromEntries(listener.headers)).toEqual(
        Object.fromEntries(capturedHeaders(feedHeaders)),
    );
    const events = listener.body.getReader();
    const next = async () => {
        const value = new TextDecoder().decode((await events.read()).value);
        expect(value).toMatch(/^data: .*\n\n$/s);
        return JSON.parse(value.slice("data: ".length));
    };

    // Private requests reach no public listener
    await call("/v1/chat/completions", {
        method: "POST",
        headers: JSON_BODY,
        body: JSON.stringify({ messages: [{ role: "user", content: "p1" }] }),
    });
    await call("/openai/p2", { method: "POST" });
    await call("/openai-p3");
    await call("/p4?private=true");

    await call("/feed%20me?seed=7&temperature=9&referrer=app");
    expect(await next()).toEqual({
        response: "ok",
        parameters: {
            messages: [{ role: "user", content: "feed me" }],
            jsonMode: false,
            seed: 7,
            model: "openai-fast",
            // getRequestData's value, before the clamp
            temperature: 9,
            referrer: "app",
            isPrivate: false,
            voice: "alloy",
            prompt_tokens: 322,
            completion_tokens: 46,
            total_tokens: 368,
            completion_tokens_details: { reasoning_tokens: 10 },
        },
    });

    // A stream is announced when gen starts answering, without usage
    await call("/", {
        method: "POST",
        headers: { ...JSON_BODY, origin: "https://app.example" },
        body: JSON.stringify({
            messages: [{ role: "user", content: "s" }],
            stream: true,
            json: "true",
        }),
    });
    expect(await next()).toEqual({
        response: "Streaming response",
        parameters: {
            messages: [{ role: "user", content: "s" }],
            jsonMode: true,
            model: "openai-fast",
            referrer: "https://app.example",
            stream: true,
            isPrivate: false,
            voice: "alloy",
        },
    });

    // A listener that leaves is dropped at the next event
    await events.cancel();
    await waitOnExecutionContext(ctx);
    await call("/after%20leaving");
    await expect
        .poll(() =>
            runInDurableObject(
                env.FEED_HUB.getByName("text"),
                (hub) => hub.writers.size,
            ),
        )
        .toBe(0);

    // The VM never answered a HEAD
    const head = await call("/feed", { method: "HEAD" });
    expect(head.response.status).toBe(200);
    expect(head.text).toBe("");
});

test("a matching If-None-Match gets Express's empty 304, after the generation has run", async () => {
    const etag = 'W/"11e-Fd6JEDDMrK3a9OtoxYkMHKWn4Ng"';
    // The live 304 of 2026-10-12, without the edge's headers
    const live = {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "Payment-Required,Payment-Response",
        etag,
        "x-powered-by": "Express",
    };
    for (const noneMatch of [
        etag,
        "*",
        '"11e-Fd6JEDDMrK3a9OtoxYkMHKWn4Ng"',
        `W/"other",  ${etag}`,
    ]) {
        const { response, text } = await call("/models", {
            headers: { "if-none-match": noneMatch },
        });
        expect(response.status, noneMatch).toBe(304);
        expect(text, noneMatch).toBe("");
        expect(Object.fromEntries(response.headers), noneMatch).toEqual(live);
    }
    // fresh() fails on no-cache, on If-Modified-Since and on another tag
    for (const headers of [
        { "if-none-match": "*", "cache-control": "max-age=0, no-cache" },
        {
            "if-none-match": "*",
            "if-modified-since": "Mon, 12 Oct 2026 00:00:00 GMT",
        },
        { "if-none-match": 'W/"other"' },
    ]) {
        const { response } = await call("/models", { headers });
        expect(response.status, JSON.stringify(headers)).toBe(200);
    }

    // A generation runs and bills first; the 304 is not stored
    const gen = recordingGen();
    const { response, text } = await call("/if%20none%20match", {
        headers: { "if-none-match": "*" },
        testEnv: gen.testEnv,
    });
    expect(response.status).toBe(304);
    expect(text).toBe("");
    expect(gen.bodies).toHaveLength(1);
    // As the live 304 of a generation, which reached the cache code
    // without Content-Length (its ETag is that of "ok")
    expect(Object.fromEntries(response.headers)).toEqual({
        ...CACHE_MISS,
        "access-control-expose-headers": "Payment-Required,Payment-Response",
        "cache-control": "public, max-age=31536000, immutable",
        etag: 'W/"2-eoX0dku9ba8cNUXvu/DyeabcC+s"',
        "x-legacy-path": "worker",
        "x-model-used": "gpt-oss-20b",
        "x-powered-by": "Express",
        "x-usage-completion-reasoning-tokens": "10",
        "x-usage-completion-text-tokens": "36",
        "x-usage-prompt-text-tokens": "322",
        "x-usage-total-tokens": "368",
    });
    expect(await storedAt("/if%20none%20match")).toBeNull();

    const head = await call("/if%20none%20match%20head", {
        method: "HEAD",
        headers: { "if-none-match": "*" },
    });
    expect(head.response.status).toBe(304);
    // res.send's check covered GET and HEAD only, and not streams
    const post = await call("/", {
        method: "POST",
        headers: { ...JSON_BODY, "if-none-match": "*" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    expect(post.response.status).toBe(200);
    const stream = await call("/if%20none%20match?stream=true", {
        headers: { "if-none-match": "*" },
    });
    expect(stream.response.status).toBe(200);
    expect(stream.text).toBe(SSE_UNTIL_DONE);
});

test("a preflight gets the live 204: cors() headers plus the cache code's, and nothing is stored", async () => {
    // The live captures of 2026-10-12, without the edge's headers
    const live = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
        "access-control-expose-headers":
            "Payment-Required, Payment-Response, Link, X-Pollinations-Logo, X-Powered-By",
        link: '<https://pollinations.ai>; rel="service"',
        vary: "Access-Control-Request-Headers",
        "x-cache": "MISS",
        "x-cache-key": expect.stringMatching(/^[0-9a-f]{64}$/),
        "x-legacy-path": "worker",
        "x-pollinations-logo":
            "https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/lockup-horizontal-black.svg",
        "x-powered-by": "Pollinations.AI",
    };
    for (const [path, requested, allowed] of [
        ["/preflight%20reqh", "content-type,x-foo", "content-type,x-foo"],
        // The cache code's default when none are requested
        [
            "/preflight%20noreqh",
            null,
            "Content-Type, X-Turnstile-Token, Payment-Signature, X-PAYMENT",
        ],
    ]) {
        const { response, text } = await call(path, {
            method: "OPTIONS",
            headers: {
                origin: "https://example.com",
                "access-control-request-method": "POST",
                ...(requested && {
                    "access-control-request-headers": requested,
                }),
            },
        });

        expect(response.status, path).toBe(204);
        expect(text, path).toBe("");
        expect(Object.fromEntries(response.headers), path).toEqual({
            ...live,
            "access-control-allow-headers": allowed,
        });
        expect(await storedAt(path, "OPTIONS"), path).toBeNull();
    }
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

test("bodies are decoded as body-parser 1.20.3 did: encoding, charset, media type", async () => {
    // Expected answers from the VM's own body-parser on the same bytes. Each
    // body differs: the cache code stores 400s under a key of the body.
    const messages = (content) =>
        JSON.stringify({ messages: [{ role: "user", content }] });
    const json = "application/json";
    const cases = [
        [
            "gzip",
            { "content-encoding": "gzip" },
            gzipSync(messages("gz")),
            "gz",
        ],
        [
            "deflate",
            { "content-encoding": "DEFLATE" },
            deflateSync(messages("df")),
            "df",
        ],
        [
            "utf-16le",
            { "content-type": `${json}; charset=utf-16le` },
            Buffer.from(messages("é"), "utf16le"),
            "é",
        ],
        [
            "utf-8 BOM",
            {},
            Buffer.concat([
                Buffer.from([0xef, 0xbb, 0xbf]),
                Buffer.from(messages("bom")),
            ]),
            "bom",
        ],
        [
            "upper case type",
            { "content-type": "APPLICATION/JSON" },
            messages("up"),
            "up",
        ],
        // Media types type-is did not read as application/json: body ignored
        ["trailing ;", { "content-type": `${json};` }, messages("x1"), 400],
        [
            "charset then ;",
            { "content-type": `${json}; charset=utf-8;` },
            messages("x2"),
            400,
        ],
        [
            "+json suffix",
            { "content-type": "application/merge-patch+json" },
            messages("x3"),
            400,
        ],
        [
            "bad gzip",
            { "content-encoding": "gzip" },
            messages("x4"),
            [400, "Error: incorrect header check"],
        ],
        [
            "br",
            { "content-encoding": "br" },
            messages("x5"),
            [
                415,
                "UnsupportedMediaTypeError: unsupported content encoding &quot;br&quot;",
            ],
        ],
        [
            "latin1",
            { "content-type": `${json}; charset=iso-8859-1` },
            messages("x6"),
            [
                415,
                "UnsupportedMediaTypeError: unsupported charset &quot;ISO-8859-1&quot;",
            ],
        ],
        [
            "UTF8 without a dash",
            { "content-type": `${json}; charset=UTF8` },
            messages("x7"),
            [
                415,
                "UnsupportedMediaTypeError: unsupported charset &quot;UTF8&quot;",
            ],
        ],
        [
            "utf-9",
            { "content-type": `${json}; charset=utf-9` },
            messages("x8"),
            [
                415,
                "UnsupportedMediaTypeError: unsupported charset &quot;UTF-9&quot;",
            ],
        ],
        // The charset is checked before the encoding
        [
            "latin1 and br",
            {
                "content-type": `${json}; charset=latin1`,
                "content-encoding": "br",
            },
            "{}",
            [
                415,
                "UnsupportedMediaTypeError: unsupported charset &quot;LATIN1&quot;",
            ],
        ],
        // The 20 MB limit applies to the inflated body
        [
            "gzip over 20 MB",
            { "content-encoding": "gzip" },
            gzipSync(" ".repeat(21 * 1024 * 1024)),
            [413, "PayloadTooLargeError: request entity too large"],
        ],
    ];
    for (const [label, headers, body, expected] of cases) {
        const gen = recordingGen();
        const { response, text } = await call("/", {
            method: "POST",
            headers: { "content-type": json, ...headers },
            body,
            testEnv: gen.testEnv,
        });
        if (typeof expected === "string") {
            expect(response.status, label).toBe(200);
            expect(gen.bodies[0].messages.at(-1).content, label).toBe(expected);
        } else if (expected === 400) {
            expect(response.status, label).toBe(400);
            expect(text, label).toBe('{"error":"Invalid messages array"}');
        } else {
            expect(response.status, label).toBe(expected[0]);
            expect(text, label).toBe(errorPage(expected[1]));
            expect(gen.bodies, label).toHaveLength(0);
        }
    }
});

test("non-array messages get the VM's 500, whose error log failed on messages.map", async () => {
    const vm = JSON.stringify({
        error: "messages.map is not a function",
        status: 500,
        deprecation_notice: NOTICE,
    });
    for (const [path, options] of [
        [
            "/v1/chat/completions",
            {
                method: "POST",
                headers: JSON_BODY,
                body: JSON.stringify({ messages: "pr7e2e" }),
            },
        ],
        [
            "/openai",
            {
                method: "POST",
                headers: JSON_BODY,
                body: JSON.stringify({ messages: { role: "user" } }),
            },
        ],
        ["/x?messages=foo", {}],
        ["/x?messages=foo&stream=true", {}],
    ]) {
        const { response, text } = await call(path, options);

        expect(response.status, path).toBe(500);
        expect(text, path).toBe(vm);
        // The ETag of the live capture of 2026-10-12
        expect(response.headers.get("etag"), path).toBe(
            'W/"14b-2vuwa+PS53/bu4pTjJqib/XYw+M"',
        );
    }
});

test("non-array messages with a system prompt, which crashed the VM, get Express's 500 page and no generation", async () => {
    for (const [path, options] of [
        ["/x?system=hi&messages=foo", {}],
        [
            "/v1/chat/completions?system=hi",
            {
                method: "POST",
                headers: JSON_BODY,
                body: JSON.stringify({ messages: "x" }),
            },
        ],
    ]) {
        const gen = recordingGen();
        const ip = nextIp();
        const { response, text } = await call(path, {
            ...options,
            ip,
            testEnv: gen.testEnv,
        });

        expect(response.status, path).toBe(500);
        expect(text, path).toBe(
            errorPage("TypeError: messages.unshift is not a function"),
        );
        expect(Object.fromEntries(response.headers), path).toEqual(
            pageHeaders(true),
        );
        expect(gen.bodies, path).toHaveLength(0);
        // Parameters are read before the free slot is taken
        expect(await alarmOf(ip), path).toBeNull();
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

test("a head over 16 KB gets Node's empty chunked 431, but a stored answer is still served", async () => {
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
    // An empty body without Content-Length, sent chunked as the VM's was
    expect(miss.response.body).not.toBeNull();
    expect(Object.fromEntries(miss.response.headers)).toEqual({
        "x-legacy-path": "worker",
    });
    expect(gen.bodies).toHaveLength(0);
    expect(await storedAt("/long%20headers%20miss")).toBeNull();
});

test("the 431 starts where it did for the production measurement of GET /models", async () => {
    // The headers that request had at the Worker: curl's, the fillers and
    // the edge's
    // An IPv4 address as long as the one measured from
    const ip = "203.0.113.4";
    const headers = (filler) => ({
        "user-agent": "curl/8.7.1",
        accept: "*/*",
        "x-filler-a": "a".repeat(8000),
        "x-filler-b": "b".repeat(filler),
        "accept-encoding": "br, gzip",
        "cf-ipcountry": "DE",
        "cf-ray": "a492358f6dd5e506",
        "cf-visitor": '{"scheme":"https"}',
        connection: "Keep-Alive",
        "x-forwarded-proto": "https",
        "x-real-ip": ip,
    });

    const below = await call("/models", { ip, headers: headers(7975) });
    expect(below.response.status).toBe(200);
    const at = await call("/models", { ip, headers: headers(7976) });
    expect(at.response.status).toBe(431);
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
    // Below 100 the feed is the VM's, which has most events
    const feed = await call("/feed", {
        testEnv: { ...env, ADAPTER_SHARE: "99" },
    });
    expect(feed.text).toBe("from the vm");
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
