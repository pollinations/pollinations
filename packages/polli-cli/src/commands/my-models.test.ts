import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { setOutputMode } from "../lib/output.js";
import { modelBody, myModelsCommand } from "./my-models.js";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
});

const queued = {
    effectiveAt: "2026-10-06T12:00:00.000Z",
    visibility: "public",
    paidOnly: false,
    imagePricing: "request",
    completionTextPrice: 0,
    promptTextPrice: 0.000001,
};

async function runList(pending: unknown) {
    setKeyOverride("sk_test");
    const stdout = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
    const stderr = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
    const model = {
        id: "model-id",
        modelId: "user/example",
        type: "proxy",
        visibility: "private",
        paidOnly: false,
        imagePricing: "request",
        completionTextPrice: 0.000002,
        promptTextPrice: 0.000001,
        pending,
    };
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ data: [model] })),
    );
    await myModelsCommand.parseAsync(["list"], { from: "user" });
    const text = (spy: typeof stdout) =>
        spy.mock.calls.map(([chunk]) => String(chunk)).join("");
    return { stdout: text(stdout), stderr: text(stderr) };
}

describe("my-models pending changes", () => {
    it("shows queued visibility and price changes with their effective time", async () => {
        const { stdout, stderr } = await runList(queued);
        expect(stdout).toContain("private");
        expect(stderr).toContain(
            "Changes queued for user/example, effective 2026-10-06T12:00:00.000Z: visibility private → public, completionTextPrice 0.000002 → 0",
        );
    });

    it("prints no notice without a pending change", async () => {
        const { stderr } = await runList(null);
        expect(stderr).not.toContain("Changes queued");
    });

    it("keeps the raw pending object in JSON output", async () => {
        setOutputMode("json");
        const { stdout } = await runList(queued);
        expect(JSON.parse(stdout)[0].pending).toEqual(queued);
    });
});

describe("modelBody", () => {
    it("builds image model registration fields supported by the API", () => {
        expect(
            modelBody(
                {
                    name: "image-provider",
                    title: "Image Provider",
                    baseUrl: "https://example.com/v1",
                    bearerToken: "upstream-token",
                    modality: "image",
                    imagePricing: "request",
                    inputModalities: "text,image",
                    fallbacks: "owner/backup, owner/secondary",
                    requiredSafety: "sexual,violence",
                    completionImagePrice: "0.01",
                },
                true,
            ),
        ).toEqual({
            name: "image-provider",
            title: "Image Provider",
            baseUrl: "https://example.com/v1",
            bearerToken: "upstream-token",
            modality: "image",
            imagePricing: "request",
            inputModalities: ["text", "image"],
            fallbacks: ["owner/backup", "owner/secondary"],
            requiredSafetyFeatures: ["sexual", "violence"],
            completionImagePrice: 0.01,
        });
    });

    it("declares a text endpoint without SSE only for --no-streaming", () => {
        expect(modelBody({ streaming: false }, false)).toEqual({
            advertised: { streaming: false },
        });
        expect(modelBody({ streaming: true }, false)).toEqual({});
        expect(modelBody({}, false)).toEqual({});
    });

    it("sends the paid-only choice only when the flag is given", () => {
        expect(modelBody({ visibility: "public" }, false)).toEqual({
            visibility: "public",
        });
        expect(modelBody({ paidOnly: true }, false)).toEqual({
            paidOnly: true,
        });
        expect(modelBody({ paidOnly: false }, false)).toEqual({
            paidOnly: false,
        });
    });

    it.each([
        "responses",
        "chat_completions",
    ])("registers one exact %s text endpoint without a base URL", (api) => {
        const url = "https://example.com/custom-endpoint?version=1";
        expect(
            modelBody(
                {
                    name: "text-provider",
                    title: "Text Provider",
                    api,
                    url,
                    bearerToken: "upstream-token",
                },
                true,
            ),
        ).toEqual({
            name: "text-provider",
            title: "Text Provider",
            api,
            url,
            bearerToken: "upstream-token",
        });
    });

    it("changes the selected API and URL together", () => {
        expect(
            modelBody(
                { api: "responses", url: "https://example.com/v1/responses" },
                false,
            ),
        ).toEqual({
            api: "responses",
            url: "https://example.com/v1/responses",
        });
    });

    it("maps required safety features and clears them with none", () => {
        expect(
            modelBody(
                { requiredSafety: "privacy, sexual,violence,shield" },
                false,
            ),
        ).toEqual({
            requiredSafetyFeatures: ["privacy", "sexual", "violence", "shield"],
        });
        expect(modelBody({ requiredSafety: "none" }, false)).toEqual({
            requiredSafetyFeatures: [],
        });
    });

    it("keeps modality out of updates while allowing image pricing changes", () => {
        expect(
            modelBody(
                {
                    imagePricing: "tokens",
                    promptImagePrice: "0.000001",
                    completionImagePrice: "0.02",
                    modality: "image",
                },
                false,
            ),
        ).toEqual({
            imagePricing: "tokens",
            promptImagePrice: 0.000001,
            completionImagePrice: 0.02,
        });
    });

    it("supports transcription model registration", () => {
        expect(
            modelBody(
                {
                    name: "speech-provider",
                    title: "Speech Provider",
                    baseUrl: "https://example.com/v1",
                    bearerToken: "upstream-token",
                    modality: "transcription",
                },
                true,
            ),
        ).toMatchObject({ modality: "transcription" });
    });

    it("supports speech model registration", () => {
        expect(
            modelBody(
                {
                    name: "tts-provider",
                    title: "TTS Provider",
                    baseUrl: "https://example.com/v1",
                    bearerToken: "upstream-token",
                    modality: "speech",
                    completionAudioPrice: "0.00003",
                },
                true,
            ),
        ).toMatchObject({ modality: "speech", completionAudioPrice: 0.00003 });
    });

    it("supports per-second video model registration", () => {
        expect(
            modelBody(
                {
                    name: "video-provider",
                    title: "Video Provider",
                    baseUrl: "https://example.com/v1",
                    bearerToken: "upstream-token",
                    modality: "video",
                    completionVideoPrice: "0.08",
                },
                true,
            ),
        ).toMatchObject({
            modality: "video",
            completionVideoPrice: 0.08,
        });
    });

    it("supports embedding model registration", () => {
        expect(
            modelBody(
                {
                    name: "embedding-provider",
                    title: "Embedding Provider",
                    baseUrl: "https://example.com/v1",
                    bearerToken: "upstream-token",
                    modality: "embedding",
                    promptTextPrice: "0.000001",
                },
                true,
            ),
        ).toMatchObject({
            modality: "embedding",
            promptTextPrice: 0.000001,
        });
    });
});
