import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { audioTools, transcribeAudio } from "../src/services/audioService.js";

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

test("transcribeAudio forwards response_format and returns srt as plain text", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === SOURCE) {
            return new Response(new Uint8Array([1]), {
                headers: { "Content-Type": "audio/mpeg" },
            });
        }
        return new Response("1\n00:00:00,000 --> 00:00:01,000\nHello\n", {
            headers: { "Content-Type": "text/plain" },
        });
    };

    const result = await transcribeAudio(
        { source: SOURCE, response_format: "srt", temperature: 0.2 },
        CONTEXT,
    );

    assert.equal(calls[1].init.body.get("response_format"), "srt");
    assert.equal(calls[1].init.body.get("temperature"), "0.2");
    assert.match(result.content[0].text, /Hello/);
});

test("transcribeAudio keeps diarized JSON that has no text field", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === SOURCE) {
            return new Response(new Uint8Array([1]), {
                headers: { "Content-Type": "audio/mpeg" },
            });
        }
        return Response.json({
            segments: [{ speaker: "A", text: "hi" }],
            speakers: ["A"],
        });
    };

    const result = await transcribeAudio(
        {
            source: SOURCE,
            response_format: "diarized_json",
            speakers_expected: 2,
        },
        CONTEXT,
    );

    assert.equal(calls[1].init.body.get("speakers_expected"), "2");
    assert.deepEqual(JSON.parse(result.content[0].text), {
        segments: [{ speaker: "A", text: "hi" }],
        speakers: ["A"],
    });
});
