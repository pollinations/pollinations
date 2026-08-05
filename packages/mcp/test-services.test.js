import assert from "node:assert/strict";
import test from "node:test";

process.env.POLLINATIONS_API_KEY = "sk_test";

const { audioTools } = await import("./src/services/audioService.js");
const { accountTools } = await import("./src/services/accountService.js");
const { imageTools } = await import("./src/services/imageService.js");
const { textTools } = await import("./src/services/textService.js");

const handlers = Object.fromEntries(
    [...audioTools, ...accountTools, ...imageTools, ...textTools].map(
        ([name, , , handler]) => [name, handler],
    ),
);
const originalFetch = global.fetch;

test.afterEach(() => {
    global.fetch = originalFetch;
});

test("generateImage returns URL without forwarding output", async () => {
    let request;
    global.fetch = async (url, options) => {
        request = { url: String(url), options };
        return new Response(null, {
            status: 200,
            headers: { "Content-Type": "image/png" },
        });
    };

    const result = await handlers.generateImage({
        prompt: "red square",
        model: "flux",
        new_server_parameter: "preserved",
        output: "url",
    });

    assert.equal(request.options.method, "GET");
    assert.equal(request.options.headers.Authorization, "Bearer sk_test");
    assert.doesNotMatch(request.url, /output=/);
    assert.match(result.content[0].text, /model=flux/);
    assert.match(request.url, /new_server_parameter=preserved/);
});

test("generateImage URL output cancels rather than buffering the response", async () => {
    let arrayBufferCalls = 0;
    let cancelCalls = 0;
    global.fetch = async () => {
        return {
            ok: true,
            headers: new Headers({ "Content-Type": "image/png" }),
            body: {
                cancel: async () => {
                    cancelCalls++;
                },
            },
            arrayBuffer: async () => {
                arrayBufferCalls++;
                return new ArrayBuffer();
            },
        };
    };

    await handlers.generateImage({ prompt: "red square", output: "url" });

    assert.equal(arrayBufferCalls, 0);
    assert.equal(cancelCalls, 1);
});

test("generateImage returns inline image content", async () => {
    global.fetch = async () =>
        new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "Content-Type": "image/png" },
        });

    const result = await handlers.generateImage({
        prompt: "red square",
        model: "flux",
        output: "inline",
    });

    assert.deepEqual(result.content[0], {
        type: "image",
        data: "AQID",
        mimeType: "image/png",
    });
});

test("generateVideo supports URL and inline outputs", async () => {
    const methods = [];
    global.fetch = async (_url, options) => {
        methods.push(options.method);
        return new Response(new Uint8Array([0, 0, 0, 0]), {
            status: 200,
            headers: { "Content-Type": "video/mp4" },
        });
    };

    const url = await handlers.generateVideo({
        prompt: "moving square",
        model: "wan-fast",
        output: "url",
    });
    const inline = await handlers.generateVideo({
        prompt: "moving square",
        model: "wan-fast",
        output: "inline",
    });

    assert.deepEqual(methods, ["GET", "GET"]);
    assert.match(url.content[0].text, /model=wan-fast/);
    assert.equal(inline.content[0].resource.mimeType, "video/mp4");
    assert.equal(inline.content[0].resource.uri, url.content[0].text);
});

test("media tools reject the wrong response modality", async () => {
    global.fetch = async () =>
        new Response(new Uint8Array([1]), {
            status: 200,
            headers: { "Content-Type": "image/jpeg" },
        });

    await assert.rejects(
        handlers.generateVideo({
            prompt: "moving square",
            model: "wan-fast",
            output: "inline",
        }),
        /Expected video response, received image\/jpeg/,
    );
});

test("textToSpeech calls the OpenAI-compatible speech endpoint", async () => {
    let request;
    global.fetch = async (url, options) => {
        request = { url: String(url), options };
        return new Response(new Uint8Array([4, 5, 6]), {
            status: 200,
            headers: { "Content-Type": "audio/mpeg" },
        });
    };

    const result = await handlers.textToSpeech({
        input: "hello",
        voice: "nova",
        response_format: "mp3",
        new_server_parameter: "preserved",
    });

    assert.equal(request.url, "https://gen.pollinations.ai/v1/audio/speech");
    assert.deepEqual(JSON.parse(request.options.body), {
        input: "hello",
        voice: "nova",
        response_format: "mp3",
        new_server_parameter: "preserved",
    });
    assert.equal(result.content[0].type, "audio");
});

