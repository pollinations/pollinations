import assert from "node:assert/strict";
import test from "node:test";

process.env.POLLINATIONS_API_KEY = "sk_test";

const { audioTools } = await import("./src/services/audioService.js");
const { imageTools } = await import("./src/services/imageService.js");

const handlers = Object.fromEntries(
    [...audioTools, ...imageTools].map(([name, , , handler]) => [
        name,
        handler,
    ]),
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
        output: "url",
    });

    assert.equal(request.options.method, "GET");
    assert.equal(request.options.headers.Authorization, "Bearer sk_test");
    assert.doesNotMatch(request.url, /output=/);
    assert.match(result.content[0].text, /model=flux/);
});

test("generateImage URL output does not buffer the media response", async () => {
    let arrayBufferCalls = 0;
    global.fetch = async () => {
        const response = new Response(null, {
            status: 200,
            headers: { "Content-Type": "image/png" },
        });
        response.arrayBuffer = async () => {
            arrayBufferCalls++;
            return new ArrayBuffer();
        };
        return response;
    };

    await handlers.generateImage({ prompt: "red square", output: "url" });

    assert.equal(arrayBufferCalls, 0);
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
    });

    assert.equal(request.url, "https://gen.pollinations.ai/v1/audio/speech");
    assert.deepEqual(JSON.parse(request.options.body), {
        input: "hello",
        voice: "nova",
        response_format: "mp3",
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
    });

    assert.equal(
        requests[1].url,
        "https://gen.pollinations.ai/v1/audio/transcriptions",
    );
    assert.equal(requests[1].options.body.get("model"), "whisper-large-v3");
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
