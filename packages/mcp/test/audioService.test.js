import assert from "node:assert/strict";
import test from "node:test";
import { transcribeAudio } from "../src/services/audioService.js";

const SOURCE = "https://cdn.example.com/speech.mp3";
const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

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
            return Response.json({ text: "Hello from the recording." });
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

    assert.deepEqual(result, {
        content: [{ type: "text", text: "Hello from the recording." }],
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
