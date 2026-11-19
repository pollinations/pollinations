import { Pollinations } from "@pollinations/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAudioModelsInfo } from "../../../../shared/registry/model-info";
import { audioEndpoint } from "./audio-endpoint";
import {
    audioConstraintError,
    audioInputError,
    generatePlaygroundAudio,
    type ReferenceUploads,
    supportsAudioLength,
    transcriptionControls,
    uploadReference,
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
const video = new File(["video bytes"], "clip.mp4", { type: "video/mp4" });
afterEach(() => vi.unstubAllGlobals());

describe("catalog-driven audio requests", () => {
    it("supports the default speech route and registry overrides for audio uploads", () => {
        for (const entry of getAudioModelsInfo()) {
            if (
                !entry.input_modalities?.some(
                    (kind) => kind === "audio" || kind === "video",
                )
            )
                continue;
            expect(
                audioEndpoint({
                    // Gen lists speech for audio definitions without an endpoint override.
                    supportedEndpoints: entry.supported_endpoints ?? [
                        "/v1/audio/speech",
                    ],
                }),
                entry.name,
            ).toBeDefined();
        }
    });
    it("routes by endpoint, not a list of known model names", () => {
        expect(audioEndpoint(model("/v1/audio/voice-changer"))).toBe(
            "/v1/audio/voice-changer",
        );
        expect(audioEndpoint(model("/future/audio"))).toBeUndefined();
    });

    it("offers length only for music models with adjustable duration", () => {
        expect(
            supportsAudioLength({
                id: "google/lyria-3.5",
                allowedDurations: [],
            }),
        ).toBe(false);
        expect(
            supportsAudioLength({
                id: "sonilo/sonilo-1.1-sfx",
                allowedDurations: [],
            }),
        ).toBe(false);
        expect(
            supportsAudioLength({
                id: "google/lyria-3-clip-preview",
                allowedDurations: [30],
            }),
        ).toBe(false);
        expect(
            supportsAudioLength({
                id: "elevenlabs/eleven-text-to-sound-v3",
                allowedDurations: [],
            }),
        ).toBe(true);
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
                duration: 12.5,
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
            duration: 12.5,
            reference_audio: "https://media.pollinations.ai/reference",
        });
        expect(result.type).toBe("audio");
    });

    it("retries a failed upload and shares one reference URL across prompts", async () => {
        const fetchRequest = vi
            .fn()
            .mockResolvedValueOnce(new Response("Retry", { status: 503 }))
            .mockResolvedValueOnce(
                Response.json({
                    url: "https://media.pollinations.ai/reference",
                }),
            )
            .mockImplementation(async () => new Response("speech"));
        vi.stubGlobal("fetch", fetchRequest);
        const referenceUrls = new WeakMap() as ReferenceUploads;
        const speak = (prompt: string) =>
            generatePlaygroundAudio(
                client,
                model("/v1/audio/speech", ["text", "audio"]),
                { prompt, file, referenceUrls },
            );
        await expect(speak("First")).rejects.toThrow();
        await Promise.all([speak("First"), speak("Second")]);
        expect(
            fetchRequest.mock.calls.map(([url]) => new URL(url).pathname),
        ).toEqual([
            "/upload",
            "/upload",
            "/v1/audio/speech",
            "/v1/audio/speech",
        ]);
        for (const [, request] of fetchRequest.mock.calls.slice(2)) {
            expect(JSON.parse(request.body).reference_audio).toBe(
                "https://media.pollinations.ai/reference",
            );
        }
    });

    it("uploads the file again after the media retention period", async () => {
        const send = vi
            .fn()
            .mockResolvedValueOnce(Response.json({ url: "first" }))
            .mockResolvedValueOnce(Response.json({ url: "second" }));
        vi.stubGlobal("fetch", send);
        const cache: ReferenceUploads = new WeakMap();
        vi.useFakeTimers();
        try {
            await expect(uploadReference(client, file, cache)).resolves.toBe(
                "first",
            );
            vi.setSystemTime(Date.now() + 31 * 86400_000);
            await expect(uploadReference(client, file, cache)).resolves.toBe(
                "second",
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("omits inputs rejected by MAI with an older catalog", () => {
        expect(
            transcriptionControls({
                ...model("/v1/audio/transcriptions"),
                id: "microsoft/mai-transcribe-2",
            }),
        ).toEqual({ language: false, prompt: false });
    });

    it("uploads a video and sends it as the reference video", async () => {
        const fetchRequest = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({ url: "https://media.pollinations.ai/clip" }),
            )
            .mockResolvedValueOnce(
                new Response("sfx", {
                    headers: { "content-type": "audio/mpeg" },
                }),
            );
        vi.stubGlobal("fetch", fetchRequest);
        await generatePlaygroundAudio(
            client,
            model("/v1/audio/speech", ["text", "video"]),
            { prompt: "footsteps", file: video },
        );
        expect(JSON.parse(fetchRequest.mock.calls[1][1].body)).toEqual({
            input: "footsteps",
            model: "new-model-from-catalog",
            reference_video: "https://media.pollinations.ai/clip",
        });
    });

    it("classifies a file with an empty MIME type by its extension", async () => {
        const fetchRequest = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({ url: "https://media.pollinations.ai/clip" }),
            )
            .mockResolvedValueOnce(new Response("sfx"));
        vi.stubGlobal("fetch", fetchRequest);
        const sfx = model("/v1/audio/speech", ["text", "video"]);
        const mkv = new File(["video bytes"], "clip.MKV");
        expect(audioInputError(sfx, "footsteps", mkv)).toBeNull();
        await generatePlaygroundAudio(client, sfx, {
            prompt: "footsteps",
            file: mkv,
        });
        expect(JSON.parse(fetchRequest.mock.calls[1][1].body)).toEqual({
            input: "footsteps",
            model: "new-model-from-catalog",
            reference_video: "https://media.pollinations.ai/clip",
        });
        expect(
            audioInputError(sfx, "footsteps", new File(["a"], "take.mp3")),
        ).toContain("does not accept reference audio");
    });

    it.each(["/v1/audio/voice-changer", "/v1/audio/voice-isolator"])(
        "sends the file directly to %s with no prompt required",
        async (endpoint) => {
            const fetchRequest = vi
                .fn()
                .mockResolvedValue(new Response("audio"));
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
        },
    );

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

    it("posts stems directly and returns the ZIP archive for download", async () => {
        const archive = new Blob(["stem archive"], { type: "application/zip" });
        const send = vi.fn().mockResolvedValue(new Response(archive));
        vi.stubGlobal("fetch", send);
        const spec = model("/alpha/audio/stem-separation");
        expect(audioInputError(spec, "")).toContain("Upload");
        expect(audioInputError(spec, "", file)).toBeNull();
        const result = await generatePlaygroundAudio(client, spec, {
            prompt: "",
            file,
            stemVariationId: "two_stems_v1",
        });
        expect(send).toHaveBeenCalledTimes(1);
        const [url, request] = send.mock.calls[0];
        expect(url).toBe("https://example.test/alpha/audio/stem-separation");
        expect(request.body.get("file").name).toBe(file.name);
        expect(request.body.get("model")).toBe(spec.id);
        expect(request.body.get("stem_variation_id")).toBe("two_stems_v1");
        expect(result.type).toBe("stems");
        if (result.type === "stems") {
            expect(result.archive.type).toBe("application/zip");
            expect(await result.archive.text()).toBe("stem archive");
        }
    });

    it("keeps transcription and its optional instructions working", async () => {
        const fetchRequest = vi
            .fn()
            .mockResolvedValue(Response.json({ text: "hello" }));
        vi.stubGlobal("fetch", fetchRequest);
        expect(
            await generatePlaygroundAudio(
                client,
                {
                    ...model("/v1/audio/transcriptions"),
                    audioInputConstraints: {
                        transcription_options: ["prompt", "language"],
                    },
                },
                {
                    prompt: "Names: Polly",
                    file,
                    language: "de",
                },
            ),
        ).toEqual({ type: "text", text: "hello" });
        const [url, request] = fetchRequest.mock.calls[0];
        expect(url).toBe("https://example.test/v1/audio/transcriptions");
        expect(await request.body.get("file").text()).toBe("audio bytes");
        expect(request.body.get("prompt")).toBe("Names: Polly");
        expect(request.body.get("language")).toBe("de");
    });

    it.each([
        { options: undefined, prompt: "Polly", language: "de" },
        { options: [], prompt: null, language: null },
        { options: ["language"], prompt: null, language: "de" },
        { options: ["prompt"], prompt: "Polly", language: null },
    ] as const)(
        "submits the advertised transcription options ($options)",
        async ({ options, prompt, language }) => {
            const send = vi
                .fn()
                .mockResolvedValue(Response.json({ text: "hello" }));
            vi.stubGlobal("fetch", send);
            await generatePlaygroundAudio(
                client,
                {
                    ...model("/v1/audio/transcriptions"),
                    audioInputConstraints: options
                        ? { transcription_options: [...options] }
                        : undefined,
                },
                { file, prompt: "Polly", language: "de" },
            );
            const body = send.mock.calls[0][1].body as FormData;
            expect(body.get("prompt")).toBe(prompt);
            expect(body.get("language")).toBe(language);
        },
    );

    it.each(["/v1/audio/speech", "/audio/{text}"])(
        "keeps text-only speech working through %s",
        async (endpoint) => {
            const fetchRequest = vi
                .fn()
                .mockResolvedValue(new Response("audio"));
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
        },
    );

    it("reports missing or unsupported inputs", () => {
        expect(audioInputError(model("/v1/audio/voice-changer"), "")).toContain(
            "Upload",
        );
        expect(
            audioInputError(model("/v1/audio/transcriptions"), "", file),
        ).toBeNull();
        expect(audioInputError(model("/future/audio"), "", file)).toContain(
            "not supported",
        );
        expect(
            audioInputError(model("/v1/audio/speech", ["text"]), "hello", file),
        ).toContain("does not accept");
        expect(
            audioInputError(
                model("/v1/audio/speech", ["text", "audio"]),
                "",
                file,
            ),
        ).toContain("Add text");
    });

    it("accepts a video only where the catalog lists video input", () => {
        const sfx = model("/v1/audio/speech", ["text", "video"]);
        expect(audioInputError(sfx, "footsteps", video)).toBeNull();
        expect(audioInputError(sfx, "footsteps")).toContain("Upload a video");
        expect(audioInputError(sfx, "footsteps", file)).toContain(
            "does not accept reference audio",
        );
        expect(
            audioInputError(
                model("/v1/audio/speech", ["text", "audio"]),
                "music",
                video,
            ),
        ).toContain("does not accept reference video");
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

describe("catalog audio input constraints", () => {
    const rules = {
        min_seconds: 2,
        max_seconds: 8,
        max_total_seconds: 10,
        requires_reference_visual: true,
    };
    const next = new File(["sample"], "second.wav");
    const files = [file, next];
    function validate(
        first: number | null,
        second: number | null,
        visual = true,
    ) {
        return audioConstraintError(
            rules,
            files,
            new Map([
                [file, first],
                [next, second],
            ]),
            visual,
        );
    }
    it("checks clip duration, combined duration, and reference visuals independently", () => {
        expect(validate(2, 8)).toBeNull();
        expect(validate(1, 3)).toContain("at least 2");
        expect(validate(9, 2)).toContain("at most 8");
        expect(validate(4, 7)).toContain("10 seconds of audio in total");
        expect(validate(2, 3, false)).toContain("reference image or video");
    });
    it("waits for metadata and lets the API handle formats without a local preview", () => {
        expect(audioConstraintError(rules, files, new Map(), true)).toContain(
            "Reading",
        );
        expect(validate(null, 8)).toBeNull();
        expect(audioConstraintError(rules, [], new Map(), false)).toBeNull();
        expect(
            audioConstraintError(undefined, files, new Map(), false),
        ).toBeNull();
    });
});
