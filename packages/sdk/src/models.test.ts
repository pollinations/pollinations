import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchModelCatalog } from "./models.js";

function jsonResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => body,
    } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
        if (url.endsWith("/models")) {
            // Deliberately unsorted: forces sortModels to reorder by category,
            // and "tts" before "speech-from-chat" exercises the id tiebreak.
            return Promise.resolve(
                jsonResponse([
                    {
                        name: "realtime-voice",
                        title: "Realtime Voice",
                        category: "realtime",
                        input_modalities: ["text", "audio", "image"],
                        output_modalities: ["text", "audio"],
                        capabilities: ["tool_calling", "reasoning"],
                    },
                    {
                        name: "tts",
                        title: "Text To Speech",
                        category: "audio",
                        input_modalities: ["text"],
                        output_modalities: ["audio"],
                    },
                    {
                        name: "movie",
                        title: "Movie",
                        category: "video",
                        input_modalities: ["text", "image", "video"],
                        output_modalities: ["video"],
                        video_capabilities: ["start_frame", "end_frame"],
                        max_reference_images: 2,
                        max_reference_videos: 10,
                    },
                    {
                        name: "community/alice/deepseek",
                        title: "DeepSeek by @alice",
                        category: "text",
                        community: true,
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                    },
                    {
                        name: "embedding-small",
                        title: "Embedding Small",
                        category: "embedding",
                        input_modalities: ["text"],
                        output_modalities: ["embedding"],
                    },
                    {
                        name: "still",
                        title: "Still",
                        aliases: ["stable"],
                        category: "image",
                        brand: "Stability",
                        pricing: {
                            currency: "pollen",
                            completionImageTokens: "0.04",
                        },
                        context_length: 128000,
                        input_modalities: ["text"],
                        output_modalities: ["image"],
                        paid_only: true,
                    },
                    {
                        name: "speech-from-chat",
                        title: "Speech From Chat",
                        category: "audio",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                    },
                ]),
            );
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("fetchModelCatalog", () => {
    it("normalizes and sorts the public catalog; no key means no allowed set", async () => {
        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test",
        });

        // No apiKey: exactly one (anonymous) request, and an empty allow-set.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.test/models",
            expect.any(Object),
        );
        expect([...catalog.allowedModelIds]).toEqual([]);

        // Category drives classification; output is sorted by category then id.
        expect(
            catalog.models.map((model) => [model.id, model.category]),
        ).toEqual([
            ["still", "image"],
            ["movie", "video"],
            ["community/alice/deepseek", "text"],
            ["speech-from-chat", "audio"],
            ["tts", "audio"],
            ["embedding-small", "embedding"],
            ["realtime-voice", "realtime"],
        ]);

        const stillModel = catalog.models.find((model) => model.id === "still");
        expect(stillModel).toMatchObject({
            id: "still",
            name: "still",
            title: "Still",
            category: "image",
            brand: "Stability",
            aliases: ["stable"],
            inputModalities: ["text"],
            outputModalities: ["image"],
            videoCapabilities: [],
            capabilities: [],
            voices: [],
            paidOnly: true,
            tools: false,
            reasoning: false,
            contextLength: 128000,
            pricing: {
                currency: "pollen",
                completionImageTokens: "0.04",
            },
        });

        const movieModel = catalog.models.find((model) => model.id === "movie");
        expect(movieModel).toMatchObject({
            videoCapabilities: ["start_frame", "end_frame"],
            maxReferenceImages: 2,
            maxReferenceVideos: 10,
        });
        const communityModel = catalog.models.find(
            (model) => model.id === "community/alice/deepseek",
        );
        expect(communityModel).toMatchObject({
            category: "text",
            community: true,
            inputModalities: ["text"],
            outputModalities: ["text"],
        });
        // Curated catalog item — raw ModelInfo wire fields don't leak through.
        expect(stillModel).not.toHaveProperty("input_modalities");
        expect(stillModel).not.toHaveProperty("output_modalities");
        expect(movieModel).not.toHaveProperty("video_capabilities");
        expect(movieModel).not.toHaveProperty("max_reference_images");
        expect(movieModel).not.toHaveProperty("max_reference_videos");
        expect(stillModel).not.toHaveProperty("paid_only");
        expect(stillModel).not.toHaveProperty("context_length");
        expect(stillModel).not.toHaveProperty("maxInputChars");
        expect(stillModel).not.toHaveProperty("source");
    });

    it("drops models missing a title or category but keeps unknown categories", async () => {
        fetchMock.mockImplementation((url: string) => {
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    jsonResponse([
                        { name: "no-category", output_modalities: ["video"] },
                        { name: "no-title", category: "text" },
                        {
                            name: "new-category",
                            title: "New",
                            category: "hologram",
                        },
                        { name: "good", title: "Good", category: "text" },
                    ]),
                );
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test",
        });

        // Unknown categories pass through and sort after the known ones.
        expect(catalog.models.map((model) => model.id)).toEqual([
            "good",
            "new-category",
        ]);
    });

    it("fetches allowed models from the rich catalog endpoint only", async () => {
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
            if (url.endsWith("/models")) {
                const headers = init?.headers as
                    | Record<string, string>
                    | undefined;
                const isAuthenticated =
                    headers?.Authorization === "Bearer test-key";
                return Promise.resolve(
                    jsonResponse(
                        isAuthenticated
                            ? [
                                  {
                                      name: "paid-image",
                                      title: "Paid Image",
                                      category: "image",
                                      input_modalities: ["text"],
                                      output_modalities: ["image"],
                                  },
                              ]
                            : [
                                  {
                                      name: "free-text",
                                      title: "Free Text",
                                      category: "text",
                                      input_modalities: ["text"],
                                      output_modalities: ["text"],
                                  },
                              ],
                    ),
                );
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test",
            apiKey: "test-key",
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "https://example.test/models",
            expect.objectContaining({ headers: {} }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "https://example.test/models",
            expect.objectContaining({
                headers: { Authorization: "Bearer test-key" },
            }),
        );
        expect(catalog.models.map((model) => model.id)).toEqual(["free-text"]);
        expect([...catalog.allowedModelIds]).toEqual(["paid-image"]);
    });

    it("throws a PollinationsError when the catalog endpoint fails", async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

        await expect(
            fetchModelCatalog({ baseUrl: "https://example.test" }),
        ).rejects.toMatchObject({
            name: "PollinationsError",
            code: "MODEL_CATALOG",
            status: 503,
        });
    });
});
