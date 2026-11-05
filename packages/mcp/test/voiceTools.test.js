import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
    audioTools,
    changeVoice,
    isolateVocals,
} from "../src/services/audioService.js";

const SOURCE = "https://cdn.example.com/song.mp4";
const CONTEXT = { http: { authInfo: { token: "sk_test" } } };

function tool(name) {
    const entry = audioTools.find(([toolName]) => toolName === name);
    assert.ok(entry, `missing tool ${name}`);
    return entry;
}

function mockFetch(t, handler) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input, init = {}) => {
        calls.push({ url: String(input), init });
        return handler(String(input), init);
    };
    return calls;
}

test("isolateVocals posts the source audio and returns the gateway link", async (t) => {
    const [, , shape, run] = tool("isolateVocals");
    const calls = mockFetch(t, (url) => {
        if (url === SOURCE) {
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { "Content-Type": "video/mp4" },
            });
        }
        assert.equal(
            url,
            "https://gen.pollinations.ai/v1/audio/voice-isolator",
        );
        return new Response(new Uint8Array([4, 5]), {
            headers: {
                "Content-Type": "audio/mpeg",
                Link: '<https://media.pollinations.ai/voice.mp3>; rel="enclosure"',
            },
        });
    });

    const args = z.object(shape).parse({
        source: SOURCE,
        model: "eleven-voice-isolator",
    });
    const result = await run(args, CONTEXT);

    assert.equal(calls.length, 2);
    assert.equal(calls[1].init.method, "POST");
    assert.equal(calls[1].init.headers.Authorization, "Bearer sk_test");
    assert.equal(calls[1].init.body.get("model"), "eleven-voice-isolator");
    assert.equal(calls[1].init.body.get("file").size, 3);
    assert.deepEqual(result.content[0], {
        type: "resource_link",
        uri: "https://media.pollinations.ai/voice.mp3",
        name: "Isolated vocals",
        mimeType: "audio/mpeg",
    });
});

test("changeVoice sends the target voice and falls back to an audio block", async (t) => {
    const [, , shape, run] = tool("changeVoice");
    const calls = mockFetch(t, (url) => {
        if (url === SOURCE) {
            return new Response(new Uint8Array([9]), {
                headers: { "Content-Type": "audio/mpeg" },
            });
        }
        assert.equal(url, "https://gen.pollinations.ai/v1/audio/voice-changer");
        // No Link header: the bytes must still reach the caller.
        return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "Content-Type": "audio/mpeg" },
        });
    });

    const args = z.object(shape).parse({
        source: SOURCE,
        voice: "alloy",
        response_format: "mp3",
    });
    const result = await run(args, CONTEXT);

    assert.equal(calls.length, 2);
    assert.equal(calls[1].init.body.get("voice"), "alloy");
    assert.equal(calls[1].init.body.get("response_format"), "mp3");
    assert.equal(result.content[0].type, "audio");
    assert.equal(result.content[0].mimeType, "audio/mpeg");
    assert.equal(atob(result.content[0].data), "\u0001\u0002\u0003");
    assert.deepEqual(JSON.parse(result.content[1].text), {
        mimeType: "audio/mpeg",
        sizeBytes: 3,
    });
});

test("rejects private audio URLs before fetching", async (t) => {
    const calls = mockFetch(t, () => new Response(new Uint8Array([1])));

    await assert.rejects(
        isolateVocals({ source: "https://127.0.0.1/song.mp4" }, CONTEXT),
        /public HTTPS URL/,
    );
    assert.equal(calls.length, 0);
});

test("requires an API key", async () => {
    await assert.rejects(
        changeVoice({ source: SOURCE, voice: "alloy" }, {}),
        /API key|Authorization|token/i,
    );
});
