import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
    audioTools,
    changeVoice,
    isolateSpeech,
    transcribeAudio,
} from "../src/services/audioService.js";

const SOURCE = "https://cdn.example.com/speech.mp3";
const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

test("generateAudio forwards the emotion/style instruction to the API", async (t) => {
    const [, , shape, generateAudio] = audioTools.find(
        ([name]) => name === "generateAudio",
    );
    const originalFetch = globalThis.fetch;
    let capturedUrl;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input) => {
        capturedUrl = new URL(String(input));
        return new Response(null, {
            headers: {
                "Content-Type": "audio/mpeg",
                Link: '<https://media.pollinations.ai/abc.mp3>; rel="enclosure"',
            },
        });
    };

    // The MCP server validates arguments against the tool schema first.
    const args = z.object(shape).parse({
        text: "hello",
        model: "gemini-tts",
        instructions: "speak warmly",
    });
    await generateAudio(args, CONTEXT);

    assert.equal(capturedUrl.searchParams.get("instructions"), "speak warmly");
});

test("transcribes public audio through the Pollinations API", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === SOURCE) {
            // Workers throw on redirect: "error".
            assert.equal(init.redirect, "manual");
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: {
                    "Content-Type": "audio/mpeg",
                    "Content-Length": "3",
                },
            });
        }
        if (url.endsWith("/v1/audio/transcriptions")) {
            assert.equal(init.headers.Authorization, "Bearer sk_test");
            assert.equal(init.body.get("model"), "gpt-transcribe");
            assert.equal(init.body.get("language"), "en");
            assert.equal(init.body.get("file").size, 3);
            return Response.json({
                text: "Hello from the recording.",
                usage: { type: "duration", seconds: 12.5 },
            });
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await transcribeAudio(
        {
            source: SOURCE,
            model: "gpt-transcribe",
            language: "en",
        },
        CONTEXT,
    );

    assert.deepEqual(result.content[0], {
        type: "text",
        text: "Hello from the recording.",
    });
    // Preserve the gateway's metered duration as metadata, like generateText.
    assert.equal(result.content.length, 2);
    assert.equal(result.content[1].type, "text");
    assert.deepEqual(JSON.parse(result.content[1].text), {
        usage: { type: "duration", seconds: 12.5 },
    });
    assert.equal(calls.length, 2);
});

test("rejects private audio URLs before fetching", async (t) => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async () => {
        calls += 1;
        return new Response(new Uint8Array([1]));
    };

    await assert.rejects(
        transcribeAudio({ source: "https://127.0.0.1/audio.mp3" }, CONTEXT),
        /public HTTPS URL/,
    );
    assert.equal(calls, 0);
});

test("rejects redirecting audio URLs without following them", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input) => {
        calls.push(String(input));
        return new Response(null, {
            status: 302,
            headers: { Location: "https://127.0.0.1/audio.mp3" },
        });
    };

    await assert.rejects(
        transcribeAudio({ source: SOURCE }, CONTEXT),
        /redirects/,
    );
    assert.deepEqual(calls, [SOURCE]);
});

test("isolateSpeech posts the source audio and returns the gateway link", async (t) => {
    const [, , shape, run] = audioTools.find(
        ([name]) => name === "isolateSpeech",
    );
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === SOURCE) {
            assert.equal(init.redirect, "manual");
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { "Content-Type": "video/mp4" },
            });
        }
        assert.equal(
            url,
            "https://gen.pollinations.ai/v1/audio/voice-isolator",
        );
        assert.equal(init.method, "POST");
        assert.equal(init.headers.Authorization, "Bearer sk_test");
        return new Response(new Uint8Array([4, 5]), {
            headers: {
                "Content-Type": "audio/mpeg",
                Link: '<https://media.pollinations.ai/speech.mp3>; rel="enclosure"',
            },
        });
    };

    const args = z.object(shape).parse({
        source: SOURCE,
        model: "elevenlabs/voice-isolator",
    });
    const result = await run(args, CONTEXT);

    assert.equal(calls.length, 2);
    assert.equal(calls[1].init.body.get("file").size, 3);
    assert.equal(calls[1].init.body.get("model"), "elevenlabs/voice-isolator");
    assert.deepEqual(result.content[0], {
        type: "resource_link",
        uri: "https://media.pollinations.ai/speech.mp3",
        name: "Isolated speech",
        mimeType: "audio/mpeg",
    });
});

test("changeVoice sends the target voice and returns the gateway link", async (t) => {
    const [, , shape, run] = audioTools.find(
        ([name]) => name === "changeVoice",
    );
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === SOURCE) {
            return new Response(new Uint8Array([9]), {
                headers: { "Content-Type": "audio/mpeg" },
            });
        }
        assert.equal(url, "https://gen.pollinations.ai/v1/audio/voice-changer");
        return new Response(new Uint8Array([5, 6]), {
            headers: {
                "Content-Type": "audio/mpeg",
                Link: '<https://media.pollinations.ai/changed.mp3>; rel="enclosure"',
            },
        });
    };

    const args = z.object(shape).parse({
        source: SOURCE,
        voice: "alloy",
        response_format: "mp3",
    });
    const result = await run(args, CONTEXT);

    assert.equal(calls[1].init.body.get("voice"), "alloy");
    assert.equal(calls[1].init.body.get("response_format"), "mp3");
    assert.equal(
        result.content[0].uri,
        "https://media.pollinations.ai/changed.mp3",
    );
    assert.equal(result.content[0].name, "Voice-changed audio");
});

test("speech transforms fail when the gateway returns no stored link", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input) => {
        if (String(input) === SOURCE) {
            return new Response(new Uint8Array([1]), {
                headers: { "Content-Type": "audio/mpeg" },
            });
        }
        // The server never downloads media, so a missing link is an error.
        return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "Content-Type": "audio/mpeg" },
        });
    };

    await assert.rejects(
        isolateSpeech({ source: SOURCE }, CONTEXT),
        /no public file URL/,
    );
});

test("speech transforms require an API key", async () => {
    await assert.rejects(
        changeVoice({ source: SOURCE, voice: "alloy" }, {}),
        /API key|Authorization|token/i,
    );
});
