import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
    fetchCatalogModels,
    getAudioGenerationEndpoint,
    sendAudioGenerationRequest,
} from "../src/hooks/useModelList";

afterEach(() => {
    vi.unstubAllGlobals();
});

test("Play audio catalog only contains text-to-audio models with supported routes", async () => {
    const catalogs = {
        "/image/models": [],
        "/text/models": [
            {
                id: "openai/gpt-audio-mini",
                input_modalities: ["text", "audio"],
                output_modalities: ["audio", "text"],
                supported_endpoints: ["/v1/chat/completions"],
            },
            {
                id: "openai/gpt-audio-1.5",
                input_modalities: ["text", "audio"],
                output_modalities: ["audio", "text"],
                supported_endpoints: ["/v1/chat/completions"],
            },
            {
                id: "openai/gpt-5-nano",
                input_modalities: ["text"],
                output_modalities: ["text"],
                supported_endpoints: ["/v1/chat/completions"],
            },
        ],
        "/audio/models": [
            {
                id: "openai/tts-1",
                input_modalities: ["text"],
                output_modalities: ["audio"],
                supported_endpoints: ["/audio/{text}", "/v1/audio/speech"],
            },
            {
                id: "openai/whisper-large-v3",
                input_modalities: ["audio"],
                output_modalities: ["text"],
                supported_endpoints: ["/v1/audio/transcriptions"],
            },
            {
                id: "elevenlabs/voice-isolator",
                input_modalities: ["audio"],
                output_modalities: ["audio"],
                supported_endpoints: ["/v1/audio/voice-isolator"],
            },
            {
                id: "audio/audio-input-speech-route",
                input_modalities: ["audio"],
                output_modalities: ["audio"],
                supported_endpoints: ["/v1/audio/speech"],
            },
            {
                id: "audio/unknown-route",
                input_modalities: ["text"],
                output_modalities: ["audio"],
                supported_endpoints: ["/alpha/audio/generations"],
            },
        ],
    };

    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            const models = catalogs[url.pathname as keyof typeof catalogs];
            return new Response(JSON.stringify(models));
        }),
    );

    const { audioModels, textModels } = await fetchCatalogModels();

    assert.deepEqual(
        audioModels.map((model) => model.id),
        ["openai/gpt-audio-mini", "openai/gpt-audio-1.5", "openai/tts-1"],
    );
    assert.deepEqual(
        textModels.map((model) => model.id),
        ["openai/gpt-5-nano"],
    );
    assert.equal(
        getAudioGenerationEndpoint(audioModels[0]),
        "/v1/chat/completions",
    );
    assert.equal(
        getAudioGenerationEndpoint(audioModels[1]),
        "/v1/chat/completions",
    );
    assert.equal(
        getAudioGenerationEndpoint(audioModels[2]),
        "/v1/audio/speech",
    );
    assert.equal(
        getAudioGenerationEndpoint({
            inputModalities: ["audio"],
            outputModalities: ["audio"],
            supportedEndpoints: ["/v1/audio/speech"],
        }),
        undefined,
    );

    const requests: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push({ url: String(input), init });
            return new Response(null, { status: 200 });
        }),
    );

    await sendAudioGenerationRequest(
        audioModels[0],
        "openai/gpt-audio-mini",
        "Say hello",
        "alloy",
        "pk_test",
    );
    await sendAudioGenerationRequest(
        audioModels[1],
        "openai/gpt-audio-1.5",
        "Say hello",
        "alloy",
        "pk_test",
    );
    await sendAudioGenerationRequest(
        audioModels[2],
        "openai/tts-1",
        "Say hello",
        "nova",
        "pk_test",
    );

    assert.deepEqual(
        requests.map(({ url }) => url),
        [
            "https://gen.pollinations.ai/v1/chat/completions",
            "https://gen.pollinations.ai/v1/chat/completions",
            "https://gen.pollinations.ai/v1/audio/speech",
        ],
    );
    assert.deepEqual(
        requests.map(({ init }) => init?.method),
        ["POST", "POST", "POST"],
    );
    assert.deepEqual(
        requests.map(({ init }) => JSON.parse(String(init?.body))),
        [
            {
                model: "openai/gpt-audio-mini",
                modalities: ["text", "audio"],
                audio: { voice: "alloy", format: "wav" },
                messages: [{ role: "user", content: "Say hello" }],
            },
            {
                model: "openai/gpt-audio-1.5",
                modalities: ["text", "audio"],
                audio: { voice: "alloy", format: "wav" },
                messages: [{ role: "user", content: "Say hello" }],
            },
            {
                model: "openai/tts-1",
                input: "Say hello",
                voice: "nova",
            },
        ],
    );
});
