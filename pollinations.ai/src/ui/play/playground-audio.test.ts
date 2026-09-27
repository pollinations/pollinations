import { Pollinations } from "@pollinations/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    audioEndpoint,
    audioInputError,
    generatePlaygroundAudio,
} from "./playground-audio";

const client = new Pollinations({
    apiKey: "sk_test",
    baseUrl: "https://example.test",
});
const file = new File(["audio bytes"], "recording.wav", { type: "audio/wav" });
const model = (endpoint: string, inputs = ["audio"]) => ({
    id: "new-model-from-catalog",
    inputModalities: inputs,
    supportedEndpoints: [endpoint],
});
afterEach(() => vi.unstubAllGlobals());

describe("catalog-driven audio requests", () => {
    it("routes by endpoint, not a list of known model names", () => {
        expect(audioEndpoint(model("/v1/audio/voice-changer"))).toBe(
            "/v1/audio/voice-changer",
        );
        expect(audioEndpoint(model("/future/audio"))).toBeUndefined();
    });

    it("uploads a reference track and sends its URL with the prompt", async () => {
        const fetchRequest = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({
                    url: "https://media.pollinations.ai/reference",
                }),
            )
            .mockResolvedValueOnce(
                new Response("generated audio", {
                    headers: { "content-type": "audio/mpeg" },
                }),
            );
        vi.stubGlobal("fetch", fetchRequest);
        const result = await generatePlaygroundAudio(
            client,
            model("/v1/audio/speech", ["text", "audio"]),
            {
                prompt: "  a piano melody  ",
                file,
            },
        );
        const [uploadUrl, upload] = fetchRequest.mock.calls[0];
        expect(uploadUrl).toBe("https://media.pollinations.ai/upload");
        expect(await upload.body.get("file").text()).toBe("audio bytes");
        const [url, request] = fetchRequest.mock.calls[1];
        expect(url).toBe("https://example.test/v1/audio/speech");
        expect(JSON.parse(request.body)).toEqual({
            input: "a piano melody",
            model: "new-model-from-catalog",
            reference_audio: "https://media.pollinations.ai/reference",
        });
        expect(result.type).toBe("audio");
    });

    it.each([
        "/v1/audio/voice-changer",
        "/v1/audio/voice-isolator",
    ])("sends the file directly to %s with no prompt required", async (endpoint) => {
        const fetchRequest = vi.fn().mockResolvedValue(new Response("audio"));
        vi.stubGlobal("fetch", fetchRequest);
        await generatePlaygroundAudio(client, model(endpoint), {
            prompt: "",
            file,
            voice: "alloy",
        });
        expect(fetchRequest).toHaveBeenCalledTimes(1);
        const [url, request] = fetchRequest.mock.calls[0];
        expect(url).toBe(`https://example.test${endpoint}`);
        expect(await request.body.get("audio").text()).toBe("audio bytes");
        expect(request.body.get("model")).toBe("new-model-from-catalog");
    });

    it("preserves video input for isolation", async () => {
        const fetchRequest = vi.fn().mockResolvedValue(new Response("audio"));
        vi.stubGlobal("fetch", fetchRequest);
        await generatePlaygroundAudio(
            client,
            model("/v1/audio/voice-isolator", ["audio", "video"]),
            {
                prompt: "",
                file: new File(["video bytes"], "clip.mp4", {
                    type: "video/mp4",
                }),
            },
        );
        const uploaded = fetchRequest.mock.calls[0][1].body.get(
            "audio",
        ) as File;
        expect(uploaded.type).toBe("video/mp4");
        expect(await uploaded.text()).toBe("video bytes");
    });

    it("keeps transcription and its optional instructions working", async () => {
        const fetchRequest = vi
            .fn()
            .mockResolvedValue(Response.json({ text: "hello" }));
        vi.stubGlobal("fetch", fetchRequest);
        expect(
            await generatePlaygroundAudio(
                client,
                model("/v1/audio/transcriptions"),
                {
                    prompt: "Names: Polly",
                    file,
                },
            ),
        ).toEqual({ type: "text", text: "hello" });
        const [url, request] = fetchRequest.mock.calls[0];
        expect(url).toBe("https://example.test/v1/audio/transcriptions");
        expect(await request.body.get("file").text()).toBe("audio bytes");
        expect(request.body.get("prompt")).toBe("Names: Polly");
    });

    it.each([
        "/v1/audio/speech",
        "/audio/{text}",
    ])("keeps text-only speech working through %s", async (endpoint) => {
        const fetchRequest = vi.fn().mockResolvedValue(new Response("audio"));
        vi.stubGlobal("fetch", fetchRequest);
        await generatePlaygroundAudio(client, model(endpoint, ["text"]), {
            prompt: "hello",
            voice: "alloy",
        });
        expect(fetchRequest).toHaveBeenCalledTimes(1);
        const [url, request] = fetchRequest.mock.calls[0];
        if (endpoint === "/v1/audio/speech") {
            expect(JSON.parse(request.body)).toEqual({
                input: "hello",
                model: "new-model-from-catalog",
                voice: "alloy",
            });
        } else {
            expect(new URL(url).pathname).toBe("/audio/hello");
            expect(new URL(url).searchParams.get("voice")).toBe("alloy");
        }
    });

    it("blocks missing or unsupported inputs before uploading or generating", async () => {
        const fetchRequest = vi.fn();
        vi.stubGlobal("fetch", fetchRequest);
        expect(audioInputError(model("/v1/audio/voice-changer"), "")).toContain(
            "Upload",
        );
        expect(
            audioInputError(model("/v1/audio/transcriptions"), "", file),
        ).toBeNull();
        await expect(
            generatePlaygroundAudio(client, model("/future/audio"), {
                prompt: "",
                file,
            }),
        ).rejects.toThrow("not supported");
        await expect(
            generatePlaygroundAudio(
                client,
                model("/v1/audio/speech", ["text"]),
                { prompt: "hello", file },
            ),
        ).rejects.toThrow("does not accept");
        await expect(
            generatePlaygroundAudio(
                client,
                model("/v1/audio/speech", ["text", "audio"]),
                { prompt: "", file },
            ),
        ).rejects.toThrow("Add text");
        expect(fetchRequest).not.toHaveBeenCalled();
    });

    it("does not generate without the reference if its upload fails", async () => {
        const fetchRequest = vi
            .fn()
            .mockResolvedValue(new Response("Upload failed", { status: 500 }));
        vi.stubGlobal("fetch", fetchRequest);
        await expect(
            generatePlaygroundAudio(
                client,
                model("/v1/audio/speech", ["text", "audio"]),
                { prompt: "music", file },
            ),
        ).rejects.toThrow();
        expect(fetchRequest).toHaveBeenCalledTimes(1);
    });
});