test("transcribeAudio forwards multipart audio to Gen", async () => {
    const requests = [];
    global.fetch = async (url, options) => {
        requests.push({ url: String(url), options });
        if (requests.length === 1) {
            return new Response(new Uint8Array([7, 8, 9]), {
                status: 200,
                headers: {
                    "Content-Type": "audio/flac",
                    "Content-Length": "3",
                },
            });
        }
        return Response.json({ text: "test transcript" });
    };

    const result = await handlers.transcribeAudio({
        audioUrl: "https://8.8.8.8/test.flac",
        model: "whisper-large-v3",
        new_server_parameter: "preserved",
    });

    assert.equal(
        requests[1].url,
        "https://gen.pollinations.ai/v1/audio/transcriptions",
    );
    assert.equal(requests[1].options.body.get("model"), "whisper-large-v3");
    assert.equal(
        requests[1].options.body.get("new_server_parameter"),
        "preserved",
    );
    assert.equal(requests[1].options.body.get("file").name, "test.flac");
    assert.deepEqual(JSON.parse(result.content[0].text), {
        text: "test transcript",
    });
});

test("transcribeAudio rejects local URLs", async () => {
    await assert.rejects(
        handlers.transcribeAudio({ audioUrl: "https://localhost/test.mp3" }),
        /public host/,
    );
});

test("transcribeAudio rejects IPv4-mapped IPv6 private URLs", async () => {
    await assert.rejects(
        handlers.transcribeAudio({
            audioUrl: "https://[::ffff:127.0.0.1]/test.mp3",
        }),
        /private address/,
    );
});

test("transcribeAudio rejects redirects before forwarding audio", async () => {
    let request;
    global.fetch = async (url, options) => {
        request = { url: String(url), options };
        return new Response(null, { status: 302 });
    };

    await assert.rejects(
        handlers.transcribeAudio({ audioUrl: "https://8.8.8.8/test.mp3" }),
        /Failed to download audio \(302\)/,
    );
    assert.equal(request.options.redirect, "error");
});

test("transcribeAudio rejects declared files over 25 MiB", async () => {
    global.fetch = async () =>
        new Response(new Uint8Array([1]), {
            headers: { "Content-Length": String(25 * 1024 * 1024 + 1) },
        });

    await assert.rejects(
        handlers.transcribeAudio({ audioUrl: "https://8.8.8.8/test.mp3" }),
        /25 MiB limit/,
    );
});

test("chatCompletion forwards one unchanged request and raw response", async () => {
    const upstream = {
        id: "chatcmpl_test",
        choices: [
            { index: 0, message: { role: "assistant", content: "first" } },
            { index: 1, message: { role: "assistant", content: "second" } },
        ],
        provider_extension: { preserved: true },
    };
    const requests = [];
    global.fetch = async (url, options) => {
        requests.push({ url: String(url), options });
        return Response.json(upstream);
    };
    const input = {
        messages: [{ role: "user", content: "hello" }],
        model: "openai",
        new_server_parameter: { preserved: true },
    };

    const result = await handlers.chatCompletion(input);

    assert.equal(requests.length, 1);
    assert.equal(
        requests[0].url,
        "https://gen.pollinations.ai/v1/chat/completions",
    );
    assert.deepEqual(JSON.parse(requests[0].options.body), input);
    assert.deepEqual(JSON.parse(result.content[0].text), upstream);
});

test("listModels returns the complete registry response", async () => {
    const registry = [
        {
            name: "future-model",
            pricing: { currency: "pollen" },
            new_server_field: { preserved: true },
        },
    ];
    global.fetch = async () => Response.json(registry);

    const result = await handlers.listModels();

    assert.deepEqual(JSON.parse(result.content[0].text), registry);
});

test("account tools return raw responses and pass usage query parameters", async () => {
    const requests = [];
    global.fetch = async (url) => {
        requests.push(String(url));
        return Response.json({ server_field: "preserved" });
    };

    const balance = await handlers.getBalance();
    const usage = await handlers.getUsage({
        days: 2,
        cursor: "next",
    });
    const quests = await handlers.listQuests();

    assert.deepEqual(JSON.parse(balance.content[0].text), {
        server_field: "preserved",
    });
    assert.deepEqual(JSON.parse(usage.content[0].text), {
        server_field: "preserved",
    });
    assert.deepEqual(JSON.parse(quests.content[0].text), {
        server_field: "preserved",
    });
    assert.equal(requests[0], "https://gen.pollinations.ai/account/balance");
    assert.equal(
        requests[1],
        "https://gen.pollinations.ai/account/key/usage?days=2&cursor=next",
    );
    assert.equal(requests[2], "https://gen.pollinations.ai/account/quests");
});

test("upstream status and message are preserved without local policy", async () => {
    global.fetch = async () =>
        Response.json(
            { error: { message: "provider validation detail" } },
            { status: 422 },
        );

    await assert.rejects(
        handlers.chatCompletion({
            messages: [{ role: "user", content: "hello" }],
        }),
        /Request failed \(422\): provider validation detail/,
    );
});
